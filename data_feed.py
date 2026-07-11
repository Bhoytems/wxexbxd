"""
Market data feed.

Uses yfinance (no API key required) as the price source, standing in for
IQ Option's OTC instruments — OTC pairs are synthetic but track the live
underlying market closely, so this is a reasonable proxy.

yfinance intraday limits: 1m data only covers the last ~7 days, which is
fine since the engine only needs recent candles to evaluate the strategy.
"""
import yfinance as yf
import pandas as pd

from config import TIMEFRAMES

# yfinance period needed per interval to reliably return enough candles
_PERIOD_FOR_INTERVAL = {
    "1m": "5d",
    "5m": "1mo",
    "15m": "1mo",
    "1h": "3mo",
    "4h": "6mo",  # yfinance has no native 4h; resampled from 1h below
}


def _fetch_interval(symbol, interval, period):
    df = yf.Ticker(symbol).history(period=period, interval=interval)
    if df is None or df.empty:
        return None
    df = df.rename(columns=str.lower)
    return df[["open", "high", "low", "close", "volume"]]


def fetch_all_timeframes(symbol):
    """
    Returns a dict: {timeframe_str: DataFrame} for every timeframe in
    config.TIMEFRAMES, or None for any timeframe that failed to fetch.
    """
    data = {}
    hourly_df = None

    for tf in TIMEFRAMES:
        if tf == "4h":
            # build 4h candles by resampling 1h data
            if hourly_df is None:
                hourly_df = _fetch_interval(symbol, "1h", _PERIOD_FOR_INTERVAL["1h"])
            if hourly_df is None:
                data[tf] = None
                continue
            resampled = hourly_df.resample("4h").agg({
                "open": "first", "high": "max", "low": "min",
                "close": "last", "volume": "sum",
            }).dropna()
            data[tf] = resampled
        elif tf == "1h":
            if hourly_df is None:
                hourly_df = _fetch_interval(symbol, "1h", _PERIOD_FOR_INTERVAL["1h"])
            data[tf] = hourly_df
        else:
            data[tf] = _fetch_interval(symbol, tf, _PERIOD_FOR_INTERVAL[tf])

    return data


def latest_price(symbol):
    df = _fetch_interval(symbol, "1m", "1d")
    if df is None or df.empty:
        df = _fetch_interval(symbol, "5m", "5d")
    if df is None or df.empty:
        return None
    return float(df["close"].iloc[-1])
