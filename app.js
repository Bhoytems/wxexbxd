/* ============================================================
   CONFIG
============================================================ */
const TWELVE_KEY = "2fb822c09c1c42e19c07e94090f18b42";   // ← Insert your TwelveData key

/* ============================================================
   TIMEFRAME CONVERSION (Critical Fix)
============================================================ */
function mapTimeframe(tf, isForex) {
  if (!isForex) {
    // Binance uses identical chart TFs — all UI timeframes are supported.
    return tf;
  }

  // TwelveData mapping
  const mapping = {
    "1m": "1min",
    "3m": "5min",   // TwelveData does NOT support 3m
    "5m": "5min",
    "15m": "15min",
    "1h": "1h",
    "1d": "1day"
  };

  return mapping[tf] || "1min";
}

/* ============================================================
   ASSETS
============================================================ */
const cryptoAssets = {
  BTCUSDT: "Bitcoin (BTC/USDT)",
  ETHUSDT: "Ethereum (ETH/USDT)",
  SOLUSDT: "Solana (SOL/USDT)",
  DOGEUSDT: "Dogecoin (DOGE/USDT)",
  ADAUSDT: "Cardano (ADA/USDT)"
};

const forexAssets = {
  "EUR/USD": "EUR/USD",
  "GBP/USD": "GBP/USD",
  "USD/JPY": "USD/JPY",
  "AUD/USD": "AUD/USD",
  "USD/CAD": "USD/CAD"
};

function updateAssetOptions() {
  const isCrypto = document.getElementById("market").value === "crypto";
  const group = isCrypto ? cryptoAssets : forexAssets;
  let assetSel = document.getElementById("asset");
  assetSel.innerHTML = "";

  Object.entries(group).forEach(([v, t]) => {
    let opt = document.createElement("option");
    opt.value = v;
    opt.textContent = t;
    assetSel.appendChild(opt);
  });
}
updateAssetOptions();

/* ============================================================
   LOGO SPIN TOGGLE
============================================================ */
const logo = document.getElementById("logoCircle");
logo.addEventListener("click", () => {
  logo.style.animationPlayState =
    logo.style.animationPlayState === "paused" ? "running" : "paused";
});

/* ============================================================
   Analyze Button Color Toggle
============================================================ */
let analyzeColors = [
  "linear-gradient(90deg,#009dff,#007dff)",
  "linear-gradient(90deg,#22c55e,#16a34a)",
  "linear-gradient(90deg,#a855f7,#7e22ce)",
  "linear-gradient(90deg,#ef4444,#dc2626)"
];
let colorIndex = 0;

document.getElementById("btnRefresh").addEventListener("click", () => {
  colorIndex = (colorIndex + 1) % analyzeColors.length;
  document.getElementById("btnRefresh").style.background = analyzeColors[colorIndex];
});

/* ============================================================
   INDICATOR FUNCTIONS
============================================================ */
function SMA(arr, p) {
  if (!arr || arr.length < p) return null;
  return arr.slice(-p).reduce((a,b)=>a+b,0)/p;
}

function EMA(prices, period) {
  if (!prices.length) return [];
  const k = 2/(period+1);
  let ema = [prices[0]];
  for (let i=1;i<prices.length;i++)
    ema.push(prices[i]*k + ema[i-1]*(1-k));
  return ema;
}

function RSI(prices, period=14) {
  if (prices.length < 2) return 50;
  let gains=[], losses=[];
  for (let i=1;i<prices.length;i++){
    let d = prices[i]-prices[i-1];
    gains.push(d>0?d:0);
    losses.push(d<0?Math.abs(d):0);
  }
  if (gains.length < period) return 50;
  let avgG = SMA(gains, period);
  let avgL = SMA(losses, period);
  if (avgL === 0) return 100;
  let RS = avgG/avgL;
  return 100 - (100/(1+RS));
}

function ATR(ohlc, period=14){
  if (!ohlc || ohlc.length < period+1) return 0;
  let trs=[];
  for(let i=1;i<ohlc.length;i++){
    let h=ohlc[i].high, l=ohlc[i].low, pc=ohlc[i-1].close;
    trs.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
  }
  return SMA(trs, period) || 0;
}

/* ============================================================
   MACD
============================================================ */
function MACD(prices, fast=12, slow=26, signal=9) {
  const emaFast = EMA(prices, fast);
  const emaSlow = EMA(prices, slow);

  let macd = emaSlow.map((_,i) => emaFast[i] - emaSlow[i]);
  const sig = EMA(macd, signal);

  return { macd, signal: sig };
}

function detectMACDCross(macd, sig) {
  let arrows = [];
  for (let i=1;i<macd.length;i++){
    if (macd[i-1] < sig[i-1] && macd[i] > sig[i]) arrows.push({ index:i, type:"BUY" });
    if (macd[i-1] > sig[i-1] && macd[i] < sig[i]) arrows.push({ index:i, type:"SELL" });
  }
  return arrows;
}

/* ============================================================
   CHART TYPE
============================================================ */
let chartType = "candles";

document.getElementById("btnCross").onclick = () => {
  chartType = "candles";
  generateSignal();
};
document.getElementById("btnIndicators").onclick = () => {
  chartType = chartType === "line" ? "area" : "line";
  generateSignal();
};

/* ============================================================
   RENDER CHART
============================================================ */
function renderChart(ohlc, ma5, ma20, rsiArr) {
  document.getElementById("tvChart").innerHTML = "";

  const chart = LightweightCharts.createChart(document.getElementById("tvChart"), {
    layout:{ background:{color:"#0d1117"}, textColor:"#bbb" },
    grid:{ vertLines:{color:"#222"}, horzLines:{color:"#222"} },
    width: document.body.clientWidth,
    height: 360
  });

  let series;

  if (chartType === "candles") {
    series = chart.addCandlestickSeries({
      upColor:"#22c55e",
      downColor:"#ef4444",
      borderUpColor:"#22c55e",
      borderDownColor:"#ef4444"
    });
    series.setData(ohlc);
  }

  if (chartType === "line") {
    const list = ohlc.map(c=>({ time:c.time, value:c.close }));
    series = chart.addLineSeries({ color:"#4ea8ff", lineWidth:2 });
    series.setData(list);
  }

  if (chartType === "area") {
    const arr = ohlc.map(c=>({ time:c.time, value:c.close }));
    series = chart.addAreaSeries({
      topColor:"rgba(0,122,255,0.4)",
      bottomColor:"rgba(0,122,255,0.05)",
      lineColor:"#4ea8ff"
    });
    series.setData(arr);
  }

  /* Moving Averages */
  chart.addLineSeries({ color:"#3b82f6", lineWidth:2 })
       .setData(ohlc.map((c,i)=>({ time:c.time, value:ma5[i] })));

  chart.addLineSeries({ color:"#a855f7", lineWidth:2 })
       .setData(ohlc.map((c,i)=>({ time:c.time, value:ma20[i] })));

  /* RSI chart */
  document.getElementById("rsiChart").innerHTML = "";
  const rsiChart = LightweightCharts.createChart(
    document.getElementById("rsiChart"),
    {
      layout:{ background:{color:"#0d1117"}, textColor:"#ccc" },
      width: document.body.clientWidth,
      height: 140
    }
  );

  rsiChart.addLineSeries({
    color:"#facc15", lineWidth:2
  }).setData(ohlc.map((c,i)=>({ time:c.time, value:rsiArr[i] })));
}

/* ============================================================
   MAIN ANALYZER — NOW 100% FIXED
============================================================ */
async function generateSignal(){
  const market = document.getElementById("market").value;
  const asset = document.getElementById("asset").value;
  const tf = document.querySelector(".tf-btn.active")?.dataset.tf || "1m";

  /* Timeframe Conversion FIX */
  const interval = mapTimeframe(tf, market === "forex");

  let url = "";
  let parseAsForex = false;

  /* Crypto (Binance) */
  if (market === "crypto") {
    url =
      `https://api.binance.com/api/v3/klines?symbol=${asset}` +
      `&interval=${interval}&limit=150`;
  }

  /* Forex (TwelveData) */
  if (market === "forex") {
    url =
      `https://api.twelvedata.com/time_series?symbol=${asset}` +
      `&interval=${interval}&apikey=${TWELVE_KEY}` +
      `&outputsize=150`;
    parseAsForex = true;
  }

  try {
    const res = await fetch(url);
    const data = await res.json();

    let ohlc;

    /* PARSE TWELVEDATA */
    if (parseAsForex) {
      const values = data.values.reverse();
      ohlc = values.map(v => ({
        time: new Date(v.datetime).getTime()/1000,
        open:+v.open,
        high:+v.high,
        low:+v.low,
        close:+v.close
      }));
    }

    /* PARSE BINANCE */
    else {
      ohlc = data.map(p => ({
        time:p[0]/1000,
        open:+p[1],
        high:+p[2],
        low:+p[3],
        close:+p[4]
      }));
    }

    const prices = ohlc.map(c=>c.close);

    /* Indicators */
    const ma5  = prices.map((_,i)=> i>=4  ? SMA(prices.slice(0,i+1),5)  : null);
    const ma20 = prices.map((_,i)=> i>=19 ? SMA(prices.slice(0,i+1),20) : null);

    const ema9  = EMA(prices, 9);
    const ema21 = EMA(prices, 21);

    const rsiArr = prices.map((_,i)=> i>=13 ? RSI(prices.slice(0,i+1)) : null);

    const macdObj = MACD(prices);

    const atr = ATR(ohlc);
    const current = prices.at(-1);

    const SL = (current - atr*1.5).toFixed(5);
    const TP = (current + atr*2).toFixed(5);

    /* Generate Signal */
    let signal = "HOLD";
    let strength = "Weak";

    const rsi = rsiArr.at(-1);
    const e9 = ema9.at(-1);
    const e21 = ema21.at(-1);

    if (e9 > e21 && rsi > 55) {
      signal = "BUY";
      strength = rsi>65 ? "Strong" : "Moderate";
    }
    else if (e9 < e21 && rsi < 45) {
      signal = "SELL";
      strength = rsi<35 ? "Strong" : "Moderate";
    }

    const colorClass =
      signal==="BUY" ? "buy" :
      signal==="SELL" ? "sell" : "hold";

    /* UPDATE UI */
    document.getElementById("infoAsset").innerHTML = `${asset} — ${tf}`;
    document.getElementById("infoPrice").innerHTML = `$${current.toFixed(5)}`;

    document.getElementById("rsiVal").innerHTML = rsi.toFixed(2);
    document.getElementById("ema9Val").innerHTML = e9.toFixed(5);
    document.getElementById("ema21Val").innerHTML = e21.toFixed(5);

    document.getElementById("slVal").innerHTML = SL;
    document.getElementById("tpVal").innerHTML = TP;

    document.getElementById("macdVal").innerHTML =
      macdObj.macd.at(-1).toFixed(5);

    let badge = document.getElementById("signalBadge");
    badge.className = "signal-badge " + colorClass;
    badge.innerHTML = `${signal} (${strength})`;

    renderChart(ohlc, ma5, ma20, rsiArr);

  } catch (err) {
    console.error("Data load error:", err);
    document.getElementById("infoPrice").innerHTML =
      "<span style='color:red'>Error</span>";
  }
}

/* ============================================================
   AUTO REFRESH
============================================================ */
let autoInterval=null;

document.getElementById("autoRefresh").addEventListener("change", ()=>{
  if (autoInterval) clearInterval(autoInterval);
  if (document.getElementById("autoRefresh").checked){
    generateSignal();
    autoInterval = setInterval(generateSignal, 5000);
  }
});

/* First load */
generateSignal();
