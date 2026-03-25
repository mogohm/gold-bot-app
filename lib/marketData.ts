import { generateMockCandles, generateMockQuote } from "./mockData";
import { Candle, Quote } from "./types";

const TWELVE = "https://api.twelvedata.com";

export async function fetchCandles(symbol = "XAU/USD", interval = "1min", outputsize = 240): Promise<Candle[]> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return generateMockCandles(outputsize);

  const url = `${TWELVE}/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return generateMockCandles(outputsize);
  const json = await res.json();
  if (!json.values) return generateMockCandles(outputsize);

  return json.values.reverse().map((r: Record<string, string>) => ({
    time: new Date(r.datetime).toISOString(),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume || 0),
  }));
}

export async function fetchQuote(symbol = "XAU/USD"): Promise<Quote> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return generateMockQuote(symbol);

  const url = `${TWELVE}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return generateMockQuote(symbol);
  const json = await res.json();
  const mid = Number(json.close || json.price || 0);
  const spread = Number(json.spread || 0.35);
  return {
    symbol,
    bid: Number(json.bid || (mid - spread / 2).toFixed(2)),
    ask: Number(json.ask || (mid + spread / 2).toFixed(2)),
    mid,
    spread,
    time: new Date().toISOString(),
  };
}
