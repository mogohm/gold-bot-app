import { NextResponse } from "next/server";

const API_KEY = process.env.TWELVE_DATA_API_KEY;

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
  if (!API_KEY) {
    return NextResponse.json(makeMockQuote());
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

    return NextResponse.json({
      ok: true,
      source: "twelvedata",
      symbol: "XAU/USD",
      price: Number(data.price),
      time: Date.now(),
    });
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
