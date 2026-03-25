"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  LineSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type Time,
  type SeriesMarkerBar,
  type SeriesMarkerBarPosition,
  type SeriesMarkerShape,
} from "lightweight-charts";

export type BotMarker = {
  time: Time;
  position: SeriesMarkerBarPosition;
  color: string;
  shape: SeriesMarkerShape;
  text: string;
};

type Props = {
  candles: CandlestickData<Time>[];
  livePrice?: number | null;
  markers?: BotMarker[];
};

export default function XAUChart({ candles, livePrice, markers = [] }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const liveLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markersApiRef = useRef<ReturnType<typeof createSeriesMarkers<Time>> | null>(null);

  const safeMarkers = useMemo((): SeriesMarkerBar<Time>[] => {
    return markers.map((m) => ({
      time: m.time as Time,
      position: m.position,
      color: m.color,
      shape: m.shape,
      text: m.text,
    }));
  }, [markers]);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth || 900,
      height: 500,
      layout: {
        background: { type: ColorType.Solid, color: "#020617" },
        textColor: "#cbd5e1",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      rightPriceScale: {
        borderColor: "#334155",
      },
      timeScale: {
        borderColor: "#334155",
        timeVisible: true,
        secondsVisible: true,
      },
      crosshair: {
        mode: 0,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const liveLine = chart.addSeries(LineSeries, {
      color: "#eab308",
      lineWidth: 1,
      lastValueVisible: true,
      priceLineVisible: true,
      crosshairMarkerVisible: false,
    });

    const markersApi = createSeriesMarkers(candleSeries, []);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    liveLineRef.current = liveLine;
    markersApiRef.current = markersApi;

    const resize = () => {
      if (!containerRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({
        width: containerRef.current.clientWidth || 900,
        height: 500,
      });
      chartRef.current.timeScale().fitContent();
    };

    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      liveLineRef.current = null;
      markersApiRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current || !chartRef.current) return;
    if (!candles || candles.length === 0) return;

    candleSeriesRef.current.setData(candles);

    if (markersApiRef.current) {
      markersApiRef.current.setMarkers(safeMarkers);
    }

    chartRef.current.timeScale().fitContent();
  }, [candles, safeMarkers]);

  useEffect(() => {
    if (!liveLineRef.current) return;
    if (!candles || candles.length === 0) return;
    if (typeof livePrice !== "number") return;

    const last = candles[candles.length - 1];
    const lineData: LineData<Time>[] = [{ time: last.time, value: livePrice }];
    liveLineRef.current.setData(lineData);
  }, [livePrice, candles]);

  return <div ref={containerRef} className="w-full rounded-2xl" />;
}
