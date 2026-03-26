"use client";

import { useEffect, useRef, useState } from "react";

type WSPriceMessage =
  | {
      event?: string;
      status?: string;
      symbol?: string;
      currency_base?: string;
      currency_quote?: string;
      timestamp?: number;
      price?: number | string;
      bid?: number | string;
      ask?: number | string;
    }
  | Record<string, unknown>;

type UseTwelveDataWSOptions = {
  symbol?: string;
  enabled?: boolean;
};

export function useTwelveDataWS({
  symbol = "XAU/USD",
  enabled = true,
}: UseTwelveDataWSOptions) {
  const [price, setPrice] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [source, setSource] = useState<"websocket" | "none">("none");
  const [error, setError] = useState<string | null>(null);
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const shouldReconnectRef = useRef(true);

  useEffect(() => {
    if (!enabled) return;

    const apiKey = process.env.NEXT_PUBLIC_TWELVE_DATA_API_KEY;
    if (!apiKey) {
      setError("Missing NEXT_PUBLIC_TWELVE_DATA_API_KEY");
      return;
    }

    shouldReconnectRef.current = true;

    const connect = () => {
      try {
        setError(null);

        const ws = new WebSocket(
          `wss://ws.twelvedata.com/v1/quotes/price?apikey=${apiKey}`
        );

        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          setSource("websocket");

          ws.send(
            JSON.stringify({
              action: "subscribe",
              params: {
                symbols: symbol,
              },
            })
          );
        };

        ws.onmessage = (event) => {
          try {
            const msg: WSPriceMessage = JSON.parse(event.data);

            if (
              typeof msg === "object" &&
              msg !== null &&
              "event" in msg &&
              typeof msg.event === "string"
            ) {
              if (msg.event === "price") {
                const raw =
                  typeof msg.price !== "undefined"
                    ? msg.price
                    : typeof msg.bid !== "undefined"
                    ? msg.bid
                    : null;

                const parsed = raw !== null ? Number(raw) : NaN;
                if (Number.isFinite(parsed)) {
                  setPrice(parsed);
                  setLastMessageAt(Date.now());
                  setError(null);
                }
              }

              if (msg.event === "subscribe-status") {
                if (msg.status && msg.status !== "ok") {
                  setError(`WebSocket subscribe failed: ${String(msg.status)}`);
                }
              }
            }
          } catch {
            setError("Invalid WebSocket message");
          }
        };

        ws.onerror = () => {
          setError("WebSocket connection error");
        };

        ws.onclose = () => {
          setConnected(false);

          if (shouldReconnectRef.current) {
            reconnectTimerRef.current = window.setTimeout(() => {
              connect();
            }, 3000);
          }
        };
      } catch (err) {
        setConnected(false);
        setError(err instanceof Error ? err.message : "WebSocket init failed");
      }
    };

    connect();

    return () => {
      shouldReconnectRef.current = false;

      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, [symbol, enabled]);

  return {
    price,
    connected,
    source,
    error,
    lastMessageAt,
  };
}
