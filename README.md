# Signal Engine

Multi-timeframe signal engine + dashboard for GBPUSD OTC, XAUUSD OTC, and
Bitcoin OTC, sending BUY/SELL alerts to Telegram and posting the WIN/LOSS
result 5 minutes later.

## ⚠️ Before going live

**The signal logic in `strategy.py` is a placeholder** (multi-timeframe EMA
trend-alignment). It works end-to-end but is not the "new simple logic" you
mentioned — swap it in by editing `generate_signal()` in `strategy.py`. It's
the only function the rest of the app calls, so nothing else needs to change.

**Price data**: since IQ Option login was blocked by IP verification, this
uses `yfinance` (free, no key) against the live underlying markets as a proxy
for the OTC instruments — GBPUSD=X, GC=F (gold futures) for XAUUSD, BTC-USD.

## Local setup

```bash
pip install -r requirements.txt
cp .env.example .env   # fill in TELEGRAM_BOT_TOKEN at minimum
export $(cat .env | xargs)   # or use a tool like python-dotenv
python app.py
```

Visit `http://localhost:5000`, enter passcode `2005` (or your override).

## Getting a Telegram bot token + channel ID

1. Message **@BotFather** on Telegram → `/newbot` → copy the token into
   `TELEGRAM_BOT_TOKEN`.
2. Add the bot as an **admin** to your channel.
3. Get the channel's chat ID: forward any channel message to
   **@userinfobot**, or call `https://api.telegram.org/bot<TOKEN>/getUpdates`
   after posting in the channel — look for `"chat":{"id": -100...}`.
4. Paste that ID into the dashboard's "Telegram Channels" panel (you can add
   as many as you want).

## Deploying on Railway

1. Push this folder to a GitHub repo, create a new Railway project from it.
2. Railway auto-detects Python; the `Procfile` tells it to run Gunicorn with
   **1 worker** (important — the signal engine runs as a background thread
   inside the process; multiple workers would send duplicate signals).
3. Set environment variables in Railway's **Variables** tab:
   - `TELEGRAM_BOT_TOKEN`
   - `ENGINE_PASSCODE` (optional, defaults to `2005`)
   - `SECRET_KEY` (set a real random string)
4. **Attach a Volume** mounted at the project root (or set `DB_PATH` to a path
   inside it). Without this, `signal_engine.db` resets to defaults — toggles,
   channels, and signal history all wiped — on every redeploy, since Railway's
   filesystem is otherwise ephemeral.
5. Deploy. Visit the Railway-provided URL, enter your passcode, toggle on the
   assets you want, add your channel(s), and hit START.

## How results are tracked

Every signal gets a short ID (e.g. `A1B2C3D4`) shown in both the Telegram
message and the dashboard table. 5 minutes after sending, the engine checks
the price again and posts a follow-up message to the same channel(s) tagged
with that ID and WIN / LOSS / TIE.

## Project layout

```
app.py            Flask routes + dashboard
engine.py          Background polling loop (signals + results)
strategy.py         <-- swap your real signal logic in here
data_feed.py       Market data (yfinance, multi-timeframe)
telegram_bot.py    Telegram send + message formatting
storage.py         SQLite persistence (settings, channels, signals)
config.py          Passcode, assets, timeframes, timing
templates/         login.html, dashboard.html
static/            style.css (black theme), app.js
```
