"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CandlestickData, Time } from "lightweight-charts";
import XAUChart, { type BotMarker } from "@/components/XAUChart";
import { TIMEFRAME_OPTIONS, type TimeframeValue } from "@/lib/timeframes";

type RawCandle = {
  time: number | string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
};

type CandleResponse = {
  ok: boolean;
  candles?: RawCandle[];
  interval?: string;
  source?: string;
  error?: string;
};

type QuoteResponse = {
  ok: boolean;
  symbol?: string;
  price?: number;
  time?: number;
  source?: string;
  error?: string;
};

type SimOrder = {
  id: string;
  side: "BUY" | "SELL";
  status: "OPEN" | "TP" | "SL" | "CLOSED";
  entryTime: number;
  exitTime?: number;
  entryPrice: number;
  exitPrice?: number;
  tp: number;
  sl: number;
  pnl?: number;
  reason: string;
};

function getCandleRefreshMs(interval: TimeframeValue) {
  switch (interval) {
    case "1min":
      return 60_000;
    case "5min":
      return 120_000;
    case "15min":
      return 300_000;
    case "30min":
      return 600_000;
    case "1h":
      return 900_000;
    case "1day":
      return 3_600_000;
    case "1month":
      return 21_600_000;
    default:
      return 60_000;
  }
}

function getQuoteRefreshMs(interval: TimeframeValue) {
  switch (interval) {
    case "1min":
      return 5_000;
    case "5min":
      return 8_000;
    case "15min":
      return 12_000;
    case "30min":
      return 15_000;
    case "1h":
      return 20_000;
    case "1day":
      return 30_000;
    case "1month":
      return 60_000;
    default:
      return 5_000;
  }
}

function normalizeCandles(rows: RawCandle[] = []): CandlestickData<Time>[] {
  return rows
    .map((c) => ({
      time: Number(c.time) as Time,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
    }))
    .filter(
      (c) =>
        Number.isFinite(c.time as number) &&
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close)
    );
}

function getTfSeconds(interval: TimeframeValue) {
  switch (interval) {
    case "1min":
      return 60;
    case "5min":
      return 300;
    case "15min":
      return 900;
    case "30min":
      return 1800;
    case "1h":
      return 3600;
    case "1day":
      return 86400;
    case "1month":
      return 2592000;
    default:
      return 60;
  }
}

function createRealtimeCandles(
  baseCandles: CandlestickData<Time>[],
  livePrice: number | null,
  interval: TimeframeValue
): CandlestickData<Time>[] {
  if (!baseCandles.length || typeof livePrice !== "number") return baseCandles;

  const tfSeconds = getTfSeconds(interval);
  const nowSec = Math.floor(Date.now() / 1000);
  const activeBucket = Math.floor(nowSec / tfSeconds) * tfSeconds;

  const last = baseCandles[baseCandles.length - 1];
  const lastTime = Number(last.time);

  if (activeBucket > lastTime) {
    const nextCandle: CandlestickData<Time> = {
      time: activeBucket as Time,
      open: last.close,
      high: Math.max(last.close, livePrice),
      low: Math.min(last.close, livePrice),
      close: livePrice,
    };
    return [...baseCandles, nextCandle];
  }

  return [
    ...baseCandles.slice(0, -1),
    {
      ...last,
      high: Math.max(last.high, livePrice),
      low: Math.min(last.low, livePrice),
      close: livePrice,
    },
  ];
}

function sma(values: number[], period: number) {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(values[i]);
      continue;
    }
    const slice = values.slice(i - period + 1, i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return out;
}

function detectBotSignal(candles: CandlestickData<Time>[], livePrice: number | null) {
  if (candles.length < 25 || typeof livePrice !== "number") return null;

  const closes = candles.map((c) => c.close);
  const fast = sma(closes, 5);
  const slow = sma(closes, 20);

  const prevFast = fast[fast.length - 2];
  const prevSlow = slow[slow.length - 2];
  const currFast = fast[fast.length - 1];
  const currSlow = slow[slow.length - 1];
  const last = candles[candles.length - 1];
  const range = Math.max(last.high - last.low, 0.6);

  if (prevFast <= prevSlow && currFast > currSlow && livePrice >= last.close) {
    return {
      side: "BUY" as const,
      entry: livePrice,
      tp: +(livePrice + range * 1.4).toFixed(2),
      sl: +(livePrice - range * 0.9).toFixed(2),
      reason: "Fast SMA crossed above Slow SMA",
    };
  }

  if (prevFast >= prevSlow && currFast < currSlow && livePrice <= last.close) {
    return {
      side: "SELL" as const,
      entry: livePrice,
      tp: +(livePrice - range * 1.4).toFixed(2),
      sl: +(livePrice + range * 0.9).toFixed(2),
      reason: "Fast SMA crossed below Slow SMA",
    };
  }

  return null;
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function HomePage() {
  const [interval, setIntervalValue] = useState<TimeframeValue>("1min");
  const [baseCandles, setBaseCandles] = useState<CandlestickData<Time>[]>([]);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [loadingCandles, setLoadingCandles] = useState(true);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string>("unknown");
  const [lastQuoteAt, setLastQuoteAt] = useState<number | null>(null);
  const [lastCandlesAt, setLastCandlesAt] = useState<number | null>(null);
  const [orders, setOrders] = useState<SimOrder[]>([]);
  const [botEnabled, setBotEnabled] = useState(true);
  const [statusPulse, setStatusPulse] = useState(false);

  const loadingCandlesRef = useRef(false);
  const loadingQuoteRef = useRef(false);
  const lastSignalBucketRef = useRef<string>("");

  async function loadCandles(selectedInterval: TimeframeValue) {
    if (loadingCandlesRef.current) return;

    loadingCandlesRef.current = true;
    setLoadingCandles(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/market/candles?interval=${selectedInterval}&outputsize=200`,
        { cache: "no-store" }
      );

      const data: CandleResponse = await res.json();

      if (!res.ok || !data.ok || !data.candles) {
        setError(data.error || "Failed to load candles");
        setBaseCandles([]);
        setSource(data.source || "error");
        return;
      }

      const formatted = normalizeCandles(data.candles);

      if (formatted.length === 0) {
        setError("No valid candle data returned");
        setBaseCandles([]);
        setSource(data.source || "error");
        return;
      }

      setBaseCandles(formatted);
      setSource(data.source || "unknown");
      setLastCandlesAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load candles");
      setBaseCandles([]);
      setSource("error");
    } finally {
      setLoadingCandles(false);
      loadingCandlesRef.current = false;
    }
  }

  async function loadQuote() {
    if (loadingQuoteRef.current) return;

    loadingQuoteRef.current = true;
    setLoadingQuote(true);

    try {
      const res = await fetch(`/api/market/quote`, { cache: "no-store" });
      const data: QuoteResponse = await res.json();

      if (!res.ok || !data.ok || typeof data.price !== "number") {
        return;
      }

      setLivePrice(Number(data.price));
      setLastQuoteAt(Date.now());
    } catch {
      // keep UI alive
    } finally {
      setLoadingQuote(false);
      loadingQuoteRef.current = false;
    }
  }

  useEffect(() => {
    setOrders([]);
    lastSignalBucketRef.current = "";
    loadCandles(interval);
    loadQuote();
  }, [interval]);

  useEffect(() => {
    const candleTimer = setInterval(() => {
      loadCandles(interval);
    }, getCandleRefreshMs(interval));

    return () => clearInterval(candleTimer);
  }, [interval]);

  useEffect(() => {
    const quoteTimer = setInterval(() => {
      loadQuote();
    }, getQuoteRefreshMs(interval));

    return () => clearInterval(quoteTimer);
  }, [interval]);

  const candles = useMemo(
    () => createRealtimeCandles(baseCandles, livePrice, interval),
    [baseCandles, livePrice, interval]
  );

  useEffect(() => {
    if (!botEnabled) return;
    if (!candles.length || typeof livePrice !== "number") return;

    const signal = detectBotSignal(candles, livePrice);
    if (!signal) return;

    const last = candles[candles.length - 1];
    const bucketKey = `${interval}-${signal.side}-${Number(last.time)}`;

    const hasOpenOrder = orders.some((o) => o.status === "OPEN");
    if (hasOpenOrder) return;
    if (lastSignalBucketRef.current === bucketKey) return;

    const newOrder: SimOrder = {
      id: makeId(),
      side: signal.side,
      status: "OPEN",
      entryTime: Number(last.time),
      entryPrice: signal.entry,
      tp: signal.tp,
      sl: signal.sl,
      reason: signal.reason,
    };

    lastSignalBucketRef.current = bucketKey;
    setOrders((prev) => [newOrder, ...prev]);
    setStatusPulse(true);
  }, [candles, livePrice, botEnabled, interval, orders]);

  useEffect(() => {
    if (typeof livePrice !== "number") return;

    setOrders((prev) =>
      prev.map((order) => {
        if (order.status !== "OPEN") return order;

        if (order.side === "BUY") {
          if (livePrice >= order.tp) {
            return {
              ...order,
              status: "TP",
              exitTime: Math.floor(Date.now() / 1000),
              exitPrice: livePrice,
              pnl: +(livePrice - order.entryPrice).toFixed(2),
            };
          }
          if (livePrice <= order.sl) {
            return {
              ...order,
              status: "SL",
              exitTime: Math.floor(Date.now() / 1000),
              exitPrice: livePrice,
              pnl: +(livePrice - order.entryPrice).toFixed(2),
            };
          }
        }

        if (order.side === "SELL") {
          if (livePrice <= order.tp) {
            return {
              ...order,
              status: "TP",
              exitTime: Math.floor(Date.now() / 1000),
              exitPrice: livePrice,
              pnl: +(order.entryPrice - livePrice).toFixed(2),
            };
          }
          if (livePrice >= order.sl) {
            return {
              ...order,
              status: "SL",
              exitTime: Math.floor(Date.now() / 1000),
              exitPrice: livePrice,
              pnl: +(order.entryPrice - livePrice).toFixed(2),
            };
          }
        }

        return order;
      })
    );
  }, [livePrice]);

  useEffect(() => {
    const timer = setTimeout(() => setStatusPulse(false), 1200);
    return () => clearTimeout(timer);
  }, [orders]);

  const chartMarkers = useMemo<BotMarker[]>(() => {
    const out: BotMarker[] = [];

    for (const order of orders) {
      out.push({
        time: order.entryTime,
        position: order.side === "BUY" ? "belowBar" : "aboveBar",
        color: order.side === "BUY" ? "#22c55e" : "#ef4444",
        shape: order.side === "BUY" ? "arrowUp" : "arrowDown",
        text: `${order.side} ${order.entryPrice.toFixed(2)}`,
      });

      if (order.exitTime && typeof order.exitPrice === "number") {
        out.push({
          time: order.exitTime,
          position: "inBar",
          color: order.status === "TP" ? "#38bdf8" : "#f59e0b",
          shape: "circle",
          text: `${order.status} ${order.exitPrice.toFixed(2)}`,
        });
      }
    }

    return out;
  }, [orders]);

  const lastCandle = useMemo(() => candles[candles.length - 1], [candles]);
  const openOrder = orders.find((o) => o.status === "OPEN");
  const totalPnL = orders.reduce((sum, o) => sum + (o.pnl || 0), 0);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl p-4 md:p-8 space-y-6">
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                XAU/USD Realtime Bot Simulator
              </h1>
              <p className="mt-2 text-slate-300">
                Realtime moving candle + simulated bot entries and exits on chart.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {TIMEFRAME_OPTIONS.map((tf) => {
                const active = interval === tf.value;
                return (
                  <button
                    key={tf.value}
                    onClick={() => setIntervalValue(tf.value)}
                    className={`rounded-2xl border px-4 py-2 text-sm font-medium transition ${
                      active
                        ? "border-white bg-white text-slate-950"
                        : "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-500"
                    }`}
                  >
                    {tf.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          <div className="xl:col-span-3 rounded-3xl border border-slate-800 bg-slate-900 p-4 md:p-6 shadow-2xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Candlestick Chart</h2>
                <p className="text-sm text-slate-400">
                  Symbol: XAU/USD · Interval: {interval}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1 text-sm text-slate-300">
                  Source: {source}
                </span>
                <span className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1 text-sm text-slate-300">
                  Candles: {candles.length}
                </span>
                <button
                  onClick={() => setBotEnabled((v) => !v)}
                  className={`rounded-xl border px-3 py-1 text-sm ${
                    botEnabled
                      ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                      : "border-slate-700 bg-slate-950 text-slate-300"
                  }`}
                >
                  Bot {botEnabled ? "ON" : "OFF"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950 p-2">
              {error ? (
                <div className="flex h-[560px] items-center justify-center text-red-300 px-6 text-center">
                  {error}
                </div>
              ) : loadingCandles && candles.length === 0 ? (
                <div className="flex h-[560px] items-center justify-center text-slate-400">
                  Loading candles...
                </div>
              ) : candles.length === 0 ? (
                <div className="flex h-[560px] items-center justify-center text-slate-400">
                  No candle data available
                </div>
              ) : (
                <XAUChart
                  candles={candles}
                  livePrice={livePrice}
                  markers={chartMarkers}
                />
              )}
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
              <h2 className="text-xl font-semibold">Live Price</h2>
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="text-sm text-slate-400">XAU/USD</div>
                <div className="mt-2 text-3xl font-bold">
                  {typeof livePrice === "number" ? livePrice.toFixed(2) : "--"}
                </div>
                <div className="mt-2 text-sm text-slate-400">
                  {loadingQuote ? "Refreshing..." : `Polling every ${getQuoteRefreshMs(interval) / 1000}s`}
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
              <h2 className="text-xl font-semibold">Bot Status</h2>
              <div
                className={`mt-4 rounded-2xl border p-4 ${
                  openOrder
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-slate-800 bg-slate-950"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Engine</span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      botEnabled
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-slate-700 text-slate-300"
                    }`}
                  >
                    {botEnabled ? "RUNNING" : "PAUSED"}
                  </span>
                </div>

                <div className="mt-4">
                  {openOrder ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="relative flex h-3 w-3">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400"></span>
                        </span>
                        <span className="text-sm font-medium text-emerald-300">
                          Active simulated order
                        </span>
                      </div>
                      <div className={`${statusPulse ? "animate-pulse" : ""} rounded-2xl border border-emerald-500/30 bg-slate-950 p-3`}>
                        <div className="text-sm">Side: {openOrder.side}</div>
                        <div className="text-sm">Entry: {openOrder.entryPrice.toFixed(2)}</div>
                        <div className="text-sm">TP: {openOrder.tp.toFixed(2)}</div>
                        <div className="text-sm">SL: {openOrder.sl.toFixed(2)}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-400">
                      No active simulated order
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
              <h2 className="text-xl font-semibold">Summary</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <StatCard label="Open" value={lastCandle?.open} />
                <StatCard label="High" value={lastCandle?.high} />
                <StatCard label="Low" value={lastCandle?.low} />
                <StatCard label="Close" value={lastCandle?.close} />
              </div>
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm">
                <div>Total Orders: {orders.length}</div>
                <div className={totalPnL >= 0 ? "text-emerald-300" : "text-red-300"}>
                  Total PnL: {totalPnL.toFixed(2)}
                </div>
                <div>Last candles: {lastCandlesAt ? new Date(lastCandlesAt).toLocaleTimeString() : "--"}</div>
                <div>Last quote: {lastQuoteAt ? new Date(lastQuoteAt).toLocaleTimeString() : "--"}</div>
              </div>
            </section>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-xl font-semibold">Bot Activity</h2>
            <span className="text-sm text-slate-400">
              Simulated only · no broker connected
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-left">Side</th>
                  <th className="px-3 py-3 text-left">Entry</th>
                  <th className="px-3 py-3 text-left">TP</th>
                  <th className="px-3 py-3 text-left">SL</th>
                  <th className="px-3 py-3 text-left">Exit</th>
                  <th className="px-3 py-3 text-left">PnL</th>
                  <th className="px-3 py-3 text-left">Reason</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                      No simulated orders yet
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id} className="border-b border-slate-900">
                      <td className="px-3 py-3">
                        {order.status === "OPEN" ? (
                          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-300">
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
                            </span>
                            OPEN
                          </span>
                        ) : order.status === "TP" ? (
                          <span className="rounded-full bg-sky-500/15 px-3 py-1 text-sky-300">
                            TP HIT
                          </span>
                        ) : order.status === "SL" ? (
                          <span className="rounded-full bg-amber-500/15 px-3 py-1 text-amber-300">
                            SL HIT
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-700 px-3 py-1 text-slate-300">
                            CLOSED
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-3 font-medium ${order.side === "BUY" ? "text-emerald-300" : "text-red-300"}`}>
                        {order.side}
                      </td>
                      <td className="px-3 py-3">{order.entryPrice.toFixed(2)}</td>
                      <td className="px-3 py-3">{order.tp.toFixed(2)}</td>
                      <td className="px-3 py-3">{order.sl.toFixed(2)}</td>
                      <td className="px-3 py-3">
                        {typeof order.exitPrice === "number" ? order.exitPrice.toFixed(2) : "--"}
                      </td>
                      <td className={`px-3 py-3 ${typeof order.pnl === "number" && order.pnl >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                        {typeof order.pnl === "number" ? order.pnl.toFixed(2) : "--"}
                      </td>
                      <td className="px-3 py-3 text-slate-300">{order.reason}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number | undefined;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="mt-2 text-lg font-semibold">
        {typeof value === "number" ? value.toFixed(2) : "--"}
      </div>
    </div>
  );
}
