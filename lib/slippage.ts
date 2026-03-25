export function estimateSlippage(params: {
  spread: number;
  atr: number;
  volumeScore: number;
  isNewsWindow: boolean;
}): number {
  const { spread, atr, volumeScore, isNewsWindow } = params;
  let slip = spread * 0.2 + atr * 0.03;
  if (volumeScore < 0.4) slip += 0.15;
  if (isNewsWindow) slip += 0.25;
  return Number(slip.toFixed(2));
}
