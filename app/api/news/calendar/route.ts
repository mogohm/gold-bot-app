import { NextResponse } from "next/server";
import { fetchCalendar } from "@/lib/calendar";

export async function GET() {
  const events = await fetchCalendar();
  return NextResponse.json({ events });
}
