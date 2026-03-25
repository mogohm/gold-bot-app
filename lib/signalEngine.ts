import { atr, ema, rsi } from "./indicators";
import { getNewsBlockReason } from "./newsFilter";
import { checkRiskGuard } from "./riskGuard";
import { detectSession } from "./session";
import { estimateSlippage } from "./slippage";
import { Candle, NewsEvent, Quote, RiskState, SignalDecision, StrategySettings } from "./types";

export const defaultSettings: StrategySettings = {
  lotSize: 3,
  stopLoss: 3.5,
  takeProfit: 5.5,
  pointValue: 10,
  volumeThreshold: 700,
  minScore: 70,
  maxSpreadAbs: 0.8,
  extremeSpreadAbs: 1.2,
  maxDailyLoss: 500,
  maxConsecutiveLosses: 3,
  cooldownBars: 3,
  maxBarsHold: 6,
};

export function calculateLiveSignal(params: {
  candles: Candle[];
  quote: Quote;
  events: NewsEvent[];
  risk: RiskState;
  settings?: Partial<StrategySettings>;
}): SignalDecision {
  const settings = { ...defaultSettings, ...params.settings };
  const { candles, quote, events, risk } = params;
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const fast = ema(closes, 9);
  const slow = ema(closes, 21);
  const trend = ema(closes, 50);
  const rsis = rsi(closes, 14);
  const atrs = atr(highs, lows, closes, 14);

  const row = candles[candles.length - 1];
  const prevIndex = Math.max(0, candles.length - 2);
  const session = detectSession(row.time);
  const reasons: string[] = [];
  let longScore = 0;
  let shortScore = 0;

  if (fast.at(-1)! > slow.at(-1)! && row.close > trend.at(-1)!) {
    longScore += 28;
    reasons.push("trend up");
  }
  if (fast.at(-1)! < slow.at(-1)! && row.close < trend.at(-1)!) {
    shortScore += 28;
    reasons.push("trend down");
  }
  if (fast[prevIndex] <= slow[prevIndex] && fast.at(-1)! > slow.at(-1)!) longScore += 20;
  if (fast[prevIndex] >= slow[prevIndex] && fast.at(-1)! < slow.at(-1)!) shortScore += 20;
  if (rsis.at(-1)! >= 53 && rsis.at(-1)! <= 72) longScore += 15;
  if (rsis.at(-1)! <= 47 && rsis.at(-1)! >= 28) shortScore += 15;
  if (row.volume >= settings.volumeThreshold) {
    longScore += 12;
    shortScore += 12;
    reasons.push("high volume");
  }
  if (session.inLondon || session.inNY) {
    longScore += 10;
    shortScore += 10;
    reasons.push("active session");
  }
  if (session.overlapLondonNY) {
    longScore += 10;
    shortScore += 10;
    reasons.push("london/ny overlap");
  }

  const newsLock = getNewsBlockReason(new Date(row.time), events);
  const riskBlock = checkRiskGuard(risk, quote.spread, settings);
  const isSpreadBlocked = quote.spread > settings.maxSpreadAbs;
  const isBlocked = Boolean(newsLock || riskBlock.blocked || isSpreadBlocked);
  const blockedReason = newsLock || riskBlock.reason || (isSpreadBlocked ? "Spread too wide" : undefined);

  const volMin = Math.min(...candles.map((c) => c.volume));
  const volMax = Math.max(...candles.map((c) => c.volume));
  const volumeScore = volMax === volMin ? 1 : (row.volume - volMin) / (volMax - volMin);
  const slippage = estimateSlippage({
    spread: quote.spread,
    atr: atrs.at(-1) || 0,
    volumeScore,
    isNewsWindow: Boolean(newsLock),
  });

  const score = Math.max(longScore, shortScore);
  if (isBlocked || score < settings.minScore) {
    return {
      signal: "WAIT",
      score,
      reason: blockedReason ? [...reasons, blockedReason] : [...reasons, "score too low"],
      blocked: true,
      blockedReason,
      session,
      slippage,
    };
  }

  return {
    signal: longScore >= shortScore ? "BUY" : "SELL",
    score,
    reason: reasons,
    blocked: false,
    session,
    slippage,
  };
}
