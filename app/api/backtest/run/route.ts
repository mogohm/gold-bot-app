import { NextResponse } from "next/server";
import { fetchCalendar } from "@/lib/calendar";
import { fetchCandles, fetchQuote } from "@/lib/marketData";
import { calculateLiveSignal, defaultSettings } from "@/lib/signalEngine";
import { Candle } from "@/lib/types";

function runBacktest(candles: Candle[]) {
  let balance = 10000;
  let openTrade: null | {
    side: "BUY" | "SELL";
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    score: number;
    entryIndex: number;
  } = null;
  const trades: Array<Record<string, unknown>> = [];
  const equity: Array<{ index: number; equity: number }> = [];
  let dayPnl = 0;
  let consecutiveLosses = 0;
  let cooldownRemaining = 0;

  for (let i = 55; i < candles.length; i++) {
    const slice = candles.slice(0, i + 1);
    const quote = {
      symbol: "XAU/USD",
      bid: slice.at(-1)?.bid || slice.at(-1)!.close - 0.2,
      ask: slice.at(-1)?.ask || slice.at(-1)!.close + 0.2,
      mid: slice.at(-1)!.close,
      spread: slice.at(-1)?.spread || 0.4,
      time: slice.at(-1)!.time,
    };
    const signal = calculateLiveSignal({
      candles: slice,
      quote,
      events: [],
      risk: { dayPnl, consecutiveLosses, cooldownRemaining },
      settings: defaultSettings,
    });

    const row = slice.at(-1)!;
    if (!openTrade && !signal.blocked && (signal.signal === "BUY" || signal.signal === "SELL")) {
      const entryPrice = signal.signal === "BUY" ? quote.ask + signal.slippage : quote.bid - signal.slippage;
      openTrade = {
        side: signal.signal,
        entryPrice: Number(entryPrice.toFixed(2)),
        stopLoss: Number((signal.signal === "BUY" ? entryPrice - defaultSettings.stopLoss : entryPrice + defaultSettings.stopLoss).toFixed(2)),
        takeProfit: Number((signal.signal === "BUY" ? entryPrice + defaultSettings.takeProfit : entryPrice - defaultSettings.takeProfit).toFixed(2)),
        score: signal.score,
        entryIndex: i,
      };
    }

    if (openTrade) {
      const holdBars = i - openTrade.entryIndex;
      const hitTP = openTrade.side === "BUY" ? row.high >= openTrade.takeProfit : row.low <= openTrade.takeProfit;
      const hitSL = openTrade.side === "BUY" ? row.low <= openTrade.stopLoss : row.high >= openTrade.stopLoss;
      const timeout = holdBars >= defaultSettings.maxBarsHold;
      if (hitTP || hitSL || timeout) {
        let exitPrice = row.close;
        let exitReason = "timeout";
        if (hitTP) {
          exitPrice = openTrade.takeProfit - signal.slippage;
          exitReason = "take profit";
        }
        if (hitSL) {
          exitPrice = openTrade.stopLoss - signal.slippage;
          exitReason = "stop loss";
        }
        const points = openTrade.side === "BUY" ? exitPrice - openTrade.entryPrice : openTrade.entryPrice - exitPrice;
        const pnl = Number((points * defaultSettings.pointValue * defaultSettings.lotSize).toFixed(2));
        balance = Number((balance + pnl).toFixed(2));
        dayPnl = Number((dayPnl + pnl).toFixed(2));
        consecutiveLosses = pnl <= 0 ? consecutiveLosses + 1 : 0;
        cooldownRemaining = pnl <= 0 ? defaultSettings.cooldownBars : 0;
        trades.push({ ...openTrade, exitPrice: Number(exitPrice.toFixed(2)), pnl, exitReason });
        openTrade = null;
      }
    }

    if (cooldownRemaining > 0) cooldownRemaining -= 1;
    equity.push({ index: i, equity: balance });
  }

  const wins = trades.filter((t) => Number(t.pnl) > 0).length;
  return {
    summary: {
      trades: trades.length,
      winRate: trades.length ? Number(((wins / trades.length) * 100).toFixed(1)) : 0,
      pnl: Number((balance - 10000).toFixed(2)),
      balance,
    },
    equity,
    trades: trades.reverse(),
  };
}

export async function POST() {
  const [candles] = await Promise.all([fetchCandles( "XAU/USD", "1min", 240), fetchQuote(), fetchCalendar()]);
  return NextResponse.json(runBacktest(candles));
}
