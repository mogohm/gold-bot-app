import os
import requests
import pandas as pd
from backtesting import Backtest, Strategy

API_KEY = os.getenv("TWELVE_DATA_API_KEY")
SYMBOL = "XAU/USD"
INTERVAL = "1min"
OUTPUTSIZE = 500


def fetch_data() -> pd.DataFrame:
    if API_KEY:
        url = f"https://api.twelvedata.com/time_series?symbol={SYMBOL}&interval={INTERVAL}&outputsize={OUTPUTSIZE}&apikey={API_KEY}"
        res = requests.get(url, timeout=30)
        res.raise_for_status()
        data = res.json().get("values", [])
        if data:
            rows = list(reversed(data))
            df = pd.DataFrame(rows)
            df["Open"] = df["open"].astype(float)
            df["High"] = df["high"].astype(float)
            df["Low"] = df["low"].astype(float)
            df["Close"] = df["close"].astype(float)
            df["Volume"] = pd.to_numeric(df.get("volume", 0), errors="coerce").fillna(0)
            df.index = pd.to_datetime(df["datetime"])
            return df[["Open", "High", "Low", "Close", "Volume"]]

    rng = pd.date_range(end=pd.Timestamp.utcnow(), periods=OUTPUTSIZE, freq="min")
    price = 2350.0
    rows = []
    for i, ts in enumerate(rng):
        drift = (i % 24 - 12) * 0.01
        move = drift + (0.8 if i % 15 == 0 else -0.2)
        open_ = price
        close = price + move
        high = max(open_, close) + 1.2
        low = min(open_, close) - 1.1
        volume = 800 if 13 <= ts.hour <= 20 else 350
        rows.append([open_, high, low, close, volume])
        price = close
    return pd.DataFrame(rows, columns=["Open", "High", "Low", "Close", "Volume"], index=rng)


def ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, 1e-9)
    return 100 - (100 / (1 + rs))


class GoldScalpStrategy(Strategy):
    lot_size = 3
    stop_loss = 3.5
    take_profit = 5.5
    volume_threshold = 700

    def init(self):
        close = pd.Series(self.data.Close)
        self.ema_fast = self.I(lambda: ema(close, 9))
        self.ema_slow = self.I(lambda: ema(close, 21))
        self.ema_trend = self.I(lambda: ema(close, 50))
        self.rsi14 = self.I(lambda: rsi(close, 14))

    def next(self):
        price = self.data.Close[-1]
        volume = self.data.Volume[-1]
        hour = pd.Timestamp(self.data.index[-1]).hour
        active_session = (7 <= hour < 16) or (13 <= hour < 22)
        overlap = (13 <= hour < 16)
        spread = 0.4

        if spread > 0.8:
            return

        long_ok = self.ema_fast[-1] > self.ema_slow[-1] and price > self.ema_trend[-1] and 53 <= self.rsi14[-1] <= 72
        short_ok = self.ema_fast[-1] < self.ema_slow[-1] and price < self.ema_trend[-1] and 28 <= self.rsi14[-1] <= 47
        liquid_ok = volume >= self.volume_threshold and active_session
        score_bonus = 10 if overlap else 0

        if not self.position and liquid_ok:
            if long_ok and (70 - score_bonus) <= 70:
                self.buy(sl=price - self.stop_loss, tp=price + self.take_profit, size=self.lot_size)
            elif short_ok and (70 - score_bonus) <= 70:
                self.sell(sl=price + self.stop_loss, tp=price - self.take_profit, size=self.lot_size)


def main():
    df = fetch_data()
    bt = Backtest(df, GoldScalpStrategy, cash=10000, commission=0.0, trade_on_close=True, exclusive_orders=True)
    stats = bt.run()
    print(stats)


if __name__ == "__main__":
    main()
