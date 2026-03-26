"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type SeriesMarkerBar,
  type SeriesMarkerBarPosition,
  type SeriesMarkerShape,
  type Time,
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

function inferTfSeconds(candles: CandlestickData<Time>[]) {
  if (candles.length < 2) return 60;

  const times = candles
    .map((c) => Number(c.time))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  const deltas: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const d = times[i] - times[i - 1];
    if (d > 0) deltas.push(d);
  }

  if (!deltas.length) return 60;

  const counts = new Map<number, number>();
  for (const d of deltas) {
    counts.set(d, (counts.get(d) || 0) + 1);
  }

  let best = 60;
  let bestCount = -1;
  for (const [delta, count] of counts.entries()) {
    if (count > bestCount) {
      best = delta;
      bestCount = count;
    }
  }

  return best;
}

function buildRealtimeBar(
  lastBar: CandlestickData<Time>,
  livePrice: number,
  tfSeconds: number
): CandlestickData<Time> {
  const nowSec = Math.floor(Date.now() / 1000);
  const activeBucket = Math.floor(nowSec / tfSeconds) * tfSeconds;
  const lastTime = Number(lastBar.time);

  if (activeBucket > lastTime) {
    return {
      time: activeBucket as Time,
      open: lastBar.close,
      high: Math.max(lastBar.close, livePrice),
      low: Math.min(lastBar.close, livePrice),
      close: livePrice,
    };
  }

  return {
    ...lastBar,
    high: Math.max(lastBar.high, livePrice),
    low: Math.min(lastBar.low, livePrice),
    close: livePrice,
  };
}

export default function XAUChart({ candles, livePrice, markers = [] }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const liveLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markersApiRef = useRef<ReturnType<typeof createSeriesMarkers<Time>> | null>(null);

  const initializedRef = useRef(false);
  const lastBaseBarTimeRef = useRef<number | null>(null);
  const currentRealtimeBarRef = useRef<CandlestickData<Time> | null>(null);
  const userMovedAwayRef = useRef(false);

  const safeMarkers = useMemo((): SeriesMarkerBar<Time>[] => {
    return markers.map((m) => ({
      time: m.time,
      position: m.position,
      color: m.color,
      shape: m.shape,
      text: m.text,
    }));
  }, [markers]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const chart = createChart(container, {
      width: Math.max(container.clientWidth, 300),
      height: Math.max(container.clientHeight, 420),
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
        entireTextOnly: true,
        scaleMargins: {
          top: 0.08,
          bottom: 0.08,
        },
      },
      timeScale: {
        borderColor: "#334155",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 8,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: false,
      },
      crosshair: {
        mode: 0,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const liveLine = chart.addSeries(LineSeries, {
      color: "#eab308",
      lineWidth: 1,
      lastValueVisible: true,
      priceLineVisible: true,
      crosshairMarkerVisible: false,
      pointMarkersVisible: false,
      lineVisible: true,
    });

    const markersApi = createSeriesMarkers(candleSeries, []);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    liveLineRef.current = liveLine;
    markersApiRef.current = markersApi;

    const resizeChart = () => {
      if (!containerRef.current || !chartRef.current) return;

      chartRef.current.applyOptions({
        width: Math.max(containerRef.current.clientWidth, 300),
        height: Math.max(containerRef.current.clientHeight, 420),
      });
    };

    const timeScale = chart.timeScale();

    const handleVisibleRangeChange = () => {
      const range = timeScale.getVisibleLogicalRange();
      if (!range) return;

      const barsInfo = candleSeries.barsInLogicalRange(range);
      if (!barsInfo) return;

      userMovedAwayRef.current = barsInfo.barsAfter > 3;
    };

    timeScale.subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);

    const resizeObserver = new ResizeObserver(() => resizeChart());
    resizeObserver.observe(container);
    window.addEventListener("resize", resizeChart);

    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
      resizeObserver.disconnect();
      window.removeEventListener("resize", resizeChart);
      chart.remove();

      chartRef.current = null;
      candleSeriesRef.current = null;
      liveLineRef.current = null;
      markersApiRef.current = null;
      initializedRef.current = false;
      lastBaseBarTimeRef.current = null;
      currentRealtimeBarRef.current = null;
      userMovedAwayRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current || !chartRef.current) return;
    if (!candles.length) return;

    const lastIncomingBaseTime = Number(candles[candles.length - 1].time);

    const shouldReset =
      !initializedRef.current || lastBaseBarTimeRef.current !== lastIncomingBaseTime;

    if (shouldReset) {
      candleSeriesRef.current.setData(candles);
      initializedRef.current = true;
      lastBaseBarTimeRef.current = lastIncomingBaseTime;
      currentRealtimeBarRef.current = candles[candles.length - 1];

      if (!userMovedAwayRef.current) {
        chartRef.current.timeScale().fitContent();
        chartRef.current.timeScale().scrollToRealTime();
      }
    }

    if (markersApiRef.current) {
      markersApiRef.current.setMarkers(safeMarkers);
    }
  }, [candles, safeMarkers]);

  useEffect(() => {
    if (!candleSeriesRef.current || !liveLineRef.current || !chartRef.current) return;
    if (!candles.length || typeof livePrice !== "number") return;

    const tfSeconds = inferTfSeconds(candles);
    const baseLastBar = candles[candles.length - 1];

    const referenceBar =
      currentRealtimeBarRef.current &&
      Number(currentRealtimeBarRef.current.time) >= Number(baseLastBar.time)
        ? currentRealtimeBarRef.current
        : baseLastBar;

    const nextBar = buildRealtimeBar(referenceBar, livePrice, tfSeconds);

    candleSeriesRef.current.update(nextBar);
    currentRealtimeBarRef.current = nextBar;

    const liveLineData: LineData<Time>[] = [
      { time: nextBar.time, value: livePrice },
    ];
    liveLineRef.current.setData(liveLineData);

    if (!userMovedAwayRef.current) {
      chartRef.current.timeScale().scrollToRealTime();
    }
  }, [livePrice, candles]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
