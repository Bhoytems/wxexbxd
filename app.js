/* ============================================================
   CONFIG
============================================================ */
const TWELVE_KEY = "YOUR_API_KEY";   // ← PUT YOUR TWELVEDATA API KEY HERE

/* ============================================================
   ASSET LIST
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
   LOGO TOGGLE
============================================================ */
const logo = document.getElementById("logoCircle");
logo.addEventListener("click", () => {
  logo.style.animationPlayState =
    logo.style.animationPlayState === "paused" ? "running" : "paused";
});

/* ============================================================
   ANALYZE BUTTON COLOR TOGGLE
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
  if (!prices || prices.length === 0) return [];
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
  let macd = [];
  for (let i=0;i<emaSlow.length;i++)
    macd.push(emaFast[i] - emaSlow[i]);
  const sigLine = EMA(macd, signal);
  return { macd, signal: sigLine };
}

function detectMACDCross(macd, sig) {
  let arrows = [];
  for (let i=1;i<macd.length;i++){
    if (macd[i-1] < sig[i-1] && macd[i] > sig[i])
      arrows.push({ index: i, type: "BUY" });
    if (macd[i-1] > sig[i-1] && macd[i] < sig[i])
      arrows.push({ index: i, type: "SELL" });
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
function renderChart(ohlc, ma5, ma20, rsiArr, macdArrows) {
  document.getElementById("tvChart").innerHTML = "";
  const chart = LightweightCharts.createChart(document.getElementById("tvChart"), {
    layout:{ background:{color:"#0d1117"}, textColor:"#ccc" },
    grid:{ vertLines:{color:"#222"}, horzLines:{color:"#222"} },
    width: document.body.clientWidth,
    height: 360
  });

  let mainSeries;

  if (chartType === "candles") {
    mainSeries = chart.addCandlestickSeries({
      upColor:"#22c55e",
      downColor:"#ef4444",
      borderUpColor:"#22c55e",
      borderDownColor:"#ef4444"
    });
    mainSeries.setData(ohlc);
  }

  if (chartType === "line") {
    let lineData = ohlc.map(c => ({ time:c.time, value:c.close }));
    mainSeries = chart.addLineSeries({ color:"#4ea8ff", lineWidth:2 });
    mainSeries.setData(lineData);
  }

  if (chartType === "area") {
    let arr = ohlc.map(c => ({ time:c.time, value:c.close }));
    mainSeries = chart.addAreaSeries({
      topColor:"rgba(0,122,255,0.4)",
      bottomColor:"rgba(0,122,255,0.05)",
      lineColor:"#4ea8ff",
      lineWidth:2
    });
    mainSeries.setData(arr);
  }

  /* Moving averages */
  const ma5Series = chart.addLineSeries({ color:"#3b82f6", lineWidth:2 });
  const ma20Series = chart.addLineSeries({ color:"#a855f7", lineWidth:2 });

  ma5Series.setData(ohlc.map((c,i)=>({ time:c.time, value:ma5[i] })));
  ma20Series.setData(ohlc.map((c,i)=>({ time:c.time, value:ma20[i] })));

  /* RSI chart */
  document.getElementById("rsiChart").innerHTML = "";
  const rsiChart = LightweightCharts.createChart(document.getElementById("rsiChart"), {
    layout:{ background:{color:"#0d1117"}, textColor:"#ccc" },
    width: document.body.clientWidth,
    height: 140
  });

  const rsiLine = rsiChart.addLineSeries({ color:"#facc15", lineWidth:2 });
  rsiLine.setData(ohlc.map((c,i)=>({ time:c.time, value:rsiArr[i] })));
}

/* ============================================================
   MAIN ANALYZER (NOW SUPPORTS TWELVEDATA)
============================================================ */
async function generateSignal(){
  let market = document.getElementById("market").value;
  let asset  = document.getElementById("asset").value;
  let tf     = document.querySelector(".tf-btn.active")?.dataset.tf || "1m";

  let interval = tf;

  let url = "";
  let useTwelve = false;

  /* ======================
       CRYPTO → BINANCE
     ====================== */
  if (market === "crypto") {
    url = `https://api.binance.com/api/v3/klines?symbol=${asset}&interval=${interval}&limit=120`;
  }

  /* ======================
        FOREX → TWELVEDATA
     ====================== */
  if (market === "forex") {
    url =
      `https://api.twelvedata.com/time_series?symbol=${asset}` +
      `&interval=${interval}` +
      `&apikey=${TWELVE_KEY}` +
      `&outputsize=120`;
    useTwelve = true;
  }

  try {
    const res = await fetch(url);
    const data = await res.json();

    let ohlc;

    /* PARSE FOREX DATA */
    if (useTwelve) {
      const values = data.values.reverse();
      ohlc = values.map(v => ({
        time: new Date(v.datetime).getTime()/1000,
        open: +v.open,
        high: +v.high,
        low: +v.low,
        close:+v.close
      }));
    }

    /* PARSE CRYPTO DATA */
    else {
      ohlc = data.map(p => ({
        time: p[0]/1000,
        open:+p[1],
        high:+p[2],
        low:+p[3],
        close:+p[4]
      }));
    }

    const prices = ohlc.map(t=>t.close);

    /* Indicators */
    const ma5  = prices.map((_,i)=> i>=4  ? SMA(prices.slice(0,i+1),5)  : null);
    const ma20 = prices.map((_,i)=> i>=19 ? SMA(prices.slice(0,i+1),20) : null);

    const ema9  = EMA(prices, 9);
    const ema21 = EMA(prices, 21);

    const rsiArr = prices.map((_,i)=> i>=13 ? RSI(prices.slice(0,i+1),14) : null);

    const macdObj = MACD(prices);
    const arrows = detectMACDCross(macdObj.macd, macdObj.signal);

    /* TP/SL */
    const current = prices.at(-1);
    const atr = ATR(ohlc, 14);
    const SL = (current - atr*1.5).toFixed(5);
    const TP = (current + atr*2).toFixed(5);

    /* SIGNAL */
    let signal="HOLD", strength="Weak";

    if (ema9.at(-1) > ema21.at(-1) && rsiArr.at(-1) > 55) {
      signal = "BUY";
      strength = rsiArr.at(-1) > 65 ? "Strong" : "Moderate";
    }
    else if (ema9.at(-1) < ema21.at(-1) && rsiArr.at(-1) < 45) {
      signal = "SELL";
      strength = rsiArr.at(-1) < 35 ? "Strong" : "Moderate";
    }

    let colorClass = signal==="BUY" ? "buy" :
                     signal==="SELL" ? "sell" : "hold";

    /* UPDATE UI */
    document.getElementById("infoAsset").innerHTML = `${asset} — ${tf}`;
    document.getElementById("infoPrice").innerHTML = `$${current.toFixed(5)}`;

    document.getElementById("rsiVal").innerHTML = rsiArr.at(-1).toFixed(2);
    document.getElementById("ema9Val").innerHTML = ema9.at(-1).toFixed(5);
    document.getElementById("ema21Val").innerHTML = ema21.at(-1).toFixed(5);
    document.getElementById("slVal").innerHTML = SL;
    document.getElementById("tpVal").innerHTML = TP;

    document.getElementById("macdVal").innerHTML =
      macdObj.macd.at(-1).toFixed(5);

    let badge = document.getElementById("signalBadge");
    badge.className = "signal-badge " + colorClass;
    badge.innerHTML = `${signal} (${strength})`;

    /* Draw charts */
    renderChart(ohlc, ma5, ma20, rsiArr, arrows);

  } catch(err){
    console.error("Error loading market data:", err);
    document.getElementById("infoPrice").innerHTML = "<span style='color:red'>Error</span>";
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
    autoInterval = setInterval(generateSignal, 1000);
  }
});

/* First run */
generateSignal();
