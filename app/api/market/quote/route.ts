import { NextResponse } from "next/server";

const API_KEY = process.env.TWELVE_DATA_API_KEY;

let quoteCache: {
  price: number;
  time: number;
  source: string;
} | null = null;

const QUOTE_CACHE_MS = 10_000;

function makeMockQuote() {
  const price = +(2350 + (Math.random() - 0.5) * 10).toFixed(2);
  return {
    ok: true,
    source: "mock",
    symbol: "XAU/USD",
    price,
    time: Date.now(),
  };
}

export async function GET() {
  if (quoteCache && Date.now() - quoteCache.time < QUOTE_CACHE_MS) {
    return NextResponse.json({
      ok: true,
      source: `${quoteCache.source}-cache`,
      symbol: "XAU/USD",
      price: quoteCache.price,
      time: quoteCache.time,
    });
  }

  if (!API_KEY) {
    const mock = makeMockQuote();
    quoteCache = {
      price: mock.price,
      time: mock.time,
      source: "mock",
    };
    return NextResponse.json(mock);
  }

  try {
    const res = await fetch(
      `https://api.twelvedata.com/price?symbol=XAU/USD&apikey=${API_KEY}`,
      { cache: "no-store" }
    );

    const data = await res.json();

    if (!res.ok || data.status === "error") {
      return NextResponse.json(
        {
          ok: false,
          error: data.message || "Failed to fetch live price",
          raw: data,
        },
        { status: 500 }
      );
    }

    const payload = {
      ok: true,
      source: "twelvedata",
      symbol: "XAU/USD",
      price: Number(data.price),
      time: Date.now(),
    };

    quoteCache = {
      price: payload.price,
      time: payload.time,
      source: payload.source,
    };

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unexpected error while fetching live price",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 }
    );
  }
}
