"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CandlestickData, Time } from "lightweight-charts";
import XAUChart from "@/components/XAUChart";
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
      return 15_000;
    case "5min":
      return 20_000;
    case "15min":
      return 30_000;
    case "30min":
      return 45_000;
    case "1h":
      return 60_000;
    case "1day":
      return 120_000;
    case "1month":
      return 300_000;
    default:
      return 15_000;
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

export default function HomePage() {
  const [interval, setIntervalValue] = useState<TimeframeValue>("1min");
  const [candles, setCandles] = useState<CandlestickData<Time>[]>([]);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [loadingCandles, setLoadingCandles] = useState(true);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string>("unknown");
  const [lastQuoteAt, setLastQuoteAt] = useState<number | null>(null);
  const [lastCandlesAt, setLastCandlesAt] = useState<number | null>(null);

  const loadingCandlesRef = useRef(false);
  const loadingQuoteRef = useRef(false);

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
        setCandles([]);
        setSource(data.source || "error");
        return;
      }

      const formatted = normalizeCandles(data.candles);

      if (formatted.length === 0) {
        setError("No valid candle data returned");
        setCandles([]);
        setSource(data.source || "error");
        return;
      }

      setCandles(formatted);
      setSource(data.source || "unknown");
      setLastCandlesAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load candles");
      setCandles([]);
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
      // ignore quote errors to keep chart usable
    } finally {
      setLoadingQuote(false);
      loadingQuoteRef.current = false;
    }
  }

  useEffect(() => {
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

  const lastCandle = useMemo(() => candles[candles.length - 1], [candles]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl p-4 md:p-8 space-y-6">
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                XAU/USD Real-Time Dashboard
              </h1>
              <p className="mt-2 text-slate-300">
                Candlestick chart with real market data and timeframe switching.
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
                <XAUChart candles={candles} livePrice={livePrice} />
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
              <h2 className="text-xl font-semibold">Last Candle</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <StatCard label="Open" value={lastCandle?.open} />
                <StatCard label="High" value={lastCandle?.high} />
                <StatCard label="Low" value={lastCandle?.low} />
                <StatCard label="Close" value={lastCandle?.close} />
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
              <h2 className="text-xl font-semibold">Request Status</h2>
              <div className="mt-4 space-y-2 text-sm text-slate-300">
                <p>Source: {source}</p>
                <p>Last candles: {lastCandlesAt ? new Date(lastCandlesAt).toLocaleTimeString() : "--"}</p>
                <p>Last quote: {lastQuoteAt ? new Date(lastQuoteAt).toLocaleTimeString() : "--"}</p>
              </div>
            </section>
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
