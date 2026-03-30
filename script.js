// API Keys
const TWELVE_DATA_API_KEY = '2fb822c09c1c42e19c07e94090f18b42';

// Cache for API responses (5 second TTL for smooth operation)
const cache = new Map();
const CACHE_TTL = 8000; // 8 seconds cache for fast repeat analysis

function getCached(key) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    return null;
}

function setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}

// Detect if asset is crypto or forex
function isCrypto(asset) {
    return asset.includes('USDT') || asset === 'BTCUSDT' || asset === 'ETHUSDT' || 
           asset === 'SOLUSDT' || asset === 'BNBUSDT' || asset === 'XRPUSDT' || asset === 'ADAUSDT';
}

// Fetch Forex data from Twelve Data
async function fetchForexData(symbol, interval, limit = 120) {
    const cacheKey = `forex_${symbol}_${interval}_${limit}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;
    
    const intervalMap = {
        "1m": "1min", "5m": "5min", "15m": "15min", "30m": "30min",
        "1h": "1h", "4h": "4h", "1d": "1day"
    };
    
    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${intervalMap[interval]}&outputsize=${limit}&apikey=${TWELVE_DATA_API_KEY}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.status === 'error') {
            throw new Error(data.message || 'Forex API error');
        }
        
        if (!data.values || data.values.length === 0) {
            throw new Error('No forex data received');
        }
        
        // Twelve Data returns newest first, reverse to chronological
        const values = data.values.reverse();
        const closes = values.map(v => parseFloat(v.close));
        const highs = values.map(v => parseFloat(v.high));
        const lows = values.map(v => parseFloat(v.low));
        const opens = values.map(v => parseFloat(v.open));
        const volumes = values.map(v => parseFloat(v.volume) || 0);
        
        const result = { closes, highs, lows, opens, volumes, success: true };
        setCache(cacheKey, result);
        return result;
    } catch (error) {
        console.error('Forex fetch error:', error);
        throw new Error(`Forex data error: ${error.message}`);
    }
}

// Fetch Crypto data from Binance
async function fetchCryptoData(symbol, interval, limit = 120) {
    const cacheKey = `crypto_${symbol}_${interval}_${limit}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;
    
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        
        if (!data || data.length === 0) throw new Error('No crypto data');
        
        const closes = data.map(c => parseFloat(c[4]));
        const highs = data.map(c => parseFloat(c[2]));
        const lows = data.map(c => parseFloat(c[3]));
        const opens = data.map(c => parseFloat(c[1]));
        const volumes = data.map(c => parseFloat(c[5]));
        
        const result = { closes, highs, lows, opens, volumes, success: true };
        setCache(cacheKey, result);
        return result;
    } catch (error) {
        console.error('Crypto fetch error:', error);
        throw new Error(`Crypto data error: ${error.message}`);
    }
}

// Optimized EMA calculation
function EMA(prices, period) {
    if (prices.length < period) return prices[prices.length - 1];
    const k = 2 / (period + 1);
    let ema = prices[0];
    for (let i = 1; i < prices.length; i++) {
        ema = prices[i] * k + ema * (1 - k);
    }
    return ema;
}

function SMA(prices, period) {
    if (prices.length < period) return prices[prices.length - 1];
    let sum = 0;
    for (let i = prices.length - period; i < prices.length; i++) sum += prices[i];
    return sum / period;
}

function RSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;
    let gains = 0, losses = 0;
    const start = prices.length - period - 1;
    for (let i = start; i < prices.length - 1; i++) {
        const diff = prices[i + 1] - prices[i];
        if (diff >= 0) gains += diff;
        else losses += Math.abs(diff);
    }
    if (losses === 0) return 100;
    const rs = gains / losses;
    return 100 - (100 / (1 + rs));
}

function MACD(prices, fast = 12, slow = 26, signal = 9) {
    if (prices.length < slow + signal) return { histogram: 0 };
    const emaFast = EMA(prices.slice(0, fast), fast);
    const emaSlow = EMA(prices.slice(0, slow), slow);
    let macdValues = [emaFast - emaSlow];
    for (let i = fast; i < prices.length; i++) {
        const ef = EMA(prices.slice(0, i + 1), fast);
        const es = EMA(prices.slice(0, i + 1), slow);
        macdValues.push(ef - es);
    }
    const signalLine = EMA(macdValues, signal);
    return { histogram: macdValues[macdValues.length - 1] - signalLine };
}

function Stochastic(highs, lows, closes, period = 14) {
    if (closes.length < period) return 50;
    const lastClose = closes[closes.length - 1];
    let highest = highs[highs.length - 1];
    let lowest = lows[lows.length - 1];
    for (let i = closes.length - period; i < closes.length; i++) {
        if (highs[i] > highest) highest = highs[i];
        if (lows[i] < lowest) lowest = lows[i];
    }
    if (highest === lowest) return 50;
    return Math.min(100, Math.max(0, ((lastClose - lowest) / (highest - lowest)) * 100));
}

function ATR(highs, lows, closes, period = 14) {
    if (highs.length < period + 1) return 0;
    let trSum = 0;
    for (let i = highs.length - period; i < highs.length; i++) {
        const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
        trSum += tr;
    }
    return trSum / period;
}

function ADX(highs, lows, closes, period = 14) {
    if (highs.length < period + 1) return 25;
    let plusDM = 0, minusDM = 0, trSum = 0;
    for (let i = highs.length - period; i < highs.length; i++) {
        const upMove = highs[i] - highs[i - 1];
        const downMove = lows[i - 1] - lows[i];
        const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
        trSum += tr;
        if (upMove > downMove && upMove > 0) plusDM += upMove;
        if (downMove > upMove && downMove > 0) minusDM += downMove;
    }
    if (trSum === 0) return 25;
    const plusDI = 100 * (plusDM / trSum);
    const minusDI = 100 * (minusDM / trSum);
    return Math.min(70, 100 * Math.abs(plusDI - minusDI) / (plusDI + minusDI));
}

function BollingerBands(prices, period = 20, multiplier = 2) {
    if (prices.length < period) {
        return { 
            upper: prices[prices.length - 1], 
            middle: prices[prices.length - 1], 
            lower: prices[prices.length - 1] 
        };
    }
    const middle = SMA(prices, period);
    let variance = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
        variance += Math.pow(prices[i] - middle, 2);
    }
    const stdDev = Math.sqrt(variance / period);
    return { 
        upper: middle + (stdDev * multiplier), 
        middle, 
        lower: middle - (stdDev * multiplier) 
    };
}

// Main analysis function
async function runAnalysis() {
    const asset = document.getElementById("assetSelect").value;
    const timeframe = document.getElementById("tfSelect").value;
    const outputDiv = document.getElementById("analysisOutput");
    const isCryptoAsset = isCrypto(asset);
    
    outputDiv.innerHTML = `<div style="padding: 30px; text-align:center;">
        <div class="loading-spinner"></div>
        <p style="margin-top: 15px;">Fetching ${isCryptoAsset ? 'Binance' : 'Forex'} data for ${asset} on ${timeframe}...</p>
    </div>`;
    
    try {
        // Fetch data based on asset type
        let data;
        if (isCryptoAsset) {
            data = await fetchCryptoData(asset, timeframe, 150);
        } else {
            data = await fetchForexData(asset, timeframe, 150);
        }
        
        const { closes, highs, lows, volumes } = data;
        if (closes.length < 50) throw new Error("Insufficient data");
        
        const currentPrice = closes[closes.length - 1];
        const prevPrice = closes[closes.length - 2];
        const priceChange = ((currentPrice - prevPrice) / prevPrice * 100).toFixed(2);
        
        // Parallel indicator calculations (optimized)
        const ema9 = EMA(closes, 9);
        const ema21 = EMA(closes, 21);
        const ema50 = EMA(closes, 50);
        const rsiVal = RSI(closes, 14);
        const macd = MACD(closes);
        const stochVal = Stochastic(highs, lows, closes, 14);
        const atrValue = ATR(highs, lows, closes, 14);
        const adxStrength = ADX(highs, lows, closes, 14);
        const bb = BollingerBands(closes);
        const momentum = currentPrice - (closes[closes.length - 6] || closes[0]);
        const volumeSMA = SMA(volumes, 20);
        const volRatio = volumeSMA > 0 ? volumes[volumes.length - 1] / volumeSMA : 1;
        
        // Scoring system
        let buyScore = 0, sellScore = 0;
        
        if (ema9 > ema21 && ema21 > ema50) buyScore += 30;
        else if (ema9 < ema21 && ema21 < ema50) sellScore += 30;
        else if (ema9 > ema21) buyScore += 15;
        else if (ema9 < ema21) sellScore += 15;
        
        if (rsiVal > 55 && rsiVal < 75) buyScore += 20;
        else if (rsiVal < 45 && rsiVal > 25) sellScore += 20;
        else if (rsiVal >= 75) buyScore += 5;
        else if (rsiVal <= 25) sellScore += 5;
        
        if (macd.histogram > 0) buyScore += 20;
        else if (macd.histogram < 0) sellScore += 20;
        
        if (stochVal > 70 && stochVal < 90) buyScore += 15;
        else if (stochVal < 30 && stochVal > 10) sellScore += 15;
        else if (stochVal > 90) buyScore += 5;
        else if (stochVal < 10) sellScore += 5;
        
        if (currentPrice < bb.lower) buyScore += 12;
        else if (currentPrice > bb.upper) sellScore += 12;
        
        if (momentum > 0) buyScore += Math.min(15, momentum * 10);
        else if (momentum < 0) sellScore += Math.min(15, Math.abs(momentum) * 10);
        
        if (volRatio > 1.3) {
            if (momentum > 0) buyScore += 10;
            else if (momentum < 0) sellScore += 10;
        }
        
        if (adxStrength > 30) {
            if (buyScore > sellScore) buyScore += 10;
            else if (sellScore > buyScore) sellScore += 10;
        }
        
        // Signal determination
        let signal = "HOLD";
        let confidence = 50;
        const diff = Math.abs(buyScore - sellScore);
        
        if (buyScore > sellScore + 18) {
            signal = "BUY";
            confidence = Math.min(96, 55 + (buyScore - sellScore) * 0.65);
        } else if (sellScore > buyScore + 18) {
            signal = "SELL";
            confidence = Math.min(96, 55 + (sellScore - buyScore) * 0.65);
        } else if (diff > 12) {
            signal = buyScore > sellScore ? "BUY" : "SELL";
            confidence = 52 + diff * 0.5;
        }
        
        // TP/SL Calculation
        const highestHigh = Math.max(...highs.slice(-20));
        const lowestLow = Math.min(...lows.slice(-20));
        const atrStop = Math.max(atrValue * 1.8, currentPrice * (isCryptoAsset ? 0.008 : 0.002));
        
        let takeProfit1, takeProfit2, stopLoss, riskPercent, rewardPercent;
        
        if (signal === "BUY") {
            const range = highestHigh - lowestLow;
            takeProfit1 = currentPrice + Math.max(range * 0.618, atrValue * 2.2);
            takeProfit2 = currentPrice + Math.max(range * 1.0, atrValue * 3.5);
            stopLoss = currentPrice - atrStop;
            if (stopLoss > currentPrice * 0.99) stopLoss = currentPrice * 0.99;
            riskPercent = ((currentPrice - stopLoss) / currentPrice * 100);
            rewardPercent = ((takeProfit1 - currentPrice) / currentPrice * 100);
        } else if (signal === "SELL") {
            const range = highestHigh - lowestLow;
            takeProfit1 = currentPrice - Math.max(range * 0.618, atrValue * 2.2);
            takeProfit2 = currentPrice - Math.max(range * 1.0, atrValue * 3.5);
            stopLoss = currentPrice + atrStop;
            if (stopLoss < currentPrice * 1.01) stopLoss = currentPrice * 1.01;
            riskPercent = ((stopLoss - currentPrice) / currentPrice * 100);
            rewardPercent = ((currentPrice - takeProfit1) / currentPrice * 100);
        } else {
            takeProfit1 = currentPrice + atrValue * 1.8;
            takeProfit2 = currentPrice + atrValue * 3.0;
            stopLoss = currentPrice - atrValue * 1.5;
            riskPercent = atrValue / currentPrice * 100;
            rewardPercent = (atrValue * 1.8) / currentPrice * 100;
        }
        
        const rr = (rewardPercent / riskPercent).toFixed(2);
        const trendText = adxStrength > 30 ? "🔥 Strong Trend" : (adxStrength > 22 ? "📊 Moderate Trend" : "⚡ Ranging Market");
        const priceFormat = isCryptoAsset ? currentPrice.toFixed(2) : currentPrice.toFixed(5);
        const slFormat = isCryptoAsset ? stopLoss.toFixed(2) : stopLoss.toFixed(5);
        const tp1Format = isCryptoAsset ? takeProfit1.toFixed(2) : takeProfit1.toFixed(5);
        const tp2Format = isCryptoAsset ? takeProfit2.toFixed(2) : takeProfit2.toFixed(5);
        const emaFormat = isCryptoAsset ? v => v.toFixed(2) : v => v.toFixed(5);
        
        outputDiv.innerHTML = `
            <div class="signal-pulse">
                <div style="font-size: 0.85rem; color: #93c5fd; margin-bottom: 6px;">${asset} • ${timeframe} • ${isCryptoAsset ? 'Binance Live' : 'Twelve Data Forex'}</div>
                <div class="signal ${signal === 'BUY' ? 'buy-signal' : signal === 'SELL' ? 'sell-signal' : 'hold-signal'}">${signal}</div>
                <div style="margin-top: 10px; font-size: 0.95rem;">🎯 Confidence: ${Math.floor(confidence)}% | ${trendText} (ADX: ${adxStrength.toFixed(1)})<br>💰 Price: ${priceFormat} (${priceChange > 0 ? '+' : ''}${priceChange}%)</div>
            </div>
            
            <div class="dashboard-grid">
                <div class="stat-card"><div class="stat-label">EMA (9/21/50)</div><div class="stat-value">${emaFormat(ema9)}<span style="font-size:0.7rem;"> / ${emaFormat(ema21)}</span></div><div style="font-size:0.65rem;">50: ${emaFormat(ema50)}</div></div>
                <div class="stat-card"><div class="stat-label">RSI (14)</div><div class="stat-value">${rsiVal.toFixed(1)}</div><div class="stat-label" style="margin-top:6px;">Stochastic</div><div class="stat-value">${stochVal.toFixed(1)}</div></div>
                <div class="stat-card"><div class="stat-label">MACD</div><div class="stat-value">${macd.histogram > 0 ? '+' : ''}${macd.histogram.toFixed(4)}</div><div class="stat-label" style="margin-top:6px;">ATR</div><div class="stat-value">${isCryptoAsset ? '$' + atrValue.toFixed(2) : atrValue.toFixed(4)}</div></div>
                <div class="stat-card"><div class="stat-label">Momentum</div><div class="stat-value">${momentum > 0 ? '+' : ''}${isCryptoAsset ? '$' + momentum.toFixed(2) : momentum.toFixed(4)}</div><div class="stat-label" style="margin-top:6px;">Volume Ratio</div><div class="stat-value">${volRatio.toFixed(2)}x</div></div>
            </div>
            
            <div class="tp-sl-box">
                <h3 style="margin-bottom: 12px;">💼 EXNESS TRADE SETUP</h3>
                <div class="tp-sl-row">
                    <div class="tp-item"><span class="tp-title">🎯 TAKE PROFIT 1</span><br><span class="price-level">${tp1Format}</span><br><span style="font-size:0.7rem;">+${rewardPercent.toFixed(2)}%</span></div>
                    <div class="tp-item"><span class="tp-title">🚀 TAKE PROFIT 2</span><br><span class="price-level">${tp2Format}</span><br><span style="font-size:0.7rem;">Extended Target</span></div>
                    <div class="sl-item"><span class="sl-title">🛑 STOP LOSS</span><br><span class="price-level">${slFormat}</span><br><span style="font-size:0.7rem;">-${riskPercent.toFixed(2)}% risk</span></div>
                </div>
                <div class="risk-reward">📊 Risk/Reward: 1 : ${rr} | Recommended risk: 0.5-2% per trade</div>
                <div style="margin-top: 12px; font-size: 0.7rem; color: #9ca3af;">BB Upper: ${isCryptoAsset ? '$' + bb.upper.toFixed(2) : bb.upper.toFixed(4)} | BB Lower: ${isCryptoAsset ? '$' + bb.lower.toFixed(2) : bb.lower.toFixed(4)} | Entry: ${priceFormat}</div>
            </div>
        `;
        
    } catch (error) {
        outputDiv.innerHTML = `<div style="color: #f87171; background: #2d1a1a; border-radius: 28px; padding: 28px; margin: 10px;">
            ⚠️ Error: ${error.message}<br><br>Please check your connection and try again.
        </div>`;
    }
}

// Event listeners
document.getElementById("analyzeBtn").addEventListener("click", runAnalysis);
window.addEventListener("load", () => setTimeout(runAnalysis, 300));
