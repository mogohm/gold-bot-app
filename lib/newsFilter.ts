import { NewsEvent } from "./types";

export function getNewsBlockReason(now: Date, events: NewsEvent[]): string | null {
  for (const event of events) {
    const diffMin = Math.abs((new Date(event.time).getTime() - now.getTime()) / 60000);
    if (event.impact === "high" && diffMin <= 30) return `High-impact news lock: ${event.title}`;
    if (event.impact === "medium" && diffMin <= 10) return `Medium-impact news lock: ${event.title}`;
  }
  return null;
}
