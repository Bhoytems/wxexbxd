from flask import Flask, jsonify, request, session
from flask_socketio import SocketIO
from flask import render_template_string
import os
from trader import TradingBot

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'fractalbot-motomori-2024')
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

bot = TradingBot(socketio)
APP_PASSWORD = os.environ.get('APP_PASSWORD', 'MOTOMORI')

HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>FractalBot</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.6.1/socket.io.min.js"></script>
  <style>
    :root {
      --bg:#070b12;--card:#0f1520;--border:#1c2736;--green:#00d09c;
      --red:#ff4d6a;--gold:#f0b429;--blue:#3b82f6;--text:#e8edf5;
      --muted:#6b7a96;--input-bg:#141d2b;
    }
    *{box-sizing:border-box;margin:0;padding:0;}
    body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;overflow-x:hidden;}
    .screen{display:none;min-height:100vh;}
    .screen.active{display:flex;}

    /* PASSWORD GATE */
    #screen-password{flex-direction:column;align-items:center;justify-content:center;padding:24px;background:radial-gradient(ellipse at 50% 0%,#0d2040 0%,var(--bg) 70%);}
    .gate-logo{width:72px;height:72px;background:linear-gradient(135deg,var(--green),#00a87d);border-radius:20px;display:flex;align-items:center;justify-content:center;font-size:36px;margin-bottom:20px;box-shadow:0 0 40px rgba(0,208,156,0.25);}
    .gate-title{font-size:28px;font-weight:700;letter-spacing:-0.5px;margin-bottom:6px;}
    .gate-sub{color:var(--muted);font-size:14px;margin-bottom:36px;text-align:center;}
    .gate-card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:28px 24px;width:100%;max-width:360px;}
    .gate-card label{display:block;font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;}
    .pw-input-wrap{position:relative;margin-bottom:20px;}
    .pw-input-wrap input{width:100%;background:var(--input-bg);border:1px solid var(--border);border-radius:10px;padding:14px 48px 14px 16px;color:var(--text);font-size:16px;font-weight:600;letter-spacing:3px;outline:none;transition:border-color 0.2s;}
    .pw-input-wrap input:focus{border-color:var(--green);}
    .pw-toggle{position:absolute;right:14px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;}
    .gate-error{color:var(--red);font-size:13px;margin-bottom:16px;display:none;}
    .shake{animation:shake 0.4s ease;}
    @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}

    /* LOGIN */
    #screen-login{flex-direction:column;align-items:center;justify-content:center;padding:24px;}
    .login-header{text-align:center;margin-bottom:28px;}
    .login-header h2{font-size:22px;font-weight:700;margin-bottom:6px;}
    .login-header p{color:var(--muted);font-size:14px;}
    .login-card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:28px 24px;width:100%;max-width:380px;}
    .field{margin-bottom:18px;}
    .field label{display:block;font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;}
    .field input{width:100%;background:var(--input-bg);border:1px solid var(--border);border-radius:10px;padding:13px 16px;color:var(--text);font-size:15px;outline:none;transition:border-color 0.2s;}
    .field input:focus{border-color:var(--green);}
    .account-toggle{display:flex;background:var(--input-bg);border:1px solid var(--border);border-radius:10px;padding:4px;margin-bottom:22px;}
    .account-toggle button{flex:1;padding:10px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;background:none;color:var(--muted);}
    .account-toggle button.active-demo{background:var(--blue);color:#fff;}
    .account-toggle button.active-real{background:var(--green);color:#000;}
    .login-msg{font-size:13px;text-align:center;margin-bottom:14px;min-height:18px;}
    .login-msg.error{color:var(--red);}
    .login-msg.success{color:var(--green);}

    /* BUTTONS */
    .btn{width:100%;padding:14px;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;transition:all 0.15s;letter-spacing:0.3px;}
    .btn:active{transform:scale(0.97);}
    .btn:disabled{opacity:0.5;cursor:not-allowed;}
    .btn-green{background:var(--green);color:#000;}
    .btn-red{background:var(--red);color:#fff;}
    .btn-ghost{background:var(--input-bg);border:1px solid var(--border);color:var(--text);}

    /* DASHBOARD */
    #screen-dashboard{flex-direction:column;padding-bottom:24px;}
    .dash-header{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;background:var(--card);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:50;}
    .dash-logo{display:flex;align-items:center;gap:10px;}
    .dash-logo-icon{width:34px;height:34px;background:linear-gradient(135deg,var(--green),#00a87d);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px;}
    .dash-logo-text{font-size:16px;font-weight:700;letter-spacing:-0.3px;}
    .dash-header-right{display:flex;align-items:center;gap:10px;}
    .account-badge{padding:5px 10px;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:1px;cursor:pointer;}
    .badge-demo{background:rgba(59,130,246,0.15);color:var(--blue);border:1px solid rgba(59,130,246,0.3);}
    .badge-real{background:rgba(0,208,156,0.15);color:var(--green);border:1px solid rgba(0,208,156,0.3);}
    .logout-btn{background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;padding:4px;line-height:1;}
    .logout-btn:hover{color:var(--red);}
    .status-bar{display:flex;align-items:center;gap:8px;padding:9px 18px;font-size:13px;}
    .status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
    .status-dot.connected{background:var(--green);box-shadow:0 0 6px var(--green);}
    .status-dot.disconnected{background:var(--muted);}
    .status-dot.running{background:var(--green);animation:pulse-dot 1.5s infinite;}
    @keyframes pulse-dot{0%,100%{box-shadow:0 0 0 0 rgba(0,208,156,0.6);}50%{box-shadow:0 0 0 5px rgba(0,208,156,0);}}
    .dash-content{padding:16px 16px 0;}
    .stats-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px;}
    .stat-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 12px;text-align:center;}
    .stat-value{font-size:20px;font-weight:700;line-height:1;margin-bottom:4px;}
    .stat-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.8px;}
    .stat-green{color:var(--green);}
    .stat-red{color:var(--red);}
    .stat-gold{color:var(--gold);}
    .stats-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;}
    .stat-wide{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;}
    .stat-wide-label{font-size:12px;color:var(--muted);margin-bottom:2px;}
    .stat-wide-value{font-size:18px;font-weight:700;}
    .control-card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:18px 16px;margin-bottom:14px;}
    .amount-input-wrap{flex:1;position:relative;}
    .amount-prefix{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--gold);font-weight:700;font-size:15px;}
    .amount-input-wrap input{width:100%;background:var(--input-bg);border:1px solid var(--border);border-radius:9px;padding:11px 12px 11px 28px;color:var(--text);font-size:15px;font-weight:600;outline:none;}
    .amount-input-wrap input:focus{border-color:var(--gold);}
    .amount-hint{font-size:11px;color:var(--muted);margin-bottom:14px;margin-top:6px;}
    .amount-hint.warn{color:#f59e0b;}
    .bot-btn-row{display:flex;gap:10px;align-items:center;}
    .pairs-info{font-size:12px;color:var(--muted);text-align:center;margin-top:10px;}
    .acct-switch-row{display:flex;gap:8px;margin-bottom:14px;}
    .acct-switch-row button{flex:1;padding:9px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;border:1px solid var(--border);background:var(--input-bg);color:var(--muted);}
    .acct-switch-row button.active{background:var(--green);color:#000;border-color:var(--green);}
    .section-title{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;display:flex;align-items:center;gap:6px;}
    .live-dot{width:6px;height:6px;background:var(--green);border-radius:50%;animation:pulse-dot 1.5s infinite;}
    .signals-box{background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:14px;max-height:220px;overflow-y:auto;}
    .signal-empty{padding:28px;text-align:center;color:var(--muted);font-size:13px;}
    .signal-item{display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border);gap:12px;animation:slide-in 0.3s ease;}
    @keyframes slide-in{from{opacity:0;transform:translateY(-10px);}to{opacity:1;transform:translateY(0);}}
    .signal-item:last-child{border-bottom:none;}
    .signal-icon{width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;}
    .sig-call{background:rgba(0,208,156,0.12);}
    .sig-put{background:rgba(255,77,106,0.12);}
    .signal-info{flex:1;}
    .signal-pair{font-size:14px;font-weight:700;}
    .signal-pattern{font-size:11px;color:var(--muted);}
    .signal-right{text-align:right;}
    .signal-dir{font-size:13px;font-weight:700;margin-bottom:2px;}
    .sig-call-text{color:var(--green);}
    .sig-put-text{color:var(--red);}
    .signal-time{font-size:11px;color:var(--muted);}
    .trades-box{background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden;}
    .trade-item{display:flex;align-items:center;padding:12px 16px;border-bottom:1px solid var(--border);gap:12px;}
    .trade-item:last-child{border-bottom:none;}
    .trade-status-icon{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;}
    .t-win{background:rgba(0,208,156,0.12);}
    .t-loss{background:rgba(255,77,106,0.12);}
    .t-open{background:rgba(107,122,150,0.12);}
    .trade-info{flex:1;min-width:0;}
    .trade-pair{font-size:14px;font-weight:700;}
    .trade-meta{font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .trade-right{text-align:right;flex-shrink:0;}
    .trade-profit{font-size:14px;font-weight:700;}
    .trade-time{font-size:11px;color:var(--muted);}
    .t-profit-win{color:var(--green);}
    .t-profit-loss{color:var(--red);}
    .t-profit-open{color:var(--muted);}
    .trades-empty{padding:28px;text-align:center;color:var(--muted);font-size:13px;}
    .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 20px;font-size:14px;font-weight:500;z-index:999;transition:transform 0.3s ease;white-space:nowrap;max-width:90vw;}
    .toast.show{transform:translateX(-50%) translateY(0);}
    .toast.t-success{border-color:var(--green);color:var(--green);}
    .toast.t-error{border-color:var(--red);color:var(--red);}
    .toast.t-info{border-color:var(--blue);color:var(--blue);}
    .spinner{display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.2);border-top-color:#000;border-radius:50%;animation:spin 0.7s linear infinite;vertical-align:middle;}
    @keyframes spin{to{transform:rotate(360deg);}}
    ::-webkit-scrollbar{width:4px;}
    ::-webkit-scrollbar-track{background:transparent;}
    ::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px;}
  </style>
</head>
<body>

<div id="screen-password" class="screen active">
  <div class="gate-logo">🤖</div>
  <div class="gate-title">FractalBot</div>
  <div class="gate-sub">IQ Option Auto Trader<br>Fractal + Candle Strategy</div>
  <div class="gate-card">
    <label>App Password</label>
    <div class="pw-input-wrap" id="pw-wrap">
      <input type="password" id="pw-input" placeholder="Enter password" autocomplete="off" />
      <button class="pw-toggle" onclick="togglePwVis()">👁</button>
    </div>
    <div class="gate-error" id="pw-error">Wrong password. Try again.</div>
    <button class="btn btn-green" onclick="checkPassword()">Unlock</button>
  </div>
</div>

<div id="screen-login" class="screen">
  <div class="login-header">
    <div style="font-size:36px;margin-bottom:10px;">📊</div>
    <h2>Connect IQ Option</h2>
    <p>Enter your IQ Option account details</p>
  </div>
  <div class="login-card">
    <div class="field">
      <label>Email</label>
      <input type="email" id="iq-email" placeholder="your@email.com" autocomplete="off" />
    </div>
    <div class="field">
      <label>Password</label>
      <input type="password" id="iq-password" placeholder="IQ Option password" autocomplete="off" />
    </div>
    <div class="field" style="margin-bottom:8px;"><label>Account Type</label></div>
    <div class="account-toggle" style="margin-bottom:22px;">
      <button id="btn-demo" class="active-demo" onclick="selectAccountType('PRACTICE')">🎮 Demo</button>
      <button id="btn-real" onclick="selectAccountType('REAL')">💰 Real</button>
    </div>
    <div class="login-msg" id="login-msg"></div>
    <button class="btn btn-green" id="connect-btn" onclick="connectIQ()">Connect Account</button>
  </div>
</div>

<div id="screen-dashboard" class="screen" style="flex-direction:column;">
  <div class="dash-header">
    <div class="dash-logo">
      <div class="dash-logo-icon">🤖</div>
      <div class="dash-logo-text">FractalBot</div>
    </div>
    <div class="dash-header-right">
      <div id="acct-badge" class="account-badge badge-demo">DEMO</div>
      <button class="logout-btn" onclick="confirmLogout()" title="Logout">⏻</button>
    </div>
  </div>

  <div class="status-bar">
    <div class="status-dot" id="status-dot"></div>
    <span id="status-text" style="color:var(--muted);font-size:13px;">Connecting...</span>
  </div>

  <div class="dash-content">
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value stat-gold" id="stat-balance">—</div>
        <div class="stat-label">Balance</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-green" id="stat-wins">0</div>
        <div class="stat-label">Wins</div>
      </div>
      <div class="stat-card">
        <div class="stat-value stat-red" id="stat-losses">0</div>
        <div class="stat-label">Losses</div>
      </div>
    </div>

    <div class="stats-row2">
      <div class="stat-wide">
        <div>
          <div class="stat-wide-label">Win Rate</div>
          <div class="stat-wide-value stat-green" id="stat-winrate">0%</div>
        </div>
        <div style="font-size:24px;">🎯</div>
      </div>
      <div class="stat-wide">
        <div>
          <div class="stat-wide-label">Net Profit</div>
          <div class="stat-wide-value" id="stat-profit">₦0</div>
        </div>
        <div style="font-size:24px;">💹</div>
      </div>
    </div>

    <div class="control-card">
      <div style="font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Account</div>
      <div class="acct-switch-row">
        <button id="dash-demo-btn" onclick="switchAccount('PRACTICE')">🎮 Demo</button>
        <button id="dash-real-btn" onclick="switchAccount('REAL')">💰 Real</button>
      </div>
      <div style="font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Trade Amount</div>
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:0;">
        <div class="amount-input-wrap">
          <span class="amount-prefix">₦</span>
          <input type="number" id="amount-input" placeholder="450" min="1" oninput="onAmountChange()" />
        </div>
      </div>
      <div class="amount-hint" id="amount-hint">Minimum: ₦1 for Demo account</div>
      <div class="bot-btn-row">
        <button class="btn btn-green" id="start-btn" onclick="startBot()" style="flex:2;">▶ Start Bot</button>
        <button class="btn btn-ghost" id="stop-btn" onclick="stopBot()" style="flex:1;display:none;">⏹ Stop</button>
      </div>
      <div class="pairs-info" id="pairs-info">Scanning — pairs</div>
    </div>

    <div class="section-title"><div class="live-dot"></div>Live Signals</div>
    <div class="signals-box" id="signals-box">
      <div class="signal-empty" id="signals-empty">⏳ Waiting for signals...</div>
    </div>

    <div class="section-title" style="margin-top:4px;">📋 Trade History</div>
    <div class="trades-box" id="trades-box">
      <div class="trades-empty" id="trades-empty">No trades yet. Start the bot to begin.</div>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
  let selectedAccountType='PRACTICE',currentAccountType='PRACTICE',botRunning=false,socket;
  const signals=[];

  function initSocket(){
    socket=io();
    socket.on('status_update',updateStatus);
    socket.on('signal',(d)=>{signals.unshift(d);if(signals.length>20)signals.pop();renderSignals();showToast('📡 '+d.pair+' — '+d.direction,'info');});
    socket.on('new_trade',()=>loadTrades());
    socket.on('trade_result',(d)=>{loadTrades();const w=d.status==='win';showToast(w?'✅ '+d.pair+' WIN +₦'+d.profit:'❌ '+d.pair+' LOSS',w?'success':'error');});
  }

  function checkPassword(){
    const pw=document.getElementById('pw-input').value.trim().toUpperCase();
    const errEl=document.getElementById('pw-error');
    const wrap=document.getElementById('pw-wrap');
    fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})})
    .then(r=>r.json()).then(d=>{
      if(d.success){showScreen('login');initSocket();}
      else{errEl.style.display='block';wrap.classList.add('shake');setTimeout(()=>wrap.classList.remove('shake'),400);document.getElementById('pw-input').value='';}
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{
    document.getElementById('pw-input').addEventListener('keydown',e=>{if(e.key==='Enter')checkPassword();});
  });
  function togglePwVis(){const i=document.getElementById('pw-input');i.type=i.type==='password'?'text':'password';}

  function selectAccountType(t){
    selectedAccountType=t;
    document.getElementById('btn-demo').className=t==='PRACTICE'?'active-demo':'';
    document.getElementById('btn-real').className=t==='REAL'?'active-real':'';
  }

  function connectIQ(){
    const email=document.getElementById('iq-email').value.trim();
    const password=document.getElementById('iq-password').value.trim();
    const btn=document.getElementById('connect-btn');
    if(!email||!password){setLoginMsg('Please enter email and password','error');return;}
    btn.disabled=true;btn.innerHTML='<span class="spinner"></span> Connecting...';
    fetch('/api/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,account_type:selectedAccountType})})
    .then(r=>r.json()).then(d=>{
      btn.disabled=false;btn.textContent='Connect Account';
      if(d.success){currentAccountType=selectedAccountType;showScreen('dashboard');loadStatus();loadTrades();}
      else setLoginMsg(d.message,'error');
    }).catch(()=>{btn.disabled=false;btn.textContent='Connect Account';setLoginMsg('Connection failed. Try again.','error');});
  }
  function setLoginMsg(m,t){const e=document.getElementById('login-msg');e.textContent=m;e.className='login-msg '+t;}

  function switchAccount(t){
    if(t===currentAccountType)return;
    fetch('/api/switch-account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({account_type:t})})
    .then(r=>r.json()).then(d=>{if(d.success){currentAccountType=t;updateAccountUI(t);updateAmountHint();showToast(d.message,'success');}else showToast(d.message,'error');});
  }

  function updateAccountUI(t){
    const r=t==='REAL';
    document.getElementById('acct-badge').textContent=r?'REAL':'DEMO';
    document.getElementById('acct-badge').className='account-badge '+(r?'badge-real':'badge-demo');
    document.getElementById('dash-demo-btn').className=!r?'active':'';
    document.getElementById('dash-real-btn').className=r?'active':'';
  }

  function onAmountChange(){updateAmountHint();}
  function updateAmountHint(){
    const hint=document.getElementById('amount-hint');
    const amount=parseFloat(document.getElementById('amount-input').value)||0;
    const isReal=currentAccountType==='REAL';
    if(isReal){hint.textContent=amount<450&&amount>0?'⚠️ Minimum for Real account is ₦450':'Minimum: ₦450 for Real account';hint.className='amount-hint'+(amount<450&&amount>0?' warn':'');}
    else{hint.textContent='Minimum: ₦1 for Demo account';hint.className='amount-hint';}
  }

  function startBot(){
    const amount=parseFloat(document.getElementById('amount-input').value);
    if(!amount||amount<=0){showToast('Please enter a trade amount','error');return;}
    if(currentAccountType==='REAL'&&amount<450){showToast('Minimum trade amount for Real is ₦450','error');return;}
    fetch('/api/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amount})})
    .then(r=>r.json()).then(d=>{if(d.success){botRunning=true;toggleBotButtons(true);showToast(d.message,'success');}else showToast(d.message,'error');});
  }

  function stopBot(){
    fetch('/api/stop',{method:'POST'}).then(r=>r.json()).then(d=>{botRunning=false;toggleBotButtons(false);showToast(d.message,'info');});
  }
  function toggleBotButtons(r){
    document.getElementById('start-btn').style.display=r?'none':'block';
    document.getElementById('stop-btn').style.display=r?'block':'none';
  }

  function updateStatus(d){
    document.getElementById('stat-balance').textContent='₦'+d.balance.toLocaleString();
    document.getElementById('stat-wins').textContent=d.wins;
    document.getElementById('stat-losses').textContent=d.losses;
    document.getElementById('stat-winrate').textContent=d.win_rate+'%';
    const profit=d.total_profit;
    const pe=document.getElementById('stat-profit');
    pe.textContent=(profit>=0?'+':'')+' ₦'+Math.abs(profit).toLocaleString();
    pe.style.color=profit>=0?'var(--green)':'var(--red)';
    document.getElementById('pairs-info').textContent='Scanning '+d.pairs_count+' pairs';
    const dot=document.getElementById('status-dot');
    const tx=document.getElementById('status-text');
    if(d.running){dot.className='status-dot running';tx.textContent='🟢 Bot running — scanning all pairs';tx.style.color='var(--green)';}
    else if(d.connected){dot.className='status-dot connected';tx.textContent='Connected — bot stopped';tx.style.color='var(--muted)';}
    else{dot.className='status-dot disconnected';tx.textContent='Disconnected';tx.style.color='var(--muted)';}
    botRunning=d.running;toggleBotButtons(d.running);updateAccountUI(d.account_type);currentAccountType=d.account_type;updateAmountHint();
  }

  function loadStatus(){fetch('/api/status').then(r=>r.json()).then(updateStatus).catch(()=>{});}
  function loadTrades(){fetch('/api/trades').then(r=>r.json()).then(renderTrades).catch(()=>{});}

  function renderSignals(){
    const box=document.getElementById('signals-box');
    document.getElementById('signals-empty').style.display=signals.length?'none':'block';
    box.querySelectorAll('.signal-item').forEach(e=>e.remove());
    signals.forEach(s=>{
      const c=s.direction==='CALL';
      const d=document.createElement('div');d.className='signal-item';
      d.innerHTML='<div class="signal-icon '+(c?'sig-call':'sig-put')+'">'+(c?'📈':'📉')+'</div><div class="signal-info"><div class="signal-pair">'+s.pair+'</div><div class="signal-pattern">'+s.pattern+'</div></div><div class="signal-right"><div class="signal-dir '+(c?'sig-call-text':'sig-put-text')+'">'+s.direction+'</div><div class="signal-time">'+s.time+'</div></div>';
      box.appendChild(d);
    });
  }

  function renderTrades(trades){
    const box=document.getElementById('trades-box');
    document.getElementById('trades-empty').style.display=(!trades||!trades.length)?'block':'none';
    if(!trades||!trades.length){box.innerHTML='<div class="trades-empty" id="trades-empty">No trades yet. Start the bot to begin.</div>';return;}
    box.innerHTML='';
    trades.forEach(t=>{
      const w=t.status==='win',l=t.status==='loss',o=t.status==='open',c=t.direction==='CALL';
      const ic=w?'t-win':l?'t-loss':'t-open',ico=w?'✅':l?'❌':'⏳';
      const pc=w?'t-profit-win':l?'t-profit-loss':'t-profit-open';
      const pt=o?'Open...':(w?'+₦'+Math.abs(t.profit).toLocaleString():'-₦'+Math.abs(t.profit||t.amount).toLocaleString());
      const d=document.createElement('div');d.className='trade-item';
      d.innerHTML='<div class="trade-status-icon '+ic+'">'+ico+'</div><div class="trade-info"><div class="trade-pair">'+t.pair+' <span style="font-size:11px;color:'+(c?'var(--green)':'var(--red)')+';font-weight:600;">'+t.direction+'</span></div><div class="trade-meta">'+t.pattern+' · ₦'+t.amount+'</div></div><div class="trade-right"><div class="trade-profit '+pc+'">'+pt+'</div><div class="trade-time">'+t.time+'</div></div>';
      box.appendChild(d);
    });
  }

  function confirmLogout(){
    if(confirm('Stop bot and logout from IQ Option?')){
      fetch('/api/logout',{method:'POST'}).then(r=>r.json()).then(()=>{
        botRunning=false;signals.length=0;
        document.getElementById('signals-box').innerHTML='<div class="signal-empty" id="signals-empty">⏳ Waiting for signals...</div>';
        document.getElementById('trades-box').innerHTML='<div class="trades-empty" id="trades-empty">No trades yet. Start the bot to begin.</div>';
        showScreen('password');document.getElementById('pw-input').value='';showToast('Logged out successfully','info');
      });
    }
  }

  function showScreen(n){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById('screen-'+n).classList.add('active');}
  let toastTimeout;
  function showToast(m,t='info'){const e=document.getElementById('toast');e.textContent=m;e.className='toast t-'+t+' show';clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>e.classList.remove('show'),3000);}
  setInterval(()=>{if(document.getElementById('screen-dashboard').classList.contains('active'))loadStatus();},10000);
</script>
</body>
</html>"""

@app.route('/')
def index():
    return render_template_string(HTML)

@app.route('/api/auth', methods=['POST'])
def auth():
    data = request.json
    if data.get('password') == APP_PASSWORD:
        session['authenticated'] = True
        return jsonify({'success': True})
    return jsonify({'success': False, 'message': 'Wrong password'})

def require_auth():
    if not session.get('authenticated'):
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401
    return None

@app.route('/api/connect', methods=['POST'])
def connect():
    err = require_auth()
    if err: return err
    data = request.json
    success, message = bot.connect(data.get('email'), data.get('password'), data.get('account_type', 'PRACTICE'))
    return jsonify({'success': success, 'message': message})

@app.route('/api/start', methods=['POST'])
def start_bot():
    err = require_auth()
    if err: return err
    data = request.json
    amount = float(data.get('amount', 1))
    if bot.account_type == 'REAL' and amount < 450:
        return jsonify({'success': False, 'message': 'Minimum trade amount for Real account is ₦450'})
    if bot.account_type == 'PRACTICE' and amount < 1:
        return jsonify({'success': False, 'message': 'Minimum trade amount is ₦1'})
    success, message = bot.start(amount)
    return jsonify({'success': success, 'message': message})

@app.route('/api/stop', methods=['POST'])
def stop_bot():
    err = require_auth()
    if err: return err
    return jsonify(dict(zip(['success','message'], bot.stop())))

@app.route('/api/status')
def get_status():
    err = require_auth()
    if err: return err
    return jsonify(bot.get_status())

@app.route('/api/trades')
def get_trades():
    err = require_auth()
    if err: return err
    return jsonify(bot.get_trades())

@app.route('/api/switch-account', methods=['POST'])
def switch_account():
    err = require_auth()
    if err: return err
    data = request.json
    success, message = bot.switch_account(data.get('account_type', 'PRACTICE'))
    return jsonify({'success': success, 'message': message})

@app.route('/api/disconnect', methods=['POST'])
def disconnect():
    err = require_auth()
    if err: return err
    return jsonify(dict(zip(['success','message'], bot.disconnect())))

@app.route('/api/logout', methods=['POST'])
def logout():
    bot.stop()
    bot.disconnect()
    session.clear()
    return jsonify({'success': True, 'message': 'Logged out'})

if __name__ == '__main__':
    import eventlet
    eventlet.monkey_patch()
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port, debug=False)
