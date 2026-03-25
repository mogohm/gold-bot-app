import { SessionState } from "./types";

export function detectSession(input: string | Date): SessionState {
  const d = typeof input === "string" ? new Date(input) : input;
  const hour = d.getUTCHours();
  const inAsia = hour >= 0 && hour < 7;
  const inLondon = hour >= 7 && hour < 16;
  const inNY = hour >= 13 && hour < 22;
  return { inAsia, inLondon, inNY, overlapLondonNY: inLondon && inNY };
}
