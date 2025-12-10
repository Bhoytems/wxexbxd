/* ======== GLOBALS ======== */
let chart, candlesSeries, ma5Series, ma20Series;
let rsiChart, rsiSeries;
let currentTF = "1m";
let autoTimer = null;
let crosshairOn = true;
let indicatorsOn = true;

/* ======== ELEMENTS ======== */
const marketSel = document.getElementById("market");
const assetSel  = document.getElementById("asset");

const infoAsset = document.getElementById("infoAsset");
const infoPrice = document.getElementById("infoPrice");
const rsiVal    = document.getElementById("rsiVal");
const ema9Val   = document.getElementById("ema9Val");
const ema21Val  = document.getElementById("ema21Val");
const macdVal   = document.getElementById("macdVal");
const slVal     = document.getElementById("slVal");
const tpVal     = document.getElementById("tpVal");

const signalBadge = document.getElementById("signalBadge");

const logoCircle = document.getElementById("logoCircle");

/* ======== ASSETS ======== */
const cryptoAssets = {
  BTCUSDT:"Bitcoin (BTC/USDT)",
  ETHUSDT:"Ethereum (ETH/USDT)",
  SOLUSDT:"Solana (SOL/USDT)",
  DOGEUSDT:"Dogecoin (DOGE/USDT)",
  ADAUSDT:"Cardano (ADA/USDT)"
};
const forexAssets = {
  "EURUSD":"EUR/USD",
  "GBPUSD":"GBP/USD",
  "USDJPY":"USD/JPY",
  "AUDUSD":"AUD/USD",
  "USDCAD":"USD/CAD"
};

function fillAssets(){
  const group = marketSel.value==="crypto" ? cryptoAssets : forexAssets;
  assetSel.innerHTML = "";
  Object.entries(group).forEach(([v,t])=>{
    const o=document.createElement("option");
    o.value=v; o.textContent=t;
    assetSel.appendChild(o);
  });
}
fillAssets();

/* ======== SMALL HELPERS ======== */
function SMA(arr,p){
  if(arr.length<p) return null;
  return arr.slice(-p).reduce((a,b)=>a+b,0)/p;
}
function EMA(prices,period){
  const k=2/(period+1);
  const ema=[prices[0]];
  for(let i=1;i<prices.length;i++){
    ema.push(prices[i]*k+ema[i-1]*(1-k));
  }
  return ema;
}
function RSI(prices,period=14){
  if(prices.length<2) return 50;
  let gain=[],loss=[];
  for(let i=1;i<prices.length;i++){
    const d=prices[i]-prices[i-1];
    gain.push(d>0?d:0);
    loss.push(d<0?Math.abs(d):0);
  }
  const avgG=SMA(gain,period), avgL=SMA(loss,period);
  if(avgL===0) return 100;
  const RS=avgG/avgL;
  return 100-(100/(1+RS));
}
function ATR(ohlc,period=14){
  const trs=[];
  for(let i=1;i<ohlc.length;i++){
    const h=ohlc[i].high, l=ohlc[i].low, pc=ohlc[i-1].close;
    trs.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)));
  }
  return SMA(trs,period) || 0;
}
function MACD(prices,fast=12,slow=26,signal=9){
  const ef=EMA(prices,fast);
  const es=EMA(prices,slow);
  const len=Math.min(ef.length,es.length);
  const mac=[];
  for(let i=0;i<len;i++) mac.push(ef[i]-es[i]);
  const sig=EMA(mac,signal);
  return {macd:mac,signal:sig};
}
function detectMACD(macd,sig){
  const arr=[];
  for(let i=1;i<macd.length && i<sig.length;i++){
    if(macd[i-1]<sig[i-1] && macd[i]>sig[i]) arr.push({i,type:"BUY"});
    if(macd[i-1]>sig[i-1] && macd[i]<sig[i]) arr.push({i,type:"SELL"});
  }
  return arr;
}
function tfToBinance(tf){
  return tf;
}

/* ======== CHART INIT ======== */
function initCharts(){
  document.getElementById("tvChart").innerHTML="";
  document.getElementById("rsiChart").innerHTML="";

  chart = LightweightCharts.createChart(document.getElementById("tvChart"),{
    layout:{background:{color:"#0d1117"},textColor:"#ccc"},
    grid:{vertLines:{color:"#1a1a1a"},horzLines:{color:"#1a1a1a"}},
    width:document.getElementById("tvChart").clientWidth,
    height:320
  });
  candlesSeries = chart.addCandlestickSeries({
    upColor:"#22c55e", downColor:"#ef4444",
    borderUpColor:"#22c55e", borderDownColor:"#ef4444"
  });
  ma5Series = chart.addLineSeries({color:"#3b82f6",lineWidth:2,visible:true});
  ma20Series = chart.addLineSeries({color:"#a855f7",lineWidth:2,visible:true});

  rsiChart = LightweightCharts.createChart(document.getElementById("rsiChart"),{
    layout:{background:{color:"#0d1117"},textColor:"#ccc"},
    width:document.getElementById("rsiChart").clientWidth,
    height:120
  });
  rsiSeries = rsiChart.addLineSeries({color:"#facc15",lineWidth:2});
}

window.addEventListener("resize",()=>{
  if(chart){
    chart.resize(document.getElementById("tvChart").clientWidth,320);
  }
  if(rsiChart){
    rsiChart.resize(document.getElementById("rsiChart").clientWidth,120);
  }
});

/* ======== MAIN SIGNAL FUNCTION ======== */
async function generateSignal(){
  const asset = assetSel.value;
  const tf = currentTF;

  const interval = tfToBinance(tf);
  let url = `https://api.binance.com/api/v3/klines?symbol=${asset}&interval=${interval}&limit=200`;

  try{
    const r=await fetch(url);
    const d=await r.json();

    const ohlc = d.map(x=>({
      time:x[0]/1000,
      open:+x[1],high:+x[2],low:+x[3],close:+x[4]
    }));

    const prices = ohlc.map(v=>v.close);

    const ma5  = prices.map((_,i)=> (i>=4?SMA(prices.slice(0,i+1),5):null));
    const ma20 = prices.map((_,i)=> (i>=19?SMA(prices.slice(0,i+1),20):null));

    const ema9  = EMA(prices,9);
    const ema21 = EMA(prices,21);

    const rsiArr = prices.map((_,i)=> (i>=14?RSI(prices.slice(0,i+1),14):null));

    const macObj = MACD(prices);
    const arrows = detectMACD(macObj.macd,macObj.signal);

    const cur = prices.at(-1);
    const atr = ATR(ohlc,14);

    const SL = cur-atr*1.5;
    const TP = cur+atr*2;

    /* === SIGNAL LOGIC === */
    let sig="HOLD", strength="Weak";
    const rsiNow = rsiArr.at(-1);
    if(ema9.at(-1)>ema21.at(-1) && rsiNow>55){
      sig="BUY"; strength=rsiNow>65?"Strong":"Moderate";
    }else if(ema9.at(-1)<ema21.at(-1) && rsiNow<45){
      sig="SELL"; strength=rsiNow<35?"Strong":"Moderate";
    }

    /* ===== UPDATE UI ABOVE CHART ===== */
    infoAsset.textContent = `${asset} — ${tf}`;
    infoPrice.textContent = `$${cur.toFixed(4)}`;
    rsiVal.textContent    = rsiNow?.toFixed(2) || "—";
    ema9Val.textContent   = ema9.at(-1)?.toFixed(4) || "—";
    ema21Val.textContent  = ema21.at(-1)?.toFixed(4) || "—";
    macdVal.textContent   = macObj.macd.at(-1)?.toFixed(4) || "—";
    slVal.textContent     = SL.toFixed(4);
    tpVal.textContent     = TP.toFixed(4);

    /* badge */
    signalBadge.className = "signal-badge";
    if(sig==="BUY") signalBadge.classList.add("buy");
    else if(sig==="SELL") signalBadge.classList.add("sell");
    else signalBadge.classList.add("hold");
    signalBadge.textContent = sig;

    /* CHART RENDER */
    if(!chart) initCharts();

    candlesSeries.setData(ohlc);

    const ma5Data  = ohlc.map((c,i)=>({time:c.time,value:ma5[i]})).filter(v=>v.value);
    const ma20Data = ohlc.map((c,i)=>({time:c.time,value:ma20[i]})).filter(v=>v.value);
    ma5Series.setData(ma5Data);
    ma20Series.setData(ma20Data);

    const markers = arrows.map(a=>{
      const c=ohlc[a.i];
      if(!c) return null;
      const buy = a.type==="BUY";
      return{
        time:c.time,
        position:buy?"belowBar":"aboveBar",
        color:buy?"#22c55e":"#ef4444",
        shape:buy?"arrowUp":"arrowDown",
        text:a.type
      };
    }).filter(Boolean);
    candlesSeries.setMarkers(markers);

    const rsiData = ohlc.map((c,i)=>({time:c.time,value:rsiArr[i]})).filter(v=>v.value);
    rsiSeries.setData(rsiData);

  }catch(e){
    console.error(e);
  }
}

/* ======== TOOLBAR EVENTS ======== */
document.querySelectorAll(".tf-btn").forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll(".tf-btn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    currentTF = btn.dataset.tf;
    generateSignal();
  }
});

document.getElementById("btnCross").onclick=()=>{
  crosshairOn=!crosshairOn;
  chart.applyOptions({crosshair:{mode:crosshairOn?0:-1}});
  document.getElementById("btnCross").textContent = crosshairOn?"Crosshair":"Cross Off";
};

document.getElementById("btnIndicators").onclick=()=>{
  indicatorsOn=!indicatorsOn;
  ma5Series.applyOptions({visible:indicatorsOn});
  ma20Series.applyOptions({visible:indicatorsOn});
  rsiSeries.applyOptions({visible:indicatorsOn});
  document.getElementById("btnIndicators").textContent = indicatorsOn?"Indicators":"Ind Off";
};

document.getElementById("btnRefresh").onclick=()=>generateSignal();

document.getElementById("autoRefresh").onchange=e=>{
  clearInterval(autoTimer);
  if(e.target.checked){
    autoTimer=setInterval(generateSignal,5000);
    generateSignal();
  }
};

/* ======== LOGO SPIN TOGGLE ======== */
document.getElementById("logoWrap").onclick=()=>{
  logoCircle.classList.toggle("paused");
};

/* ======== STARTUP ======== */
(function startup(){
  fillAssets();
  assetSel.onchange=generateSignal;
  marketSel.onchange=()=>{
    fillAssets();
    generateSignal();
  };

  initCharts();
  generateSignal();

  try{
    if(window.Telegram && Telegram.WebApp) Telegram.WebApp.expand();
  }catch(e){}
})();
