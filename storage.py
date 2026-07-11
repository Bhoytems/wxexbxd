"""
Persistence layer.

Uses SQLite so the app has zero external dependencies to set up. On Railway,
attach a Volume mounted at the working directory (or point DB_PATH at it) so
the database survives redeploys — otherwise it resets to defaults on every
deploy since Railway's filesystem is ephemeral.
"""
import sqlite3
import json
import threading
import uuid
from datetime import datetime, timezone, timedelta

from config import DB_PATH, ASSETS, WAT_OFFSET_HOURS

_lock = threading.Lock()


def _conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with _lock, _conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS channels (
                id TEXT PRIMARY KEY,
                chat_id TEXT NOT NULL UNIQUE,
                label TEXT,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS asset_toggles (
                asset_key TEXT PRIMARY KEY,
                enabled INTEGER NOT NULL DEFAULT 0
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS signals (
                id TEXT PRIMARY KEY,
                asset_key TEXT NOT NULL,
                direction TEXT NOT NULL,
                entry_price REAL,
                sent_at_utc TEXT NOT NULL,
                expiry_minutes INTEGER NOT NULL,
                result TEXT DEFAULT 'PENDING',
                exit_price REAL,
                resolved_at_utc TEXT,
                message_ids TEXT
            )
        """)
        # seed asset toggles
        for key in ASSETS:
            conn.execute(
                "INSERT OR IGNORE INTO asset_toggles (asset_key, enabled) VALUES (?, 0)",
                (key,),
            )
        # seed default settings
        for key, val in [("engine_running", "0")]:
            conn.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                (key, val),
            )
        conn.commit()


# ---------- settings ----------

def get_setting(key, default=None):
    with _lock, _conn() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return row["value"] if row else default


def set_setting(key, value):
    with _lock, _conn() as conn:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, str(value)),
        )
        conn.commit()


def is_engine_running():
    return get_setting("engine_running", "0") == "1"


def set_engine_running(running: bool):
    set_setting("engine_running", "1" if running else "0")


# ---------- asset toggles ----------

def get_asset_toggles():
    with _lock, _conn() as conn:
        rows = conn.execute("SELECT asset_key, enabled FROM asset_toggles").fetchall()
        return {r["asset_key"]: bool(r["enabled"]) for r in rows}


def set_asset_toggle(asset_key, enabled: bool):
    with _lock, _conn() as conn:
        conn.execute(
            "UPDATE asset_toggles SET enabled=? WHERE asset_key=?",
            (1 if enabled else 0, asset_key),
        )
        conn.commit()


def set_all_asset_toggles(enabled: bool):
    with _lock, _conn() as conn:
        conn.execute("UPDATE asset_toggles SET enabled=?", (1 if enabled else 0,))
        conn.commit()


# ---------- channels ----------

def list_channels():
    with _lock, _conn() as conn:
        rows = conn.execute(
            "SELECT id, chat_id, label, created_at FROM channels ORDER BY created_at"
        ).fetchall()
        return [dict(r) for r in rows]


def add_channel(chat_id, label=""):
    cid = str(uuid.uuid4())[:8]
    with _lock, _conn() as conn:
        conn.execute(
            "INSERT INTO channels (id, chat_id, label, created_at) VALUES (?, ?, ?, ?)",
            (cid, chat_id.strip(), label.strip(), datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
    return cid


def remove_channel(channel_id):
    with _lock, _conn() as conn:
        conn.execute("DELETE FROM channels WHERE id=?", (channel_id,))
        conn.commit()


# ---------- signals ----------

def create_signal(asset_key, direction, entry_price, expiry_minutes, message_ids):
    sid = str(uuid.uuid4())[:8].upper()
    with _lock, _conn() as conn:
        conn.execute(
            """INSERT INTO signals
               (id, asset_key, direction, entry_price, sent_at_utc, expiry_minutes, result, message_ids)
               VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)""",
            (
                sid, asset_key, direction, entry_price,
                datetime.now(timezone.utc).isoformat(), expiry_minutes,
                json.dumps(message_ids),
            ),
        )
        conn.commit()
    return sid


def get_pending_signals_due():
    """Signals whose expiry window has elapsed and still need a result posted."""
    with _lock, _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM signals WHERE result='PENDING'"
        ).fetchall()
    due = []
    now = datetime.now(timezone.utc)
    for r in rows:
        sent = datetime.fromisoformat(r["sent_at_utc"])
        if now >= sent + timedelta(minutes=r["expiry_minutes"]):
            due.append(dict(r))
    return due


def resolve_signal(signal_id, result, exit_price):
    with _lock, _conn() as conn:
        conn.execute(
            "UPDATE signals SET result=?, exit_price=?, resolved_at_utc=? WHERE id=?",
            (result, exit_price, datetime.now(timezone.utc).isoformat(), signal_id),
        )
        conn.commit()


def recent_signals(limit=50):
    with _lock, _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM signals ORDER BY sent_at_utc DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


def performance_summary():
    with _lock, _conn() as conn:
        rows = conn.execute("SELECT result FROM signals WHERE result != 'PENDING'").fetchall()
    wins = sum(1 for r in rows if r["result"] == "WIN")
    losses = sum(1 for r in rows if r["result"] == "LOSS")
    ties = sum(1 for r in rows if r["result"] == "TIE")
    total = wins + losses + ties
    win_rate = round((wins / total) * 100, 1) if total else 0.0
    return {"wins": wins, "losses": losses, "ties": ties, "total": total, "win_rate": win_rate}


def to_wat(dt_utc_iso):
    """Format a UTC ISO timestamp string as WAT (UTC+1) HH:MM."""
    dt = datetime.fromisoformat(dt_utc_iso)
    wat = dt + timedelta(hours=WAT_OFFSET_HOURS)
    return wat.strftime("%Y-%m-%d %H:%M WAT")
