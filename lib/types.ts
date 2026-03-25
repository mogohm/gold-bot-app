export type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  bid?: number;
  ask?: number;
  spread?: number;
};

export type Quote = {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  time: string;
};

export type NewsEvent = {
  id: string;
  title: string;
  country: string;
  time: string;
  impact: "high" | "medium" | "low";
};

export type SessionState = {
  inAsia: boolean;
  inLondon: boolean;
  inNY: boolean;
  overlapLondonNY: boolean;
};

export type SignalDecision = {
  signal: "BUY" | "SELL" | "WAIT";
  score: number;
  reason: string[];
  blocked: boolean;
  blockedReason?: string;
  session: SessionState;
  slippage: number;
};

export type StrategySettings = {
  lotSize: number;
  stopLoss: number;
  takeProfit: number;
  pointValue: number;
  volumeThreshold: number;
  minScore: number;
  maxSpreadAbs: number;
  extremeSpreadAbs: number;
  maxDailyLoss: number;
  maxConsecutiveLosses: number;
  cooldownBars: number;
  maxBarsHold: number;
};

export type RiskState = {
  dayPnl: number;
  consecutiveLosses: number;
  cooldownRemaining: number;
};
