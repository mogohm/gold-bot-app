import { Candle, NewsEvent, Quote } from "./types";

export function generateMockCandles(points = 240, base = 2350): Candle[] {
  let price = base;
  const candles: Candle[] = [];
  for (let i = 0; i < points; i++) {
    const hour = i % 24;
    const active = (hour >= 7 && hour <= 10) || (hour >= 13 && hour <= 20);
    const volume = Math.round((400 + Math.random() * 500) * (active ? 1.5 : 0.8));
    const move = (Math.random() - 0.48) * (active ? 6 : 3) + Math.sin(i / 9) * 0.7;
    const open = price;
    const close = +(price + move).toFixed(2);
    const high = +(Math.max(open, close) + Math.random() * 2.2).toFixed(2);
    const low = +(Math.min(open, close) - Math.random() * 2.2).toFixed(2);
    const mid = close;
    const spread = +(0.25 + Math.random() * (active ? 0.35 : 0.7)).toFixed(2);
    candles.push({
      time: new Date(Date.now() - (points - i) * 60000).toISOString(),
      open: +open.toFixed(2),
      high,
      low,
      close,
      volume,
      bid: +(mid - spread / 2).toFixed(2),
      ask: +(mid + spread / 2).toFixed(2),
      spread,
    });
    price = close;
  }
  return candles;
}

export function generateMockQuote(symbol = "XAU/USD"): Quote {
  const mid = +(2350 + Math.random() * 30 - 10).toFixed(2);
  const spread = +(0.25 + Math.random() * 0.5).toFixed(2);
  return {
    symbol,
    bid: +(mid - spread / 2).toFixed(2),
    ask: +(mid + spread / 2).toFixed(2),
    mid,
    spread,
    time: new Date().toISOString(),
  };
}

export function generateMockNews(): NewsEvent[] {
  const now = Date.now();
  return [
    { id: "1", title: "US CPI", country: "US", time: new Date(now + 40 * 60000).toISOString(), impact: "high" },
    { id: "2", title: "Fed Speaker", country: "US", time: new Date(now + 180 * 60000).toISOString(), impact: "medium" },
    { id: "3", title: "BoE Statement", country: "UK", time: new Date(now + 360 * 60000).toISOString(), impact: "low" },
  ];
}
