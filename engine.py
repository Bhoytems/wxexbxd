import threading
import time
from datetime import datetime, timezone

import storage
import data_feed
import strategy
import telegram_bot
from config import ASSETS, EXPIRY_MINUTES, ENGINE_POLL_SECONDS, SIGNAL_COOLDOWN_SECONDS

_last_signal_time = {}  # asset_key -> monotonic time of last signal sent
_thread = None
_stop_flag = threading.Event()


def _log(msg):
    print(f"[engine] {datetime.now(timezone.utc).isoformat()} {msg}")


def _scan_asset(asset_key):
    asset = ASSETS[asset_key]
    now = time.monotonic()
    last = _last_signal_time.get(asset_key, 0)
    if now - last < SIGNAL_COOLDOWN_SECONDS:
        return

    try:
        candles = data_feed.fetch_all_timeframes(asset["feed_symbol"])
    except Exception as e:
        _log(f"data fetch failed for {asset_key}: {e}")
        return

    try:
        direction = strategy.generate_signal(candles)
    except Exception as e:
        _log(f"strategy error for {asset_key}: {e}")
        return

    if direction is None:
        return

    tf1m = candles.get("1m")
    entry_price = float(tf1m["close"].iloc[-1]) if tf1m is not None and len(tf1m) else None

    channels = storage.list_channels()
    if not channels:
        _log(f"signal generated for {asset_key} ({direction}) but no channels configured")
        return

    sent_at_wat = (datetime.now(timezone.utc)).strftime("%Y-%m-%d %H:%M UTC")
    # signal id is created after send so the message can't reference it; instead
    # we create the DB row first (without message ids) to get the id, then send.
    signal_id = storage.create_signal(asset_key, direction, entry_price, EXPIRY_MINUTES, {})

    text = telegram_bot.format_signal_message(
        signal_id, asset["label"], direction, EXPIRY_MINUTES, sent_at_wat
    )
    chat_ids = [c["chat_id"] for c in channels]
    message_ids = telegram_bot.broadcast(chat_ids, text)

    # store message ids for the eventual result post
    import json
    import sqlite3
    with storage._lock, storage._conn() as conn:
        conn.execute(
            "UPDATE signals SET message_ids=? WHERE id=?",
            (json.dumps(message_ids), signal_id),
        )
        conn.commit()

    _last_signal_time[asset_key] = now
    _log(f"signal sent: {asset_key} {direction} id={signal_id}")


def _resolve_due_signals():
    due = storage.get_pending_signals_due()
    for sig in due:
        asset = ASSETS.get(sig["asset_key"])
        if asset is None:
            continue
        try:
            exit_price = data_feed.latest_price(asset["feed_symbol"])
        except Exception as e:
            _log(f"exit price fetch failed for signal {sig['id']}: {e}")
            continue
        if exit_price is None or sig["entry_price"] is None:
            continue

        if sig["direction"] == "CALL":
            result = "WIN" if exit_price > sig["entry_price"] else (
                "LOSS" if exit_price < sig["entry_price"] else "TIE"
            )
        else:
            result = "WIN" if exit_price < sig["entry_price"] else (
                "LOSS" if exit_price > sig["entry_price"] else "TIE"
            )

        storage.resolve_signal(sig["id"], result, exit_price)

        text = telegram_bot.format_result_message(
            sig["id"], asset["label"], sig["direction"], result,
            sig["entry_price"], exit_price,
        )
        channels = storage.list_channels()
        telegram_bot.broadcast([c["chat_id"] for c in channels], text)
        _log(f"result posted: {sig['id']} -> {result}")


def _loop():
    _log("engine thread started")
    while not _stop_flag.is_set():
        if storage.is_engine_running():
            toggles = storage.get_asset_toggles()
            for asset_key, enabled in toggles.items():
                if not enabled:
                    continue
                if _stop_flag.is_set():
                    break
                _scan_asset(asset_key)

            _resolve_due_signals()

        _stop_flag.wait(ENGINE_POLL_SECONDS)
    _log("engine thread stopped")


def start_background_thread():
    """Starts the always-alive polling thread once per process.
    The thread itself checks storage.is_engine_running() every cycle,
    so START/STOP in the UI just flips that flag — no thread restart needed."""
    global _thread
    if _thread is not None and _thread.is_alive():
        return
    _stop_flag.clear()
    _thread = threading.Thread(target=_loop, daemon=True)
    _thread.start()
