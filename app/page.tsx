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
      return 60000;
    case "5min":
      return 120000;
    case "15min":
      return 300000;
    case "30min":
      return 600000;
    case "1h":
      return 900000;
    case "1day":
      return 3600000;
    case "1month":
      return 21600000;
    default:
      return 60000;
  }
}

function getQuoteRefreshMs(interval: TimeframeValue) {
  switch (interval) {
    case "1min":
      return 5000;
    case "5min":
      return 8000;
    case "15min":
      return 12000;
    case "30min":
      return 15000;
    case "1h":
      return 20000;
    case "1day":
      return 30000;
    case "1month":
      return 60000;
    default:
      return 5000;
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

function Panel({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-slate-700 bg-slate-900 shadow-xl ${className}`}>
      <div className="border-b border-slate-700 px-4 py-3">
        <div className="text-sm font-semibold tracking-wide text-white">{title}</div>
        {subtitle ? <div className="mt-1 text-xs text-slate-400">{subtitle}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
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
      //
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
        time: order.entryTime as Time,
        position: order.side === "BUY" ? "belowBar" : "aboveBar",
        color: order.side === "BUY" ? "#22c55e" : "#ef4444",
        shape: order.side === "BUY" ? "arrowUp" : "arrowDown",
        text: `${order.side} ${order.entryPrice.toFixed(2)}`,
      });

      if (order.exitTime && typeof order.exitPrice === "number") {
        out.push({
          time: order.exitTime as Time,
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
    <main className="h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="mx-auto flex h-screen max-w-[1920px] flex-col gap-3 p-3">
        <Panel
          title="XAU/USD BOT SIMULATOR DASHBOARD"
          subtitle="Realtime chart · simulated bot entry/exit · FullHD single-screen layout"
          className="shrink-0"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5 xl:grid-cols-6">
              <MiniStat label="SOURCE" value={source} />
              <MiniStat
                label="LIVE PRICE"
                value={typeof livePrice === "number" ? livePrice.toFixed(2) : "--"}
              />
              <MiniStat label="CANDLES" value={String(candles.length)} />
              <MiniStat
                label="LAST QUOTE"
                value={lastQuoteAt ? new Date(lastQuoteAt).toLocaleTimeString() : "--"}
              />
              <MiniStat
                label="LAST CANDLE"
                value={lastCandlesAt ? new Date(lastCandlesAt).toLocaleTimeString() : "--"}
              />
              <MiniStat label="TOTAL PNL" value={totalPnL.toFixed(2)} />
            </div>

            <div className="flex flex-wrap gap-2">
              {TIMEFRAME_OPTIONS.map((tf) => {
                const active = interval === tf.value;
                return (
                  <button
                    key={tf.value}
                    onClick={() => setIntervalValue(tf.value)}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                      active
                        ? "border-white bg-white text-slate-950"
                        : "border-slate-700 bg-slate-950 text-slate-200 hover:border-slate-500"
                    }`}
                  >
                    {tf.label}
                  </button>
                );
              })}
              <button
                onClick={() => setBotEnabled((v) => !v)}
                className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                  botEnabled
                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                    : "border-slate-700 bg-slate-950 text-slate-300"
                }`}
              >
                BOT {botEnabled ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        </Panel>

        <div className="grid min-h-0 flex-1 grid-cols-12 gap-3">
          <div className="col-span-12 min-h-0 xl:col-span-9">
            <Panel
              title="PRICE CHART"
              subtitle={`Symbol: XAU/USD · Interval: ${interval} · Realtime candle simulation on last bar`}
              className="flex h-full min-h-0 flex-col"
            >
              <div className="min-h-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 p-2">
                {error ? (
                  <div className="flex h-full items-center justify-center text-center text-red-300">
                    {error}
                  </div>
                ) : loadingCandles && candles.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-slate-400">
                    Loading candles...
                  </div>
                ) : candles.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-slate-400">
                    No candle data available
                  </div>
                ) : (
                  <XAUChart candles={candles} livePrice={livePrice} markers={chartMarkers} />
                )}
              </div>
            </Panel>
          </div>

          <div className="col-span-12 grid min-h-0 grid-rows-3 gap-3 xl:col-span-3">
            <Panel
              title="LIVE MARKET STATUS"
              subtitle="Current market information"
              className="min-h-0"
            >
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="OPEN" value={lastCandle?.open} />
                <StatCard label="HIGH" value={lastCandle?.high} />
                <StatCard label="LOW" value={lastCandle?.low} />
                <StatCard label="CLOSE" value={lastCandle?.close} />
              </div>
              <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="text-xs text-slate-400">QUOTE POLLING</div>
                <div className="mt-1 text-sm text-slate-200">
                  {loadingQuote ? "Refreshing..." : `Every ${getQuoteRefreshMs(interval) / 1000} sec`}
                </div>
              </div>
            </Panel>

            <Panel
              title="BOT STATUS"
              subtitle="Order engine and active execution status"
              className="min-h-0"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm text-slate-400">ENGINE</span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    botEnabled
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-slate-700 text-slate-300"
                  }`}
                >
                  {botEnabled ? "RUNNING" : "PAUSED"}
                </span>
              </div>

              {openOrder ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400"></span>
                    </span>
                    <span className="text-sm font-medium text-emerald-300">
                      ACTIVE SIMULATED ORDER
                    </span>
                  </div>

                  <div
                    className={`rounded-xl border border-emerald-500/30 bg-slate-950 p-3 ${
                      statusPulse ? "animate-pulse" : ""
                    }`}
                  >
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <InfoLine label="SIDE" value={openOrder.side} />
                      <InfoLine label="STATUS" value={openOrder.status} />
                      <InfoLine label="ENTRY" value={openOrder.entryPrice.toFixed(2)} />
                      <InfoLine label="TP" value={openOrder.tp.toFixed(2)} />
                      <InfoLine label="SL" value={openOrder.sl.toFixed(2)} />
                      <InfoLine
                        label="REASON"
                        value={openOrder.reason}
                        full
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                  No active simulated order
                </div>
              )}
            </Panel>

            <Panel
              title="SYSTEM SUMMARY"
              subtitle="Quick overview"
              className="min-h-0"
            >
              <div className="grid grid-cols-2 gap-3 text-sm">
                <SummaryTile label="TOTAL ORDERS" value={String(orders.length)} />
                <SummaryTile
                  label="OPEN ORDERS"
                  value={String(orders.filter((o) => o.status === "OPEN").length)}
                />
                <SummaryTile
                  label="WIN ORDERS"
                  value={String(orders.filter((o) => o.status === "TP").length)}
                />
                <SummaryTile
                  label="LOSS ORDERS"
                  value={String(orders.filter((o) => o.status === "SL").length)}
                />
              </div>
            </Panel>
          </div>
        </div>

        <Panel
          title="BOT ACTIVITY LOG"
          subtitle="Simulated orders only · no broker connected"
          className="min-h-0 shrink-0"
        >
          <div className="max-h-[210px] overflow-auto rounded-xl border border-slate-800">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="px-3 py-3 text-left">STATUS</th>
                  <th className="px-3 py-3 text-left">SIDE</th>
                  <th className="px-3 py-3 text-left">ENTRY</th>
                  <th className="px-3 py-3 text-left">TP</th>
                  <th className="px-3 py-3 text-left">SL</th>
                  <th className="px-3 py-3 text-left">EXIT</th>
                  <th className="px-3 py-3 text-left">PNL</th>
                  <th className="px-3 py-3 text-left">REASON</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
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
        </Panel>
      </div>
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2">
      <div className="text-[10px] font-medium tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
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
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
      <div className="text-[11px] tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-base font-semibold text-white">
        {typeof value === "number" ? value.toFixed(2) : "--"}
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
      <div className="text-[11px] tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function InfoLine({
  label,
  value,
  full = false,
}: {
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-[11px] tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-white break-words">{value}</div>
    </div>
  );
}
