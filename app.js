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
  "EURUSD": "EUR/USD",
  "GBPUSD": "GBP/USD",
  "USDJPY": "USD/JPY",
  "AUDUSD": "AUD/USD",
  "USDCAD": "USD/CAD"
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
   ANALYZE BUTTON COLOR TOGGLE
============================================================ */
let analyzeColors = [
  "linear-gradient(90deg,#009dff,#007dff)", // blue
  "linear-gradient(90deg,#22c55e,#16a34a)", // green
  "linear-gradient(90deg,#a855f7,#7e22ce)", // purple
  "linear-gradient(90deg,#ef4444,#dc2626)"  // red
];
let colorIndex = 0;

function toggleAnalyzeButton() {
  colorIndex = (colorIndex + 1) % analyzeColors.length;
  document.getElementById("analyzeBtn").style.background = analyzeColors[colorIndex];
}

/* ============================================================
   TECHNICAL INDICATOR FUNCTIONS
============================================================ */
function SMA(arr, p) {
  if (!arr || arr.length < p) return null;
  return arr.slice(-p).reduce((a,b)=>a+b,0)/p;
}

function EMA(prices, period) {
  if (!prices || prices.length === 0) return [];
  const k = 2/(period+1);
  let ema = [prices[0]];
  for (let i=1;i<prices.length;i++) {
    ema.push(prices[i]*k + ema[i-1]*(1-k));
  }
  return ema;
}

function RSI(prices, period=14) {
  if (!prices || prices.length < 2) return 50;

  let gains = [];
  let losses = [];

  for (let i=1; i<prices.length; i++){
    let d = prices[i] - prices[i-1];
    gains.push(d>0?d:0);
    losses.push(d<0?Math.abs(d):0);
  }

  if (gains.length < period) return 50;

  let avgG = SMA(gains, period);
  let avgL = SMA(losses, period);

  if (avgL === 0) return 100;

  let RS = avgG / avgL;
  return 100 - (100 / (1 + RS));
}

function ATR(ohlc, period=14){
  if (!ohlc || ohlc.length < period+1) return 0;

  let trs = [];
  for(let i=1; i<ohlc.length; i++){
    let h = ohlc[i].high;
    let l = ohlc[i].low;
    let pc = ohlc[i-1].close;
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
  const len = Math.min(emaFast.length, emaSlow.length);
  let macd = [];

  for (let i=0; i<len; i++) {
    macd.push(emaFast[i] - emaSlow[i]);
  }

  const sigLine = EMA(macd, signal);
  return { macd, signal: sigLine };
}

function detectMACDCross(macd, sig) {
  let arrows = [];

  for (let i=1; i<macd.length && i<sig.length; i++) {
    if (macd[i-1] < sig[i-1] && macd[i] > sig[i])
      arrows.push({ index: i, type: "BUY" });

    if (macd[i-1] > sig[i-1] && macd[i] < sig[i])
      arrows.push({ index: i, type: "SELL" });
  }

  return arrows;
}

/* ============================================================
   CHART TYPE TRACKING
============================================================ */
let chartType = "candles";

function setChartType(type) {
  chartType = type;
  generateSignal();
}

/* ============================================================
   RENDER CHART
============================================================ */
function renderChart(ohlc, ma5, ma20, rsiArr, macdArrows) {
  const container = document.getElementById("tvChart");
  container.innerHTML = "";

  const chart = LightweightCharts.createChart(container, {
    layout:{ background:{color:"#0d1117"}, textColor:"#ccc" },
    grid:{ vertLines:{color:"#222"}, horzLines:{color:"#222"} },
    width: container.clientWidth,
    height: 380
  });

  let mainSeries;

  if (chartType === "candles") {
    mainSeries = chart.addCandlestickSeries({
      upColor:"#22c55e", downColor:"#ef4444",
      borderUpColor:"#22c55e", borderDownColor:"#ef4444"
    });
    mainSeries.setData(ohlc);
  }

  if (chartType === "line") {
    let lineData = ohlc.map(c => ({ time:c.time, value:c.close }));
    mainSeries = chart.addLineSeries({ color:"#4ea8ff", lineWidth:2 });
    mainSeries.setData(lineData);
  }

  if (chartType === "area") {
    let areaData = ohlc.map(c => ({ time:c.time, value:c.close }));
    mainSeries = chart.addAreaSeries({
      topColor:"rgba(0,122,255,0.4)",
      bottomColor:"rgba(0,122,255,0.05)",
      lineColor:"#4ea8ff",
      lineWidth:2
    });
    mainSeries.setData(areaData);
  }

  /* MOVING AVERAGES */
  const ma5Data = ohlc.map((c,i)=>({ time:c.time, value: ma5[i] || null }));
  const ma20Data = ohlc.map((c,i)=>({ time:c.time, value: ma20[i] || null }));

  const ma5Series = chart.addLineSeries({ color:"#3b82f6", lineWidth:2 });
  const ma20Series = chart.addLineSeries({ color:"#a855f7", lineWidth:2 });

  ma5Series.setData(ma5Data.filter(t=>t.value));
  ma20Series.setData(ma20Data.filter(t=>t.value));

  /* MACD ARROWS */
  if (chartType === "candles") {
    const markers = macdArrows.map(a => {
      const candle = ohlc[a.index];
      if (!candle) return null;
      return {
        time: candle.time,
        position: a.type==="BUY" ? 'belowBar' : 'aboveBar',
        color: a.type==="BUY" ? '#22c55e' : '#ef4444',
        shape: a.type==="BUY" ? 'arrowUp' : 'arrowDown',
        text: a.type
      };
    }).filter(Boolean);

    mainSeries.setMarkers(markers);
  }

  /* RSI CHART */
  const rsiBox = document.getElementById("rsiChart");
  rsiBox.innerHTML = "";

  const rsiChart = LightweightCharts.createChart(rsiBox, {
    layout:{ background:{color:"#0d1117"}, textColor:"#ccc" },
    width:rsiBox.clientWidth,
    height:140
  });

  const rsiLine = rsiChart.addLineSeries({ color:"#facc15", lineWidth:2 });
  const rsiData = ohlc.map((c,i)=>({ time:c.time, value: rsiArr[i] || null }));
  rsiLine.setData(rsiData.filter(p=>p.value));
}

/* ============================================================
   MAIN SIGNAL FUNCTION
============================================================ */
async function generateSignal(){
  let market = document.getElementById("market").value;
  let asset = document.getElementById("asset").value;
  let tf = document.getElementById("timeframe").value;

  const tfMap = { "5s":"1m", "30s":"1m", "1m":"1m", "3m":"3m", "5m":"5m" };
  let interval = tfMap[tf];

  try {
    const url=`https://api.binance.com/api/v3/klines?symbol=${asset}&interval=${interval}&limit=120`;
    const res = await fetch(url);
    const data = await res.json();

    const ohlc = data.map(p => ({
      time: p[0]/1000,
      open:+p[1], high:+p[2], low:+p[3], close:+p[4]
    }));

    const prices = ohlc.map(v=>v.close);

    /* INDICATORS */
    const ma5  = prices.map((_,i)=> (i+1)>=5  ? SMA(prices.slice(0,i+1),5)  : null);
    const ma20 = prices.map((_,i)=> (i+1)>=20 ? SMA(prices.slice(0,i+1),20) : null);

    const ema9  = EMA(prices, 9);
    const ema21 = EMA(prices, 21);

    const rsiArr = prices.map((_,i)=> (i+1)>=14 ? RSI(prices.slice(0,i+1),14) : null);

    const macdObj = MACD(prices);
    const arrows = detectMACDCross(macdObj.macd, macdObj.signal);

    /* TP / SL */
    const current = prices.at(-1);
    const atr = ATR(ohlc, 14);
    const SL = (current - atr*1.5).toFixed(4);
    const TP = (current + atr*2).toFixed(4);

    /* SIGNAL LOGIC */
    let signal="HOLD", strength="Weak";

    if (ema9.at(-1) > ema21.at(-1) && rsiArr.at(-1) > 55) {
      signal="BUY"; 
      strength = rsiArr.at(-1) > 65 ? "Strong" : "Moderate";
    }
    else if (ema9.at(-1) < ema21.at(-1) && rsiArr.at(-1) < 45) {
      signal="SELL";
      strength = rsiArr.at(-1) < 35 ? "Strong" : "Moderate";
    }

    let colorClass =
      signal==="BUY" ? "buy" :
      signal==="SELL" ? "sell" : "hold";

    /* INSERT INTO STATS BOX ABOVE CHART */
    document.getElementById("statsBox").innerHTML = `
      <div><b>${asset}</b> — <b>${tf}</b></div>

      <div style="margin-top:6px;">
        Price: <b>$${current.toFixed(4)}</b> |
        RSI: <b>${(rsiArr.at(-1) || 0).toFixed(2)}</b>
      </div>

      <div style="margin-top:6px;">
        SL: <b class="sell">${SL}</b> |
        TP: <b class="buy">${TP}</b>
      </div>

      <div style="margin-top:6px;">
        EMA9: <b>${ema9.at(-1).toFixed(4)}</b> |
        EMA21: <b>${ema21.at(-1).toFixed(4)}</b>
      </div>

      <div class="signal ${colorClass}" style="margin-top:10px;">
        ${signal} — ${strength}
      </div>
    `;

    /* RENDER THE CHART */
    renderChart(ohlc, ma5, ma20, rsiArr, arrows);

  } catch(err){
    console.error(err);
    document.getElementById("statsBox").innerHTML =
      `<span style="color:red;">Error fetching data</span>`;
  }
}

/* ============================================================
   AUTO REFRESH
============================================================ */
let autoRefreshInterval=null;

function toggleAutoRefresh(){
  if(document.getElementById("autoRefresh").checked){
    generateSignal();
    autoRefreshInterval=setInterval(generateSignal,5000);
  } else {
    clearInterval(autoRefreshInterval);
  }
}
