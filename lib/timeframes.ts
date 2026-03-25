export const TIMEFRAME_OPTIONS = [
  { label: "1m", value: "1min" },
  { label: "5m", value: "5min" },
  { label: "15m", value: "15min" },
  { label: "30m", value: "30min" },
  { label: "1H", value: "1h" },
  { label: "1Day", value: "1day" },
  { label: "1M", value: "1month" },
] as const;

export type TimeframeValue = (typeof TIMEFRAME_OPTIONS)[number]["value"];

export function isValidTimeframe(value: string): value is TimeframeValue {
  return TIMEFRAME_OPTIONS.some((x) => x.value === value);
}
