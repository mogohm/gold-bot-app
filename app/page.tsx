"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CandlestickData, Time } from "lightweight-charts";
import XAUChart, { type BotMarker } from "@/components/XAUChart";
import { TIMEFRAME_OPTIONS, type TimeframeValue } from "@/lib/timeframes";
import styles from "./page.module.css";

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

export default function HomePage() {
  const [interval, setIntervalValue] = useState<TimeframeValue>("5min");
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
    <main className={styles.screen}>
      <div className={styles.wrapperCompact}>
        <div className={styles.topBar}>
          <div>
            <div className={styles.headerTitle}>XAU/USD BOT SIMULATOR DASHBOARD</div>
            <div className={styles.headerSub}>
              Realtime chart · simulated orders · compact FullHD layout
            </div>
          </div>

          <div className={styles.toolbar}>
            {TIMEFRAME_OPTIONS.map((tf) => (
              <button
                key={tf.value}
                onClick={() => setIntervalValue(tf.value)}
                className={`${styles.timeBtn} ${interval === tf.value ? styles.timeBtnActive : ""}`}
              >
                {tf.label}
              </button>
            ))}
            <button
              onClick={() => setBotEnabled((v) => !v)}
              className={`${styles.botBtn} ${botEnabled ? styles.botOn : styles.botOff}`}
            >
              BOT {botEnabled ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        <div className={styles.statsCompact}>
          <MiniStat label="SOURCE" value={source} />
          <MiniStat label="LIVE" value={typeof livePrice === "number" ? livePrice.toFixed(2) : "--"} />
          <MiniStat label="CANDLES" value={String(candles.length)} />
          <MiniStat label="QUOTE" value={lastQuoteAt ? new Date(lastQuoteAt).toLocaleTimeString() : "--"} />
          <MiniStat label="CANDLE" value={lastCandlesAt ? new Date(lastCandlesAt).toLocaleTimeString() : "--"} />
          <MiniStat label="PNL" value={totalPnL.toFixed(2)} />
        </div>

        <div className={styles.mainGridCompact}>
          <section className={styles.chartPanelCompact}>
            <div className={styles.panelHeaderCompact}>
              <div>
                <div className={styles.panelTitle}>PRICE CHART</div>
                <div className={styles.panelSub}>XAU/USD · {interval}</div>
              </div>
            </div>

            <div className={styles.chartBodyCompact}>
              {error ? (
                <div className={styles.centerMessageError}>{error}</div>
              ) : loadingCandles && candles.length === 0 ? (
                <div className={styles.centerMessage}>Loading candles...</div>
              ) : candles.length === 0 ? (
                <div className={styles.centerMessage}>No candle data available</div>
              ) : (
                <XAUChart candles={candles} livePrice={livePrice} markers={chartMarkers} />
              )}
            </div>
          </section>

          <aside className={styles.sideCompact}>
            <section className={styles.sideCardCompact}>
              <div className={styles.panelHeaderCompact}>
                <div className={styles.panelTitle}>MARKET</div>
                <div className={styles.panelSub}>Current values</div>
              </div>
              <div className={styles.miniGrid}>
                <StatCard label="OPEN" value={lastCandle?.open} />
                <StatCard label="HIGH" value={lastCandle?.high} />
                <StatCard label="LOW" value={lastCandle?.low} />
                <StatCard label="CLOSE" value={lastCandle?.close} />
              </div>
              <div className={styles.inlineInfo}>
                Polling: {loadingQuote ? "Refreshing..." : `${getQuoteRefreshMs(interval) / 1000}s`}
              </div>
            </section>

            <section className={styles.sideCardCompact}>
              <div className={styles.panelHeaderCompact}>
                <div className={styles.panelTitle}>BOT STATUS</div>
                <div className={styles.panelSub}>Execution</div>
              </div>

              <div className={styles.statusCompact}>
                <span className={styles.badgeLabel}>ENGINE</span>
                <span className={`${styles.badge} ${botEnabled ? styles.badgeGreen : styles.badgeGray}`}>
                  {botEnabled ? "RUNNING" : "PAUSED"}
                </span>
              </div>

              {openOrder ? (
                <div className={styles.activeCompact}>
                  <div className={styles.activeHeaderCompact}>
                    <span className={styles.pingDotWrap}>
                      <span className={styles.pingDot}></span>
                      <span className={styles.pingDotCore}></span>
                    </span>
                    <span className={styles.activeText}>ACTIVE ORDER</span>
                  </div>
                  <div className={styles.compactInfoList}>
                    <CompactLine label="SIDE" value={openOrder.side} />
                    <CompactLine label="ENTRY" value={openOrder.entryPrice.toFixed(2)} />
                    <CompactLine label="TP" value={openOrder.tp.toFixed(2)} />
                    <CompactLine label="SL" value={openOrder.sl.toFixed(2)} />
                  </div>
                </div>
              ) : (
                <div className={styles.emptyCompact}>No active simulated order</div>
              )}
            </section>

            <section className={styles.sideCardCompact}>
              <div className={styles.panelHeaderCompact}>
                <div className={styles.panelTitle}>SUMMARY</div>
                <div className={styles.panelSub}>Overview</div>
              </div>
              <div className={styles.summaryCompactGrid}>
                <SummaryTile label="ORDERS" value={String(orders.length)} />
                <SummaryTile label="OPEN" value={String(orders.filter((o) => o.status === "OPEN").length)} />
                <SummaryTile label="WIN" value={String(orders.filter((o) => o.status === "TP").length)} />
                <SummaryTile label="LOSS" value={String(orders.filter((o) => o.status === "SL").length)} />
              </div>
            </section>
          </aside>
        </div>

        <section className={styles.logPanelCompact}>
          <div className={styles.panelHeaderCompact}>
            <div>
              <div className={styles.panelTitle}>BOT ACTIVITY LOG</div>
              <div className={styles.panelSub}>Simulated only · no broker connected</div>
            </div>
          </div>

          <div className={styles.logTableWrapCompact}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>STATUS</th>
                  <th>SIDE</th>
                  <th>ENTRY</th>
                  <th>TP</th>
                  <th>SL</th>
                  <th>EXIT</th>
                  <th>PNL</th>
                  <th>REASON</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={styles.noData}>
                      No simulated orders yet
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        {order.status === "OPEN" ? (
                          <span className={`${styles.badge} ${styles.badgeGreen}`}>OPEN</span>
                        ) : order.status === "TP" ? (
                          <span className={`${styles.badge} ${styles.badgeBlue}`}>TP HIT</span>
                        ) : (
                          <span className={`${styles.badge} ${styles.badgeAmber}`}>SL HIT</span>
                        )}
                      </td>
                      <td className={order.side === "BUY" ? styles.buyText : styles.sellText}>{order.side}</td>
                      <td>{order.entryPrice.toFixed(2)}</td>
                      <td>{order.tp.toFixed(2)}</td>
                      <td>{order.sl.toFixed(2)}</td>
                      <td>{typeof order.exitPrice === "number" ? order.exitPrice.toFixed(2) : "--"}</td>
                      <td className={typeof order.pnl === "number" && order.pnl >= 0 ? styles.buyText : styles.sellText}>
                        {typeof order.pnl === "number" ? order.pnl.toFixed(2) : "--"}
                      </td>
                      <td>{order.reason}</td>
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.miniStatCompact}>
      <div className={styles.miniLabel}>{label}</div>
      <div className={styles.miniValue}>{value}</div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className={styles.statCardCompact}>
      <div className={styles.smallLabel}>{label}</div>
      <div className={styles.statValueCompact}>{typeof value === "number" ? value.toFixed(2) : "--"}</div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.statCardCompact}>
      <div className={styles.smallLabel}>{label}</div>
      <div className={styles.summaryValueCompact}>{value}</div>
    </div>
  );
}

function CompactLine({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.compactLine}>
      <span className={styles.compactLabel}>{label}</span>
      <span className={styles.compactValue}>{value}</span>
    </div>
  );
}
