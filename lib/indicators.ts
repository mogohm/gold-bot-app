export function ema(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

export function rsi(values: number[], period = 14): number[] {
  if (values.length < 2) return values.map(() => 50);
  const out = Array(values.length).fill(50);
  for (let i = period; i < values.length; i++) {
    let gains = 0;
    let losses = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = values[j] - values[j - 1];
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }
    const rs = losses === 0 ? 100 : gains / losses;
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
}

export function atr(high: number[], low: number[], close: number[], period = 14): number[] {
  const tr: number[] = [];
  for (let i = 0; i < high.length; i++) {
    if (i === 0) tr.push(high[i] - low[i]);
    else tr.push(Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1])));
  }
  return ema(tr, period);
}
