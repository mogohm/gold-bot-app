import { NextResponse } from "next/server";
import { fetchQuote } from "@/lib/marketData";

export async function GET() {
  const quote = await fetchQuote();
  return NextResponse.json({ quote });
}
