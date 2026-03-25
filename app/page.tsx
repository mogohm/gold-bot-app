"use client";

import { useEffect, useMemo, useState } from "react";
import type { CandlestickData, Time } from "lightweight-charts";
import XAUChart from "@/components/XAUChart";
import { TIMEFRAME_OPTIONS, type TimeframeValue } from "@/lib/timeframes";

type CandleResponse = {
  ok: boolean;
  candles?: CandlestickData<Time>[];
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

export default function HomePage() {
  const [interval, setIntervalValue] = useState<TimeframeValue>("1min");
  const [candles, setCandles] = useState<CandlestickData<Time>[]>([]);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [loadingCandles, setLoadingCandles] = useState(true);
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string>("unknown");

  async function loadCandles(selectedInterval: TimeframeValue) {
    setLoadingCandles(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/market/candles?interval=${selectedInterval}&outputsize=300`,
        { cache: "no-store" }
      );
      const data: CandleResponse = await res.json();

      if (!data.ok || !data.candles) {
        setError(data.error || "Failed to load candles");
        return;
      }

      setCandles(data.candles);
      setSource(data.source || "unknown");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load candles");
    } finally {
      setLoadingCandles(false);
    }
  }

  async function loadQuote() {
    setLoadingQuote(true);

    try {
      const res = await fetch(`/api/market/quote`, { cache: "no-store" });
      const data: QuoteResponse = await res.json();

      if (data.ok && typeof data.price === "number") {
        setLivePrice(data.price);
      }
    } finally {
      setLoadingQuote(false);
    }
  }

  useEffect(() => {
    loadCandles(interval);
  }, [interval]);

  useEffect(() => {
    loadQuote();
    const quoteTimer = setInterval(loadQuote, 3000);

    return () => clearInterval(quoteTimer);
  }, []);

  useEffect(() => {
    const refreshMs =
      interval === "1min"
        ? 15000
        : interval === "5min"
        ? 30000
        : interval === "15min"
        ? 60000
        : interval === "30min"
        ? 120000
        : interval === "1h"
        ? 180000
        : interval === "1day"
        ? 600000
        : 900000;

    const candleTimer = setInterval(() => {
      loadCandles(interval);
    }, refreshMs);

    return () => clearInterval(candleTimer);
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
                Candlestick chart with real market data, live price polling, and timeframe switching.
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
              {loadingCandles && candles.length === 0 ? (
                <div className="flex h-[560px] items-center justify-center text-slate-400">
                  Loading candles...
                </div>
              ) : error ? (
                <div className="flex h-[560px] items-center justify-center text-red-300">
                  {error}
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
                  {loadingQuote ? "Refreshing..." : "Live polling every 3s"}
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
              <h2 className="text-xl font-semibold">Notes</h2>
              <div className="mt-4 space-y-2 text-sm text-slate-300">
                <p>• ถ้าไม่มี API key ระบบจะ fallback เป็น mock data</p>
                <p>• 1m จะรีเฟรช candle ถี่ที่สุด</p>
                <p>• ราคา live ใช้ polling ทุก 3 วินาที</p>
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
