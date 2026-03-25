import { generateMockNews } from "./mockData";
import { NewsEvent } from "./types";

const TE = "https://api.tradingeconomics.com/calendar";

export async function fetchCalendar(): Promise<NewsEvent[]> {
  const apiKey = process.env.TRADING_ECONOMICS_API_KEY;
  if (!apiKey) return generateMockNews();

  const url = `${TE}?c=${apiKey}&f=json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return generateMockNews();
  const json = await res.json();

  return (json || [])
    .filter((x: Record<string, string>) => ["United States", "United Kingdom"].includes(x.Country || ""))
    .slice(0, 25)
    .map((x: Record<string, string>, i: number) => ({
      id: String(x.CalendarId || i),
      title: String(x.Event || "Unknown Event"),
      country: x.Country === "United States" ? "US" : x.Country === "United Kingdom" ? "UK" : String(x.Country || "NA"),
      time: new Date(x.Date || Date.now()).toISOString(),
      impact: x.Importance === 3 ? "high" : x.Importance === 2 ? "medium" : "low",
    }));
}
