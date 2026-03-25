"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Candle, NewsEvent, Quote } from "@/lib/types";

type LiveResponse = {
  candles: Candle[];
  quote: Quote;
  events: NewsEvent[];
  signal: {
    signal: "BUY" | "SELL" | "WAIT";
    score: number;
    reason: string[];
    blocked: boolean;
    blockedReason?: string;
    slippage: number;
    session: { inLondon: boolean; inNY: boolean; overlapLondonNY: boolean };
  };
};

type BacktestResponse = {
  summary: {
    trades: number;
    winRate: number;
    pnl: number;
    balance: number;
  };
  equity: Array<{ index: number; equity: number }>;
  trades: Array<Record<string, unknown>>;
};

export default function Dashboard() {
  const [live, setLive] = useState<LiveResponse | null>(null);
  const [backtest, setBacktest] = useState<BacktestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualSide, setManualSide] = useState<"BUY" | "SELL">("BUY");
  const [manualLog, setManualLog] = useState<Array<{ side: string; entry: number; tp: number; sl: number; time: string }>>([]);

  async function load() {
    setLoading(true);
    const [signalRes, backtestRes] = await Promise.all([
      fetch("/api/signal/live", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/backtest/run", { method: "POST" }).then((r) => r.json()),
    ]);
    setLive(signalRes);
    setBacktest(backtestRes);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const latest = live?.candles.at(-1);
  const headline = useMemo(() => {
    if (!live) return { label: "WAIT", cls: "signal-wait" };
    return {
      label: live.signal.signal,
      cls: live.signal.signal === "BUY" ? "signal-buy" : live.signal.signal === "SELL" ? "signal-sell" : "signal-wait",
    };
  }, [live]);

  function addManualTrade() {
    if (!latest) return;
    setManualLog((prev) => [{
      side: manualSide,
      entry: latest.close,
      tp: Number((manualSide === "BUY" ? latest.close + 5.5 : latest.close - 5.5).toFixed(2)),
      sl: Number((manualSide === "BUY" ? latest.close - 3.5 : latest.close + 3.5).toFixed(2)),
      time: new Date(latest.time).toLocaleString(),
    }, ...prev]);
  }

  if (loading || !live || !backtest || !latest) return <div className="container">Loading dashboard...</div>;

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Gold Scalping Simulator</h1>
          <p className="muted">Real candle feed + spread filter + slippage model + news lock + session overlap + backtest + risk guard</p>
        </div>
        <div>
          <span className="badge">XAU/USD</span>
          <span className="badge">M1</span>
          <span className="badge">Auto refresh 15s</span>
          <button onClick={load}>Refresh</button>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card"><div className="muted">Signal</div><div className={`kpi ${headline.cls}`}>{headline.label}</div></div>
        <div className="card"><div className="muted">Score</div><div className="kpi">{live.signal.score}</div></div>
        <div className="card"><div className="muted">Mid / Spread</div><div className="kpi">{live.quote.mid} / {live.quote.spread}</div></div>
        <div className="card"><div className="muted">Estimated Slippage</div><div className="kpi">{live.signal.slippage}</div></div>
      </div>

      {live.signal.blocked && <div className="alert" style={{ marginBottom: 16 }}>Trading blocked: {live.signal.blockedReason || "Guard active"}</div>}

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card" style={{ gridColumn: "span 3" }}>
          <h3>Price Chart</h3>
          <div style={{ height: 420 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={live.candles.map((c) => ({ ...c, label: new Date(c.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} domain={["auto", "auto"]} />
                <Tooltip />
                <Line type="monotone" dataKey="close" dot={false} strokeWidth={2} stroke="#f8fafc" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h3>Live Gate Checks</h3>
          <p><strong>Reasons:</strong> {live.signal.reason.join(" • ")}</p>
          <p><strong>London:</strong> {String(live.signal.session.inLondon)}</p>
          <p><strong>New York:</strong> {String(live.signal.session.inNY)}</p>
          <p><strong>Overlap:</strong> {String(live.signal.session.overlapLondonNY)}</p>
          <p><strong>Bid / Ask:</strong> {live.quote.bid} / {live.quote.ask}</p>
          <p><strong>Last Volume:</strong> {latest.volume}</p>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card" style={{ gridColumn: "span 3" }}>
          <h3>Equity Curve</h3>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={backtest.equity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="index" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                <Tooltip />
                <Area type="monotone" dataKey="equity" stroke="#22c55e" fill="#22c55e33" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h3>Backtest Summary</h3>
          <p><strong>Trades:</strong> {backtest.summary.trades}</p>
          <p><strong>Win rate:</strong> {backtest.summary.winRate}%</p>
          <p><strong>PnL:</strong> {backtest.summary.pnl}</p>
          <p><strong>Balance:</strong> {backtest.summary.balance}</p>
        </div>
      </div>

      <div className="grid grid-3">
        <div className="card">
          <h3>Bottom Panel: Open Simulated Trade</h3>
          <div className="controls">
            <select value={manualSide} onChange={(e) => setManualSide(e.target.value as "BUY" | "SELL")}>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
            <input readOnly value={latest.close} />
            <input readOnly value={(manualSide === "BUY" ? latest.close + 5.5 : latest.close - 5.5).toFixed(2)} />
            <input readOnly value={(manualSide === "BUY" ? latest.close - 3.5 : latest.close + 3.5).toFixed(2)} />
          </div>
          <div style={{ marginTop: 12 }}><button onClick={addManualTrade}>Open Simulated Trade</button></div>
        </div>
        <div className="card">
          <h3>Upcoming News</h3>
          {live.events.map((e) => (
            <div key={e.id} style={{ padding: "8px 0", borderBottom: "1px solid #1e293b" }}>
              <div>{e.title}</div>
              <div className="muted">{e.country} • {e.impact} • {new Date(e.time).toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Manual Log</h3>
          {manualLog.length === 0 && <div className="muted">No manual simulated trades yet.</div>}
          {manualLog.map((row, i) => (
            <div key={`${row.time}-${i}`} style={{ padding: "8px 0", borderBottom: "1px solid #1e293b" }}>
              <div>{row.side} @ {row.entry}</div>
              <div className="muted">TP {row.tp} / SL {row.sl} / {row.time}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Backtest Trades</h3>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>Side</th><th>Entry</th><th>Exit</th><th>PnL</th><th>Reason</th></tr></thead>
            <tbody>
              {backtest.trades.slice(0, 12).map((t, i) => (
                <tr key={String(i)}>
                  <td>{String(t.side)}</td>
                  <td>{String(t.entryPrice)}</td>
                  <td>{String(t.exitPrice)}</td>
                  <td>{String(t.pnl)}</td>
                  <td>{String(t.exitReason)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
