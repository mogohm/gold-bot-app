import { NextResponse } from "next/server";
import { fetchCalendar } from "@/lib/calendar";
import { fetchCandles, fetchQuote } from "@/lib/marketData";
import { calculateLiveSignal } from "@/lib/signalEngine";

export async function GET() {
  const [candles, quote, events] = await Promise.all([fetchCandles(), fetchQuote(), fetchCalendar()]);
  const signal = calculateLiveSignal({
    candles,
    quote,
    events,
    risk: { dayPnl: 0, consecutiveLosses: 0, cooldownRemaining: 0 },
  });
  return NextResponse.json({ candles, quote, events, signal });
}
