import { NextRequest, NextResponse } from "next/server";
import { isValidTimeframe } from "@/lib/timeframes";

const API_KEY = process.env.TWELVE_DATA_API_KEY;
const BASE_URL = "https://api.twelvedata.com/time_series";

type TwelveDataValue = {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
};

function normalize(values: TwelveDataValue[] = []) {
  return values
    .map((x) => ({
      time: Math.floor(new Date(x.datetime).getTime() / 1000),
      open: Number(x.open),
      high: Number(x.high),
      low: Number(x.low),
      close: Number(x.close),
    }))
    .reverse();
}

function makeMockCandles(count = 300) {
  let price = 2350;
  const now = Math.floor(Date.now() / 1000);
  const out: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
  }> = [];

  for (let i = count; i > 0; i--) {
    const t = now - i * 60;
    const open = price;
    const move = (Math.random() - 0.5) * 6;
    const close = +(open + move).toFixed(2);
    const high = +(Math.max(open, close) + Math.random() * 2).toFixed(2);
    const low = +(Math.min(open, close) - Math.random() * 2).toFixed(2);
    out.push({ time: t, open: +open.toFixed(2), high, low, close });
    price = close;
  }

  return out;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawInterval = searchParams.get("interval") || "1min";
  const outputsize = searchParams.get("outputsize") || "300";
  const interval = isValidTimeframe(rawInterval) ? rawInterval : "1min";

  if (!API_KEY) {
    return NextResponse.json({
      ok: true,
      source: "mock",
      interval,
      candles: makeMockCandles(Number(outputsize)),
    });
  }

  const url =
    `${BASE_URL}?symbol=XAU/USD&interval=${interval}&outputsize=${outputsize}&apikey=${API_KEY}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = await res.json();

    if (!res.ok || data.status === "error") {
      return NextResponse.json(
        {
          ok: false,
          error: data.message || "Failed to fetch candles",
          raw: data,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      source: "twelvedata",
      interval,
      meta: data.meta,
      candles: normalize(data.values),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unexpected error while fetching candles",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 }
    );
  }
}
