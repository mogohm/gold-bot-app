# Gold Scalping Simulator Project

Deployable project skeleton for XAU/USD scalping simulation with:
- Next.js frontend dashboard
- Next.js API routes as backend
- signal engine
- spread filter
- slippage model
- economic calendar / news lock
- session overlap detector
- backtest endpoint
- Python backtest script for deeper historical testing

## 1) Run locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`

## 2) Environment variables

Set these in `.env.local`:

```bash
TWELVE_DATA_API_KEY=your_twelve_data_key
TRADING_ECONOMICS_API_KEY=your_trading_economics_key
NEXT_PUBLIC_APP_NAME=Gold Scalping Simulator
```

Without API keys, the app falls back to realistic mock data so you can test the UI immediately.

## 3) API endpoints

- `GET /api/market/candles`
- `GET /api/market/quote`
- `GET /api/news/calendar`
- `GET /api/signal/live`
- `POST /api/backtest/run`

## 4) Project structure

```text
app/
  api/
    market/candles/route.ts
    market/quote/route.ts
    news/calendar/route.ts
    signal/live/route.ts
    backtest/run/route.ts
  globals.css
  layout.tsx
  page.tsx
components/
  Dashboard.tsx
lib/
  calendar.ts
  indicators.ts
  marketData.ts
  mockData.ts
  newsFilter.ts
  riskGuard.ts
  session.ts
  signalEngine.ts
  slippage.ts
  types.ts
backtest/
  backtest_xauusd.py
  requirements.txt
```

## 5) Deploy on Vercel

1. Push this folder to GitHub
2. Import the repo into Vercel
3. Set env vars in Vercel Project Settings
4. Deploy

This project is built so the frontend and backend routes deploy together on Vercel.

## 6) Run Python backtest

```bash
cd backtest
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export TWELVE_DATA_API_KEY=your_twelve_data_key
python backtest_xauusd.py
```

## 7) Next improvements

- switch line chart to candlestick chart library
- store historical runs in a database
- add walk-forward and Monte Carlo backtests
- integrate broker adapter for demo trading later
- add spread anomaly detector and red-news halt persistence
