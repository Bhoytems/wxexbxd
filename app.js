// app.js - INSTANT SIGNAL VERSION with 5-MINUTE EXPIRY
const TWELVE_DATA_KEY = '2fb822c09c1c42e19c07e94090f18b42';

const ALL_ASSETS = {
  forex: ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'NZD/USD', 'USD/CHF', 'EUR/GBP', 'EUR/AUD', 'GBP/JPY'],
  crypto: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT', 'XRPUSDT', 'LTCUSDT', 'BNBUSDT', 'DOGEUSDT', 'MATICUSDT']
};

let selectedAssets = [];
let channelConfig = { botToken: '', channelId: '', isValid: false };
let lastSignalPerAsset = {};
let pendingSignals = {};
let isAnalyzing = false;
let heartbeatInterval = null;
let lastHeartbeat = Date.now();
let continuousScanInterval = null;

// ======================= PASSCODE =======================
const DEFAULT_PIN = '0000';

function initPasscode() {
  const inputs = ['pin0', 'pin1', 'pin2', 'pin3'];
  inputs.forEach((id, idx) => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', (e) => {
        if (e.target.value.length === 1 && idx < 3) {
          const next = document.getElementById(`pin${idx + 1}`);
          if (next) next.focus();
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && e.target.value.length === 0 && idx > 0) {
          const prev = document.getElementById(`pin${idx - 1}`);
          if (prev) prev.focus();
        }
      });
    }
  });
  
  document.getElementById('unlockBtn').addEventListener('click', () => {
    const pin = inputs.map(id => document.getElementById(id).value).join('');
    if (pin === DEFAULT_PIN) {
      document.getElementById('passcodePage').style.display = 'none';
      document.getElementById('mainApp').style.display = 'block';
      setTimeout(() => initMainApp(), 100);
    } else {
      document.getElementById('passcodeError').innerText = '❌ Invalid PIN. Try again.';
      inputs.forEach(id => { document.getElementById(id).value = ''; });
      document.getElementById('pin0').focus();
      setTimeout(() => { document.getElementById('passcodeError').innerText = ''; }, 2000);
    }
  });
}

// ======================= MAIN APP =======================
function initMainApp() {
  loadSavedSelections();
  loadChannelConfig();
  updateTimerDisplay();
  startContinuousScanning();
  startHeartbeat();
  
  document.getElementById('analyzeBtn').addEventListener('click', () => forceAnalysis());
  document.getElementById('saveTelegramBtn').addEventListener('click', saveChannelConfig);
  document.getElementById('disconnectBtn').addEventListener('click', disconnectBot);
  
  setInterval(() => updateTimerDisplay(), 1000);
  setInterval(() => checkExpiredSignals(), 5000);
}

function startContinuousScanning() {
  if (continuousScanInterval) clearInterval(continuousScanInterval);
  continuousScanInterval = setInterval(() => {
    runInstantAnalysis();
  }, 30000);
  setTimeout(() => runInstantAnalysis(), 2000);
}

async function forceAnalysis() {
  await runInstantAnalysis(true);
}

function getWATTime() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
}

// ======================= 5-MINUTE TRADE WINDOW LOGIC =======================
// Signal → 2 min entry window → expires at 5 minutes total
function getTradeDeadlines(signalTime) {
  const entryEnd = new Date(signalTime);
  entryEnd.setMinutes(entryEnd.getMinutes() + 2);
  const expiryTime = new Date(signalTime);
  expiryTime.setMinutes(expiryTime.getMinutes() + 5);  // ← CHANGED: 5 min expiry
  return { entryEnd, expiryTime };
}

function isWithinEntryWindow(signalTime) {
  const now = getWATTime();
  const entryEnd = new Date(signalTime);
  entryEnd.setMinutes(entryEnd.getMinutes() + 2);
  return now >= signalTime && now <= entryEnd;
}

function canSendSignal(asset, direction) {
  const lastSignal = lastSignalPerAsset[asset];
  if (!lastSignal) return true;
  if (lastSignal.direction === direction) {
    const timeSinceLast = (getWATTime() - lastSignal.time) / 1000 / 60;
    return timeSinceLast >= 10;
  }
  return true;
}

function recordSentSignal(asset, direction, price, expiryTime) {
  lastSignalPerAsset[asset] = {
    direction: direction,
    time: getWATTime(),
    price: price,
    expiryTime: expiryTime
  };
}

// ======================= TELEGRAM FUNCTIONS =======================
function updateConnectionStatus(status) {
  const statusLed = document.getElementById('statusLed');
  const statusText = document.getElementById('statusText');
  if (!statusLed || !statusText) return;
  switch(status) {
    case 'online':
      statusLed.className = 'status-led online';
      statusText.className = 'status-text online';
      statusText.innerHTML = 'ONLINE';
      break;
    case 'offline':
      statusLed.className = 'status-led offline';
      statusText.className = 'status-text offline';
      statusText.innerHTML = 'OFFLINE';
      break;
    case 'checking':
      statusLed.className = 'status-led checking';
      statusText.className = 'status-text checking';
      statusText.innerHTML = 'CHECKING...';
      break;
  }
}

async function testChannelConnection(showMessage = true) {
  if (!channelConfig.botToken || !channelConfig.channelId) {
    if (showMessage) showTelegramResult('❌ Bot Token and Channel ID required', 'error');
    channelConfig.isValid = false;
    updateConnectionStatus('offline');
    return false;
  }
  updateConnectionStatus('checking');
  const success = await sendToChannel('✅ *Trend Pulse Active* - Instant signal mode | 5-min trades', true);
  if (success) {
    channelConfig.isValid = true;
    updateConnectionStatus('online');
    if (showMessage) showTelegramResult('✅ Bot connected! Instant signals will be sent.', 'success');
    return true;
  } else {
    channelConfig.isValid = false;
    updateConnectionStatus('offline');
    if (showMessage) showTelegramResult('❌ Connection failed. Check token/channel ID and admin rights.', 'error');
    return false;
  }
}

function disconnectBot() {
  channelConfig.isValid = false;
  channelConfig.botToken = '';
  channelConfig.channelId = '';
  localStorage.removeItem('channel_bot_token');
  localStorage.removeItem('channel_id');
  const tokenInput = document.getElementById('botToken');
  const channelInput = document.getElementById('channelId');
  if (tokenInput) tokenInput.value = '';
  if (channelInput) channelInput.value = '';
  updateConnectionStatus('offline');
  showTelegramResult('🔌 Bot disconnected.', 'success');
}

async function saveChannelConfig() {
  const tokenInput = document.getElementById('botToken');
  const channelInput = document.getElementById('channelId');
  if (!tokenInput || !channelInput) return;
  channelConfig.botToken = tokenInput.value.trim();
  channelConfig.channelId = channelInput.value.trim();
  if (!channelConfig.botToken || !channelConfig.channelId) {
    showTelegramResult('❌ Both fields required', 'error');
    return;
  }
  localStorage.setItem('channel_bot_token', channelConfig.botToken);
  localStorage.setItem('channel_id', channelConfig.channelId);
  await testChannelConnection(true);
}

async function sendToChannel(message, isMarkdown = true) {
  if (!channelConfig.botToken || !channelConfig.channelId) return false;
  const url = `https://api.telegram.org/bot${channelConfig.botToken}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelConfig.channelId,
        text: message,
        parse_mode: isMarkdown ? 'Markdown' : undefined,
        disable_web_page_preview: true
      })
    });
    const data = await response.json();
    return data.ok;
  } catch (error) {
    console.error('Telegram send error:', error);
    return false;
  }
}

function showTelegramResult(message, type) {
  const div = document.getElementById('telegramTestResult');
  if (!div) return;
  div.innerHTML = message;
  div.style.color = type === 'success' ? '#00e599' : '#ff4d6d';
  setTimeout(() => { if (div.innerHTML === message) div.innerHTML = ''; }, 5000);
}

// ======================= WIN/LOSS VERIFICATION =======================
async function verifyAndSendResult(signalData) {
  if (!channelConfig.isValid) return;
  const { asset, direction, entryPrice, expiryTime, displayName, signalId } = signalData;
  const isForex = ALL_ASSETS.forex.includes(asset);
  
  try {
    const closes = isForex ? await fetchForexData(asset) : await fetchCryptoData(asset);
    if (!closes || closes.length === 0) return;
    const expiryPrice = closes[closes.length - 1];
    const priceChange = ((expiryPrice - entryPrice) / entryPrice) * 100;
    
    let result = null;
    if (direction === 'BUY') {
      result = expiryPrice > entryPrice ? 'WIN ✅' : 'LOSS ❌';
    } else {
      result = expiryPrice < entryPrice ? 'WIN ✅' : 'LOSS ❌';
    }
    
    const changePercent = priceChange.toFixed(4);
    const resultMsg = `📊 *RESULT UPDATE* 📊\n\n${direction === 'BUY' ? '🟢' : '🔴'} *${direction} SIGNAL* for *${displayName}*\n💰 Entry: ${formatPrice(entryPrice, asset)}\n💰 Exit (5 min): ${formatPrice(expiryPrice, asset)}\n📉 Change: ${changePercent}%\n🎯 *RESULT: ${result}*`;
    
    await sendToChannel(resultMsg, true);
    console.log(`Result sent for ${asset}: ${result} (${changePercent}%)`);
  } catch (err) {
    console.error(`Verification error for ${asset}:`, err);
  }
}

function checkExpiredSignals() {
  const now = getWATTime();
  for (const key in pendingSignals) {
    const signal = pendingSignals[key];
    if (now >= signal.expiryTime) {
      verifyAndSendResult(signal);
      delete pendingSignals[key];
    }
  }
}

// ======================= TIMER DISPLAY =======================
function updateTimerDisplay() {
  const timerEl = document.getElementById('tradeTimer');
  if (!timerEl) return;
  
  const activeTrades = Object.keys(pendingSignals).length;
  if (activeTrades > 0) {
    let earliestExpiry = null;
    for (const key in pendingSignals) {
      const expiry = pendingSignals[key].expiryTime;
      if (!earliestExpiry || expiry < earliestExpiry) earliestExpiry = expiry;
    }
    if (earliestExpiry) {
      const remaining = Math.max(0, (earliestExpiry - getWATTime()) / 1000);
      const mins = Math.floor(remaining / 60);
      const secs = Math.floor(remaining % 60);
      timerEl.innerHTML = `⏳ ${activeTrades} active trade(s) | Next expiry: ${mins}:${secs.toString().padStart(2,'0')}`;
      timerEl.style.color = '#ffaa00';
      return;
    }
  }
  
  timerEl.innerHTML = `🟢 REAL-TIME | 5-min trades | Scanning every 30s`;
  timerEl.style.color = '#00e599';
}

// ======================= ASSET SELECTION =======================
function loadSavedSelections() {
  const saved = localStorage.getItem('trendpulse_channel_selected_assets');
  if (saved) selectedAssets = JSON.parse(saved);
  else selectedAssets = ['EUR/USD', 'GBP/USD', 'BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  renderAssetGrid();
}

function renderAssetGrid() {
  const grid = document.getElementById('assetGrid');
  if (!grid) return;
  const allAssetsList = [...ALL_ASSETS.forex, ...ALL_ASSETS.crypto];
  grid.innerHTML = '';
  allAssetsList.forEach(asset => {
    const isSelected = selectedAssets.includes(asset);
    const displayName = asset.includes('USDT') ? asset.replace('USDT', '/USDT') : asset;
    const icon = asset.includes('USDT') ? '🪙' : '📈';
    const div = document.createElement('div');
    div.className = 'asset-checkbox';
    div.innerHTML = `<input type="checkbox" id="chk_${asset.replace(/\//g, '_')}" ${isSelected ? 'checked' : ''}>
                     <label for="chk_${asset.replace(/\//g, '_')}">${icon} ${displayName}</label>`;
    const checkbox = div.querySelector('input');
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) { if (!selectedAssets.includes(asset)) selectedAssets.push(asset); }
      else { selectedAssets = selectedAssets.filter(a => a !== asset); }
      localStorage.setItem('trendpulse_channel_selected_assets', JSON.stringify(selectedAssets));
      const countEl = document.getElementById('selectedCount');
      if (countEl) countEl.innerHTML = `✓ ${selectedAssets.length} assets selected`;
    });
    grid.appendChild(div);
  });
  const countEl = document.getElementById('selectedCount');
  if (countEl) countEl.innerHTML = `✓ ${selectedAssets.length} assets selected`;
}

function loadChannelConfig() {
  channelConfig.botToken = localStorage.getItem('channel_bot_token') || '';
  channelConfig.channelId = localStorage.getItem('channel_id') || '';
  const tokenInput = document.getElementById('botToken');
  const channelInput = document.getElementById('channelId');
  if (tokenInput) tokenInput.value = channelConfig.botToken;
  if (channelInput) channelInput.value = channelConfig.channelId;
  if (channelConfig.botToken && channelConfig.channelId) {
    setTimeout(() => testChannelConnection(false), 1000);
  } else { 
    channelConfig.isValid = false; 
    updateConnectionStatus('offline'); 
  }
}

function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    lastHeartbeat = Date.now();
  }, 30000);
}

// ======================= API & TECHNICAL ANALYSIS =======================
function isForexAsset(asset) { return ALL_ASSETS.forex.includes(asset); }

async function fetchForexData(symbol) {
  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=5min&outputsize=55&apikey=${TWELVE_DATA_KEY}`;
  const resp = await fetch(url);
  const json = await resp.json();
  if (json.status === 'error' || !json.values) throw new Error(json.message);
  const values = json.values.reverse();
  return values.map(v => parseFloat(v.close));
}

async function fetchCryptoData(symbol) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=5m&limit=55`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Binance error`);
  const data = await resp.json();
  return data.map(c => parseFloat(c[4]));
}

function calculateEMA(prices, period) {
  if (!prices.length) return 0;
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) ema = prices[i] * k + ema * (1 - k);
  return ema;
}

function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = prices.length - period - 1; i < prices.length - 1; i++) {
    let diff = prices[i+1] - prices[i];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0) return 100;
  let rs = gains / losses;
  return Math.min(100, Math.max(0, 100 - (100 / (1 + rs))));
}

function detectTrend(prices) {
  if (!prices || prices.length < 25) return { trend: 'NEUTRAL', confidence: 40, rsi: 50, ema9: 0, ema21: 0, momentumPercent: 0, currentPrice: prices[prices.length-1] || 0 };
  const ema9 = calculateEMA(prices, 9);
  const ema21 = calculateEMA(prices, 21);
  const ema50 = calculateEMA(prices, 50);
  const rsi = calculateRSI(prices, 14);
  const currentPrice = prices[prices.length-1];
  const price5Ago = prices[prices.length-6];
  const momentumPercent = ((currentPrice - price5Ago) / price5Ago) * 100;
  let bullishScore = 0, bearishScore = 0;
  if (ema9 > ema21) bullishScore += 30;
  else if (ema9 < ema21) bearishScore += 30;
  if (ema21 > ema50) bullishScore += 20;
  else if (ema21 < ema50) bearishScore += 20;
  if (rsi > 58) bullishScore += 22;
  else if (rsi < 42) bearishScore += 22;
  if (momentumPercent > 0) bullishScore += Math.min(28, momentumPercent * 1.8);
  else if (momentumPercent < 0) bearishScore += Math.min(28, Math.abs(momentumPercent) * 1.8);
  let trend = 'NEUTRAL';
  let confidence = 55;
  if (bullishScore > bearishScore + 14) { trend = 'BULLISH'; confidence = 70 + Math.min(22, (bullishScore - bearishScore) / 2.5); }
  else if (bearishScore > bullishScore + 14) { trend = 'BEARISH'; confidence = 70 + Math.min(22, (bearishScore - bullishScore) / 2.5); }
  confidence = Math.min(94, Math.max(48, Math.floor(confidence)));
  return { trend, confidence, rsi: rsi.toFixed(1), ema9: ema9.toFixed(5), ema21: ema21.toFixed(5), momentumPercent: momentumPercent.toFixed(3), currentPrice };
}

async function analyzeSingleAssetInstant(asset, updateUI = false, isUIPrimary = false) {
  const isForex = isForexAsset(asset);
  let displayName = asset.includes('USDT') ? asset.replace('USDT', '/USDT') : asset;
  try {
    const closes = isForex ? await fetchForexData(asset) : await fetchCryptoData(asset);
    if (!closes || closes.length < 25) return null;
    const result = detectTrend(closes);
    const currentPrice = result.currentPrice || closes[closes.length-1];
    const prevPrice = closes[closes.length-2] || currentPrice;
    const changePercent = ((currentPrice - prevPrice) / prevPrice * 100).toFixed(4);
    const finalSignal = result.trend === 'BULLISH' ? 'BUY' : (result.trend === 'BEARISH' ? 'SELL' : 'NEUTRAL');
    
    if (finalSignal !== 'NEUTRAL' && channelConfig.isValid && canSendSignal(asset, finalSignal)) {
      const now = getWATTime();
      const { entryEnd, expiryTime } = getTradeDeadlines(now);
      
      const signalMsg = `⚡ *INSTANT ${finalSignal} SIGNAL* ⚡\n\n📊 *Asset:* ${displayName}\n💰 *Price:* ${formatPrice(currentPrice, asset)}\n📈 *Change:* ${changePercent}%\n🎯 *Confidence:* ${result.confidence}%\n\n✅ *Entry Window:* Opens NOW for 2 minutes\n⏱ *Trade Expires:* ${expiryTime.toLocaleTimeString('en-GB')} (5 min from now)\n\n🟢 *Action: Enter ${finalSignal} position within 2 min*`;
      
      const sent = await sendToChannel(signalMsg, true);
      if (sent) {
        recordSentSignal(asset, finalSignal, currentPrice, expiryTime);
        const signalId = `${asset}_${Date.now()}`;
        pendingSignals[signalId] = {
          id: signalId,
          asset: asset,
          direction: finalSignal,
          entryPrice: currentPrice,
          entryTime: now,
          expiryTime: expiryTime,
          displayName: displayName,
          signalId: signalId
        };
        console.log(`⚡ INSTANT SIGNAL: ${finalSignal} on ${asset} at ${currentPrice} | Expires in 5 min`);
      }
    }
    
    if (updateUI && isUIPrimary) {
      return { asset, displayName, result, currentPrice, changePercent, finalSignal };
    }
    return null;
  } catch (err) {
    console.error(`Error on ${asset}:`, err.message);
    return null;
  }
}

async function runInstantAnalysis(updateUI = false) {
  if (isAnalyzing) return;
  isAnalyzing = true;
  lastHeartbeat = Date.now();
  
  const analyzeBtn = document.getElementById('analyzeBtn');
  if (updateUI && analyzeBtn) { 
    analyzeBtn.disabled = true; 
    analyzeBtn.innerHTML = '⏳ Scanning...'; 
  }
  
  const firstAsset = selectedAssets[0];
  let uiResult = null;
  
  for (const asset of selectedAssets) {
    const isPrimary = (asset === firstAsset);
    const result = await analyzeSingleAssetInstant(asset, updateUI, isPrimary);
    if (result && isPrimary) uiResult = result;
    await new Promise(resolve => setTimeout(resolve, 800));
  }
  
  if (updateUI && uiResult) {
    const priceEl = document.getElementById('priceVal');
    const changeEl = document.getElementById('changeVal');
    const strengthEl = document.getElementById('strengthVal');
    const emaSpan = document.getElementById('emaSpan');
    const rsiSpan = document.getElementById('rsiSpan');
    const momSpan = document.getElementById('momSpan');
    const signalDiv = document.getElementById('signalDisplay');
    
    if (priceEl) priceEl.innerHTML = formatPrice(uiResult.currentPrice, uiResult.asset);
    if (changeEl) changeEl.innerHTML = `${uiResult.changePercent}%`;
    if (strengthEl) strengthEl.innerHTML = `${uiResult.result.confidence}%`;
    if (emaSpan) emaSpan.innerHTML = `${uiResult.result.ema9}/${uiResult.result.ema21}`;
    if (rsiSpan) rsiSpan.innerHTML = uiResult.result.rsi;
    if (momSpan) momSpan.innerHTML = uiResult.result.momentumPercent + '%';
    if (signalDiv) {
      if (uiResult.finalSignal === 'BUY') signalDiv.innerHTML = `<div class="signal-big bullish">🔺 BULLISH · BUY 🔺</div><div style="font-size:0.7rem;">Confidence ${uiResult.result.confidence}% | 5-min trade</div>`;
      else if (uiResult.finalSignal === 'SELL') signalDiv.innerHTML = `<div class="signal-big bearish">🔻 BEARISH · SELL 🔻</div><div style="font-size:0.7rem;">Confidence ${uiResult.result.confidence}% | 5-min trade</div>`;
      else signalDiv.innerHTML = `<div class="signal-big neutral">⚪ NEUTRAL · HOLD ⚪</div><div style="font-size:0.7rem;">Waiting for trend detection</div>`;
    }
  }
  
  const timestampMsg = document.getElementById('timestampMsg');
  if (timestampMsg) {
    timestampMsg.innerHTML = `🕒 Last scan: ${new Date().toLocaleTimeString()} · Monitoring ${selectedAssets.length} assets · Active trades: ${Object.keys(pendingSignals).length}`;
  }
  
  if (updateUI && analyzeBtn) { 
    analyzeBtn.disabled = false; 
    analyzeBtn.innerHTML = '🔍 Force Analysis Now'; 
  }
  isAnalyzing = false;
}

function formatPrice(price, asset) {
  if (!price) return '—';
  const isCrypto = asset.includes('USDT');
  if (isCrypto) { 
    if (price > 1000) return price.toFixed(2); 
    if (price > 0.1) return price.toFixed(4); 
    return price.toFixed(6); 
  }
  return price.toFixed(5);
}

// ======================= START =======================
document.addEventListener('DOMContentLoaded', function() {
  initPasscode();
});
