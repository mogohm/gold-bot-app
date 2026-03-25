import { NextResponse } from "next/server";
import { fetchCandles } from "@/lib/marketData";

export async function GET() {
  const candles = await fetchCandles();
  return NextResponse.json({ candles });
}
