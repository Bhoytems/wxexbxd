import os
import requests

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
API_BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"


def send_message(chat_id, text):
    """Sends a message to one chat/channel. Returns the Telegram message_id or None."""
    if not BOT_TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not set")
    resp = requests.post(
        f"{API_BASE}/sendMessage",
        json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
        timeout=10,
    )
    data = resp.json()
    if not data.get("ok"):
        raise RuntimeError(f"Telegram send failed for {chat_id}: {data}")
    return data["result"]["message_id"]


def broadcast(chat_ids, text):
    """Sends to multiple chats, returns {chat_id: message_id} for successful sends."""
    results = {}
    for chat_id in chat_ids:
        try:
            results[chat_id] = send_message(chat_id, text)
        except Exception as e:
            print(f"[telegram] failed to send to {chat_id}: {e}")
    return results


def format_signal_message(signal_id, asset_label, direction, expiry_minutes, sent_at_wat):
    arrow = "🟢 BUY (CALL)" if direction == "CALL" else "🔴 SELL (PUT)"
    return (
        f"<b>{arrow}</b>\n"
        f"Asset: <b>{asset_label}</b>\n"
        f"Expiry: {expiry_minutes} min\n"
        f"Time: {sent_at_wat}\n"
        f"Signal ID: <code>{signal_id}</code>"
    )


def format_result_message(signal_id, asset_label, direction, result, entry_price, exit_price):
    emoji = {"WIN": "✅", "LOSS": "❌", "TIE": "➖"}.get(result, "")
    return (
        f"<b>Result {emoji}</b>\n"
        f"Signal ID: <code>{signal_id}</code>\n"
        f"Asset: {asset_label} ({direction})\n"
        f"Entry: {entry_price}\n"
        f"Exit: {exit_price}\n"
        f"Outcome: <b>{result}</b>"
    )
