"""
Signal strategy.

*** PLACEHOLDER STRATEGY — swap out generate_signal() with your real logic. ***

This file is intentionally isolated from everything else (data fetching,
Telegram delivery, result tracking, the dashboard) so replacing the logic
never means touching those systems. `generate_signal` is the only function
the rest of the app calls.

Contract:
    generate_signal(candles_by_timeframe: dict[str, pandas.DataFrame]) -> str | None

    candles_by_timeframe keys match config.TIMEFRAMES: "1m","5m","15m","1h","4h"
    Each DataFrame has columns: open, high, low, close, volume (indexed by time,
    oldest first).

    Return "CALL" for a bullish/buy signal, "PUT" for a bearish/sell signal,
    or None if no signal should fire right now.

Current placeholder logic (multi-timeframe EMA trend alignment):
    - Higher-timeframe bias: EMA9 > EMA21 on both 1h AND 4h => bullish bias
      (reverse for bearish bias). If 1h and 4h disagree, no signal.
    - Entry trigger: EMA9 crosses EMA21 on the 5m in the direction of the bias,
      confirmed by 15m EMA9 > EMA21 (or <, for bearish) already in that direction.
    - RSI(14) on 5m filters out overbought/oversold extremes (>80 or <20 blocked
      for CALL/PUT respectively) to avoid signalling into an exhausted move.
"""


def _ema(series, span):
    return series.ewm(span=span, adjust=False).mean()


def _rsi(series, period=14):
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(period).mean()
    avg_loss = loss.rolling(period).mean()
    rs = avg_gain / avg_loss.replace(0, 1e-9)
    return 100 - (100 / (1 + rs))


def _trend_bias(df):
    if df is None or len(df) < 25:
        return None
    ema9 = _ema(df["close"], 9)
    ema21 = _ema(df["close"], 21)
    if ema9.iloc[-1] > ema21.iloc[-1]:
        return "CALL"
    if ema9.iloc[-1] < ema21.iloc[-1]:
        return "PUT"
    return None


def _just_crossed(df, direction):
    if df is None or len(df) < 25:
        return False
    ema9 = _ema(df["close"], 9)
    ema21 = _ema(df["close"], 21)
    prev_diff = ema9.iloc[-2] - ema21.iloc[-2]
    curr_diff = ema9.iloc[-1] - ema21.iloc[-1]
    if direction == "CALL":
        return prev_diff <= 0 and curr_diff > 0
    if direction == "PUT":
        return prev_diff >= 0 and curr_diff < 0
    return False


def generate_signal(candles_by_timeframe):
    tf1h = candles_by_timeframe.get("1h")
    tf4h = candles_by_timeframe.get("4h")
    tf15m = candles_by_timeframe.get("15m")
    tf5m = candles_by_timeframe.get("5m")

    bias_1h = _trend_bias(tf1h)
    bias_4h = _trend_bias(tf4h)

    if bias_1h is None or bias_4h is None or bias_1h != bias_4h:
        return None  # higher timeframes disagree — no trade

    bias = bias_1h

    bias_15m = _trend_bias(tf15m)
    if bias_15m != bias:
        return None  # 15m not aligned with higher-timeframe bias yet

    if not _just_crossed(tf5m, bias):
        return None  # no fresh entry trigger on the 5m

    if tf5m is None or len(tf5m) < 20:
        return None
    rsi = _rsi(tf5m["close"]).iloc[-1]
    if bias == "CALL" and rsi > 80:
        return None
    if bias == "PUT" and rsi < 20:
        return None

    return bias
