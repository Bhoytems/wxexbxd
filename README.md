# 🤖 FractalBot — Deployment Guide
## Deploy to Railway from your Android phone

---

## What you need
- A GitHub account (free) → github.com
- A Railway account (free) → railway.app
- These project files

---

## STEP 1 — Create a GitHub account
1. Open your browser and go to **github.com**
2. Tap **Sign up** and create a free account
3. Verify your email

---

## STEP 2 — Upload your bot files to GitHub
1. After logging in to GitHub, tap the **+** icon (top right)
2. Select **New repository**
3. Name it: `fractalbot`
4. Set it to **Private**
5. Tap **Create repository**
6. On the next page, tap **uploading an existing file**
7. Upload ALL these files:
   - `app.py`
   - `trader.py`
   - `requirements.txt`
   - `Procfile`
   - `railway.json`
   - The `templates` folder with `index.html` inside

8. Tap **Commit changes**

---

## STEP 3 — Create a Railway account
1. Go to **railway.app**
2. Tap **Login** → **Login with GitHub**
3. Authorize Railway to access your GitHub

---

## STEP 4 — Deploy to Railway
1. On Railway dashboard, tap **New Project**
2. Select **Deploy from GitHub repo**
3. Choose your `fractalbot` repository
4. Railway will automatically detect and deploy it
5. Wait about 2–3 minutes for the build to complete

---

## STEP 5 — Set your app password (optional but recommended)
1. In Railway, open your project
2. Go to **Variables** tab
3. Add this variable:
   - Name: `APP_PASSWORD`
   - Value: `MOTOMORI`
4. Tap **Save** — Railway will restart automatically

---

## STEP 6 — Get your webapp link
1. In Railway, go to your project → **Settings**
2. Under **Domains**, tap **Generate Domain**
3. You'll get a link like: `fractalbot-production.up.railway.app`
4. **Bookmark this link** on your phone browser
5. This link works 24/7 forever — share it with no one!

---

## How to use the webapp
1. Open your Railway link in your phone browser
2. Enter password: **MOTOMORI**
3. Enter your IQ Option email + password
4. Choose Demo or Real account
5. Enter your trade amount (minimum ₦450 for Real)
6. Tap **Start Bot**
7. The bot runs 24/7 — close your browser, turn off your phone, it keeps trading!

---

## ⚠️ Important Notes
- Always **test on Demo first** before switching to Real
- The bot only trades when it finds valid signals — it won't force trades
- Trade results appear in the dashboard with ✅ Win / ❌ Loss
- The bot auto-reconnects if IQ Option disconnects it
- To stop trading: open the webapp and tap **Stop Bot**
- To fully logout: tap the ⏻ button in the top right

---

## Strategy Summary
The bot looks for these exact patterns on 5-minute candles:

| Signal | Pattern | Trade |
|--------|---------|-------|
| 🟢 BUY  | Hammer candle + Period-3 Fractal Low below it | CALL |
| 🔴 SELL | Shooting Star candle + Period-3 Fractal High above it | PUT |

- Expiry: **5 minutes**
- Pairs: **All available pairs** on IQ Option
- Fractal period: **3** (matches your IQ Option settings exactly)

---

## Support
If the bot stops working after an IQ Option platform update,
the iqoptionapi library may need updating. Check:
https://github.com/Lu-Yi-Hsun/iqoptionapi
