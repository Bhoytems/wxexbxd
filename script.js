// ===========================
// Pro v4.2 App JS
// ===========================

/* ---------- Global state / chart refs ---------- */
let chart = null;
let candlesSeries = null;
let ma5Series = null;
let ma20Series = null;
let rsiChart = null;
let rsiSeries = null;
let currentTF = "1m";
let autoRefreshInterval = null;
let autoEnabled = false;
let useCrosshair = true;
let indicatorsVisible = true;

/* ---------- Element refs ---------- */
const assetSel = document.getElementById("asset");
const marketSel = document.getElementById("market");
const priceText = document.getElementById("priceText");
const signalBadge = document.getElementById("signalBadge");
const infoRows = document.getElementById("infoRows");
const tvContainer = document.getElementById("tvChart");
const rsiContainer = document.getElementById("rsiChart");
const logoCircle = document.getElementById("logoCircle");
const logoWrap = document.getElementById("logoWrap");

/* ---------- Assets (same as original) ---------- */
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

/* ---------- UI init ---------- */
function updateAssetOptions(){
  const isCrypto = marketSel.value === "crypto";
  const group = isCrypto ? cryptoAssets : forexAssets;
  assetSel.innerHTML = "";
  Object.entries(group).forEach(([v,t])=>{
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = t;
    assetSel.appendChild(opt);
  });
}
updateAssetOptions();
marketSel.addEventListener("change", ()=>{ updateAssetOptions(); });

/* ---------- trading toolbar handlers ---------- */
document.querySelectorAll(".tf-btn").forEach(b=>{
  b.addEventListener("click", (ev)=>{
    document.querySelectorAll(".tf-btn").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    currentTF = b.dataset.tf;
    // Normalize to Binance interval map used in internal TF mapping
    generateSignal();
  });
});

document.getElementById("btnCross").addEventListener("click", ()=>{
  useCrosshair = !useCrosshair;
  document.getElementById("btnCross").textContent = useCrosshair ? "Crosshair" : "Cross off";
  // lightweight-charts crosshair toggling is limited: we emulate by applyOptions
  if (chart) chart.applyOptions({ localization: {}, crosshair: { mode: useCrosshair ? 0 : -1 }});
});

document.getElementById("btnIndicators").addEventListener("click", ()=>{
  indicatorsVisible = !indicatorsVisible;
  document.getElementById("btnIndicators").textContent = indicatorsVisible ? "Indicators" : "Ind off";
  if (ma5Series) ma5Series.applyOptions({ visible: indicatorsVisible });
  if (ma20Series) ma20Series.applyOptions({ visible: indicatorsVisible });
  if (rsiChart) rsiChart.applyOptions({ visible: indicatorsVisible });
});

document.getElementById("btnRefresh").addEventListener("click", ()=>generateSignal());
document.getElementById("autoRefresh").addEventListener("change",(e)=>{
  autoEnabled = e.target.checked;
  toggleAutoRefresh();
});

/* logo spin toggle */
logoWrap.addEventListener("click", ()=>{
  logoCircle.classList.toggle("paused");
});

/* ---------- Indicator helpers (from original) ---------- */
function SMA(arr, p) {
  if (!arr || arr.length < p) return null;
  return arr.slice(-p).reduce((a,b)=>a+b,0)/p;
}
function EMA(prices, period) {
  if (!prices || prices.length === 0) return [];
  const k = 2/(period+1);
  let ema = [prices[0]];
  for (let i=1;i<prices.length;i++) ema.push(prices[i]*k + ema[i-1]*(1-k));
  return ema;
}
function RSI(prices, period=14) {
  if (!prices || prices.length < 2) return 50;
  let gains=[], losses=[];
  for (let i=1;i<prices.length;i++){
    let d = prices[i]-prices[i-1];
    gains.push(d>0?d:0);
    losses.push(d<0?Math.abs(d):0);
  }
  if (gains.length < period) return 50;
  let avgG = SMA(gains, period), avgL = SMA(losses, period);
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
function MACD(prices, fast=12, slow=26, signal=9) {
  const emaFast = EMA(prices, fast);
  const emaSlow = EMA(prices, slow);
  const length = Math.min(emaFast.length, emaSlow.length);
  let macd = [];
  for (let i=0;i<length;i++) macd.push(emaFast[i] - emaSlow[i]);
  const sigLine = EMA(macd, signal);
  return { macd, signal: sigLine };
}
function detectMACDCross(macd, sig) {
  let arrows = [];
  for (let i=1;i<macd.length && i<sig.length;i++) {
    if (macd[i-1] < sig[i-1] && macd[i] > sig[i]) arrows.push({ index: i, type: "BUY" });
    if (macd[i-1] > sig[i-1] && macd[i] < sig[i]) arrows.push({ index: i, type: "SELL" });
  }
  return arrows;
}

/* ---------- Chart init / resize ---------- */
function initCharts() {
  // dispose existing charts by clearing containers (lightweight-charts singleton isn't heavy)
  tvContainer.innerHTML = "";
  rsiContainer.innerHTML = "";

  chart = LightweightCharts.createChart(tvContainer, {
    layout:{ background:{color:"#0d1117"}, textColor:"#cbd5e1" },
    grid:{ vertLines:{color:"#0b0b0b"}, horzLines:{color:"#0b0b0b"} },
    width: tvContainer.clientWidth,
    height: Math.max(260, Math.round(window.innerHeight * 0.45))
  });

  candlesSeries = chart.addCandlestickSeries({
    upColor:"#22c55e", downColor:"#ef4444",
    borderUpColor:"#22c55e", borderDownColor:"#ef4444"
  });

  ma5Series = chart.addLineSeries({ color:"#3b82f6", lineWidth:2, visible: indicatorsVisible });
  ma20Series = chart.addLineSeries({ color:"#a855f7", lineWidth:2, visible: indicatorsVisible });

  rsiChart = LightweightCharts.createChart(rsiContainer, {
    layout:{ background:{color:"#0d1117"}, textColor:"#cbd5e1" },
    width: rsiContainer.clientWidth,
    height: Math.max(90, Math.round(window.innerHeight * 0.18))
  });
  rsiSeries = rsiChart.addLineSeries({ color:"#facc15", lineWidth:2, visible: indicatorsVisible });

  // crosshair
  chart.applyOptions({ crosshair: { mode: useCrosshair ? 0 : -1 }});
}

/* adapt charts to new sizes on orientation/window change */
window.addEventListener("resize", ()=>{
  if (chart) {
    chart.resize(tvContainer.clientWidth, Math.max(260, Math.round(window.innerHeight * 0.45)));
  }
  if (rsiChart) {
    rsiChart.resize(rsiContainer.clientWidth, Math.max(90, Math.round(window.innerHeight * 0.18)));
  }
});

/* ---------- Render chart function (similar to original) ---------- */
function renderChart(ohlc, ma5, ma20, rsiArr, macdArrows) {
  // init or re-init charts
  if (!chart) initCharts();

  candlesSeries.setData(ohlc);

  // map ma arrays into series values aligned with ohlc times
  const ma5Data = ohlc.map((c,i)=>({ time:c.time, value: (ma5[i] !== undefined ? ma5[i] : null) })).filter(d=>d.value!==null);
  const ma20Data = ohlc.map((c,i)=>({ time:c.time, value: (ma20[i] !== undefined ? ma20[i] : null) })).filter(d=>d.value!==null);

  ma5Series.setData(ma5Data);
  ma20Series.setData(ma20Data);

  // markers
  const markers = macdArrows.map(a => {
    const candle = ohlc[a.index];
    if (!candle) return null;
    const isBuy = a.type === "BUY";
    return {
      time: candle.time,
      position: isBuy ? 'belowBar' : 'aboveBar',
      color: isBuy ? '#22c55e' : '#ef4444',
      shape: isBuy ? 'arrowUp' : 'arrowDown',
      text: a.type
    };
  }).filter(Boolean);
  candlesSeries.setMarkers(markers);

  // RSI
  const rsiData = ohlc.map((c,i)=>({ time: c.time, value: (rsiArr[i] !== undefined ? rsiArr[i] : null) })).filter(d=>d.value!==null);
  rsiSeries.setData(rsiData);
}

/* ---------- TF mapping util (map toolbar TF to Binance interval) ---------- */
function mapTFtoInterval(tf){
  // minimal mapping comfortable for Binance endpoints (user can extend)
  const map = {
    "1m": "1m",
    "3m": "3m",
    "5m": "5m",
    "15m":"15m",
    "1h":"1h",
    "1d":"1d"
  };
  return map[tf] || "1m";
}

/* ---------- MAIN SIGNAL FUNCTION (fetching + logic) ---------- */
async function generateSignal(){
  const market = marketSel.value;
  const asset = assetSel.value;
  const tf = currentTF;
  const out = infoRows;

  out.innerHTML = `<p>⏳ Fetching ${asset} ${tf} ...</p>`;

  try {
    const interval = mapTFtoInterval(tf);
    // handle forex assets by providing a synthetic data route or returning error.
    // For Telegram webapp usage we assume crypto symbols (Binance) are common; for forex you may supply your own OHLC source.
    let url;
    if (market === "crypto") {
      url = `https://api.binance.com/api/v3/klines?symbol=${asset}&interval=${interval}&limit=240`;
    } else {
      // For forex a simple fallback: use Binance symbol if pair matches or return error.
      // We'll try symbol without slash (e.g., EURUSD). Binance often doesn't serve FX; user should replace with a provider.
      url = `https://api.binance.com/api/v3/klines?symbol=${asset}&interval=${interval}&limit=240`;
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Data fetch failed: ${res.status} ${res.statusText}`);
    const data = await res.json();

    const ohlc = data.map(p => ({ time: p[0]/1000, open: +p[1], high:+p[2], low:+p[3], close:+p[4] }));
    const prices = ohlc.map(v=>v.close);

    // indicators (same logic)
    const ma5 = prices.map((_,i)=> (i+1)>=5 ? SMA(prices.slice(0,i+1),5) : null );
    const ma20 = prices.map((_,i)=> (i+1)>=20 ? SMA(prices.slice(0,i+1),20) : null );
    const ema9 = EMA(prices, 9);
    const ema21 = EMA(prices, 21);
    const rsiArr = prices.map((_,i)=> (i+1)>=14 ? RSI(prices.slice(0,i+1),14) : null );

    const macdObj = MACD(prices);
    const arrows = detectMACDCross(macdObj.macd, macdObj.signal);

    const current = prices.at(-1);
    const atr = ATR(ohlc, 14);
    const SL = (current - atr*1.5).toFixed(6);
    const TP = (current + atr*2).toFixed(6);

    // signal decision (same as original)
    let signal = "HOLD", strength = "Weak";
    if (ema9.at(-1) !== undefined && ema21.at(-1) !== undefined && rsiArr.at(-1) !== null) {
      if (ema9.at(-1) > ema21.at(-1) && rsiArr.at(-1) > 55) {
        signal="BUY"; strength = rsiArr.at(-1)>65 ? "Strong" : "Moderate";
      } else if (ema9.at(-1) < ema21.at(-1) && rsiArr.at(-1) < 45) {
        signal="SELL"; strength = rsiArr.at(-1)<35 ? "Strong" : "Moderate";
      }
    }

    // Update UI (price + badge)
    priceText.textContent = `$${current.toFixed(4)}`;
    updateBadge(signal);

    out.innerHTML = `
      <p><b>Asset:</b> ${asset}  <b>TF:</b> ${tf}</p>
      <p>EMA9: ${ (ema9.at(-1) || 0).toFixed(4) } | EMA21: ${ (ema21.at(-1) || 0).toFixed(4) } | RSI: ${(rsiArr.at(-1)||0).toFixed(2)}</p>
      <p><b>SL:</b> ${SL} &nbsp; | &nbsp; <b>TP:</b> ${TP} &nbsp; | &nbsp; ATR: ${atr.toFixed(6)}</p>
      <p>Signal strength: ${strength}</p>
    `;

    // Render
    // lightweight-charts uses integer unix timestamps for the 'time' key when working with second resolution
    const formatted = ohlc.map(c => ({ time: c.time, open:c.open, high:c.high, low:c.low, close:c.close }));
    renderChart(formatted, ma5, ma20, rsiArr, arrows);

  } catch (err) {
    out.innerHTML = `<p style="color:tomato;">❌ ${err.message}</p>`;
    console.error(err);
  }
}

/* update badge look */
function updateBadge(sig) {
  signalBadge.className = "signal";
  if (sig === "BUY") { signalBadge.classList.add("buy"); signalBadge.textContent = "BUY"; }
  else if (sig === "SELL") { signalBadge.classList.add("sell"); signalBadge.textContent = "SELL"; }
  else { signalBadge.classList.add("hold"); signalBadge.textContent = "HOLD"; }
}

/* ---------- Auto refresh ---------- */
function toggleAutoRefresh(){
  clearInterval(autoRefreshInterval);
  if (autoEnabled) {
    generateSignal();
    autoRefreshInterval = setInterval(generateSignal, 5000);
  }
}

/* ---------- start up ---------- */
(function boot(){
  // pre-populate assets and run initial draw
  updateAssetOptions();

  // prefer BTC by default if present
  assetSel.value = assetSel.querySelector("option") ? assetSel.querySelector("option").value : "";

  initCharts();
  generateSignal();

  // small UX: when asset changes, refresh
  assetSel.addEventListener("change", ()=>generateSignal());
  marketSel.addEventListener("change", ()=>generateSignal());

  // attempt to expand the Telegram WebApp if available
  try {
    if (window.Telegram && Telegram.WebApp && Telegram.WebApp.expand) {
      Telegram.WebApp.expand();
    }
  } catch (e) { /* ignore */ }
})();
