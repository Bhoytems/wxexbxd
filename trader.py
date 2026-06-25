from iqoptionapi.stable_api import IQ_Option
import threading
import time
from datetime import datetime


class TradingBot:
    def __init__(self, socketio):
        self.socketio = socketio
        self.iq = None
        self.is_running = False
        self.is_connected = False
        self.amount = 1.0
        self.account_type = 'PRACTICE'
        self.trades = []
        self.balance = 0.0
        self.bot_thread = None
        self.email = ''
        self.password = ''
        self.pairs = []
        self.active_pairs_count = 0

    # ─────────────────────────────────────────────
    # CONNECTION
    # ─────────────────────────────────────────────

    def connect(self, email, password, account_type='PRACTICE'):
        try:
            self.email = email
            self.password = password
            self.iq = IQ_Option(email, password)
            check, reason = self.iq.connect()

            if check:
                self.iq.change_balance(account_type)
                self.account_type = account_type
                self.is_connected = True
                self.balance = self.iq.get_balance()
                self._load_pairs()
                self._emit_status()
                return True, f"Connected! Balance: {self.balance:.2f}"
            else:
                return False, f"Login failed: {reason}"
        except Exception as e:
            return False, f"Connection error: {str(e)}"

    def disconnect(self):
        try:
            self.is_running = False
            self.is_connected = False
            if self.iq:
                self.iq.logout()
            self._emit_status()
            return True, "Disconnected"
        except Exception as e:
            return False, str(e)

    def switch_account(self, account_type):
        if not self.is_connected:
            return False, "Not connected"
        try:
            self.iq.change_balance(account_type)
            self.account_type = account_type
            self.balance = self.iq.get_balance()
            self._emit_status()
            label = "Demo" if account_type == 'PRACTICE' else "Real"
            return True, f"Switched to {label} account. Balance: {self.balance:.2f}"
        except Exception as e:
            return False, str(e)

    def _load_pairs(self):
        try:
            all_assets = self.iq.get_all_open_time()
            seen = set()
            self.pairs = []
            for market in ['binary', 'digital', 'turbo']:
                if market in all_assets:
                    for pair, info in all_assets[market].items():
                        if info.get('open') and pair not in seen:
                            seen.add(pair)
                            self.pairs.append(pair)
            self.active_pairs_count = len(self.pairs)
        except Exception:
            self.pairs = [
                'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD',
                'NZDUSD', 'USDCAD', 'EURJPY', 'GBPJPY', 'EURGBP',
                'EURAUD', 'EURCAD', 'EURCHF', 'GBPCHF', 'GBPCAD',
                'AUDCAD', 'AUDCHF', 'AUDJPY', 'AUDNZD', 'CADCHF',
            ]
            self.active_pairs_count = len(self.pairs)

    # ─────────────────────────────────────────────
    # BOT CONTROL
    # ─────────────────────────────────────────────

    def start(self, amount):
        if not self.is_connected:
            return False, "Please connect to IQ Option first"
        if self.is_running:
            return False, "Bot is already running"
        self.amount = amount
        self.is_running = True
        self.bot_thread = threading.Thread(target=self._run, daemon=True)
        self.bot_thread.start()
        self._emit_status()
        return True, f"Bot started! Scanning {self.active_pairs_count} pairs..."

    def stop(self):
        self.is_running = False
        self._emit_status()
        return True, "Bot stopped"

    # ─────────────────────────────────────────────
    # CANDLE PATTERN DETECTION
    # ─────────────────────────────────────────────

    def _is_hammer(self, c):
        """
        Hammer: green/bullish candle, long lower wick (>= 2x body), tiny upper wick
        Signals a BUY reversal when combined with fractal low
        """
        o, cl, h, l = c['open'], c['close'], c['max'], c['min']
        body = abs(cl - o)
        full = h - l
        if full == 0 or body == 0:
            return False
        lower_wick = min(o, cl) - l
        upper_wick = h - max(o, cl)
        return (
            lower_wick >= 2 * body and
            upper_wick <= body * 0.6 and
            body / full >= 0.08
        )

    def _is_shooting_star(self, c):
        """
        Shooting star: red/bearish candle, long upper wick (>= 2x body), tiny lower wick
        Signals a SELL reversal when combined with fractal high
        """
        o, cl, h, l = c['open'], c['close'], c['max'], c['min']
        body = abs(cl - o)
        full = h - l
        if full == 0 or body == 0:
            return False
        lower_wick = min(o, cl) - l
        upper_wick = h - max(o, cl)
        return (
            upper_wick >= 2 * body and
            lower_wick <= body * 0.6 and
            body / full >= 0.08
        )

    # ─────────────────────────────────────────────
    # PERIOD-3 FRACTAL DETECTION
    # (matches your IQ Option fractal settings exactly)
    # ─────────────────────────────────────────────

    def _has_fractal_low(self, candles, idx):
        """
        Period 3 fractal low (red arrow pointing DOWN = BUY signal):
        Middle candle's LOW is lower than the candle before AND after it.
        """
        if idx < 1 or idx >= len(candles) - 1:
            return False
        mid = candles[idx]['min']
        return mid < candles[idx - 1]['min'] and mid < candles[idx + 1]['min']

    def _has_fractal_high(self, candles, idx):
        """
        Period 3 fractal high (green arrow pointing UP = SELL signal):
        Middle candle's HIGH is higher than the candle before AND after it.
        """
        if idx < 1 or idx >= len(candles) - 1:
            return False
        mid = candles[idx]['max']
        return mid > candles[idx - 1]['max'] and mid > candles[idx + 1]['max']

    # ─────────────────────────────────────────────
    # SIGNAL ANALYSIS
    # ─────────────────────────────────────────────

    def _analyze(self, pair):
        """
        Fetch 5-min candles and check for:
        - Hammer + Period-3 Fractal Low  → CALL (buy)
        - Shooting Star + Period-3 Fractal High → PUT (sell)

        With Period 3, we only need 1 confirmed candle after the signal candle.
        Signal candle = index len-3 (1 confirmed candle after it at len-2,
        current forming candle at len-1 is excluded).
        """
        try:
            candles = self.iq.get_candles(pair, 300, 10, time.time())
            if not candles or len(candles) < 5:
                return None, None

            # Signal candle is 3rd from last (confirmed, with 1 complete candle after)
            idx = len(candles) - 3
            candle = candles[idx]

            hammer = self._is_hammer(candle)
            shooting = self._is_shooting_star(candle)
            frac_low = self._has_fractal_low(candles, idx)
            frac_high = self._has_fractal_high(candles, idx)

            if hammer and frac_low:
                return 'call', 'Hammer + Fractal Low'
            elif shooting and frac_high:
                return 'put', 'Shooting Star + Fractal High'

            return None, None
        except Exception:
            return None, None

    # ─────────────────────────────────────────────
    # TRADE EXECUTION
    # ─────────────────────────────────────────────

    def _place_trade(self, pair, direction, pattern):
        try:
            # Try binary first, then digital
            status, trade_id = self.iq.buy(self.amount, pair, direction, 5)
            if not status:
                status, trade_id = self.iq.buy_digital_spot(pair, self.amount, direction, 5)

            if status:
                trade = {
                    'id': trade_id,
                    'pair': pair,
                    'direction': direction.upper(),
                    'pattern': pattern,
                    'amount': self.amount,
                    'time': datetime.now().strftime('%H:%M:%S'),
                    'date': datetime.now().strftime('%Y-%m-%d'),
                    'status': 'open',
                    'profit': None
                }
                self.trades.insert(0, trade)
                if len(self.trades) > 200:
                    self.trades.pop()

                self.balance = self.iq.get_balance()
                self.socketio.emit('new_trade', trade)
                self._emit_status()

                # Check result after expiry
                threading.Thread(
                    target=self._check_result,
                    args=(trade_id,),
                    daemon=True
                ).start()
                return True
        except Exception as e:
            print(f"Trade error on {pair}: {e}")
        return False

    def _check_result(self, trade_id):
        time.sleep(330)  # Wait 5 min 30 sec for result
        try:
            profit = self.iq.check_win_v3(trade_id)
            if profit is None:
                profit = self.iq.check_win_digital_v2(trade_id)

            result_trade = None
            for trade in self.trades:
                if trade['id'] == trade_id:
                    if profit is not None and profit > 0:
                        trade['status'] = 'win'
                        trade['profit'] = round(profit, 2)
                    else:
                        trade['status'] = 'loss'
                        trade['profit'] = -round(self.amount, 2)
                    result_trade = dict(trade)
                    break

            self.balance = self.iq.get_balance()
            if result_trade:
                self.socketio.emit('trade_result', result_trade)
            self._emit_status()
        except Exception as e:
            print(f"Result check error: {e}")

    # ─────────────────────────────────────────────
    # MAIN BOT LOOP
    # ─────────────────────────────────────────────

    def _run(self):
        traded_signals = {}  # track {pair: candle_timestamp} to avoid duplicate trades

        while self.is_running:
            try:
                # Refresh available pairs every 30 minutes
                if int(time.time()) % 1800 < 20:
                    self._load_pairs()

                current_candle_ts = int(time.time() / 300) * 300

                for pair in self.pairs:
                    if not self.is_running:
                        break

                    # Skip if already traded this candle for this pair
                    if traded_signals.get(pair) == current_candle_ts:
                        continue

                    direction, pattern = self._analyze(pair)

                    if direction:
                        traded_signals[pair] = current_candle_ts
                        success = self._place_trade(pair, direction, pattern)

                        if success:
                            self.socketio.emit('signal', {
                                'pair': pair,
                                'direction': direction.upper(),
                                'pattern': pattern,
                                'time': datetime.now().strftime('%H:%M:%S')
                            })

                    time.sleep(0.4)  # small delay between pair checks

                # Clean up old signal records (keep only last 2 candles)
                cutoff = current_candle_ts - 600
                traded_signals = {
                    p: ts for p, ts in traded_signals.items() if ts >= cutoff
                }

                time.sleep(15)  # scan every 15 seconds

            except Exception as e:
                print(f"Bot loop error: {e}")
                time.sleep(10)
                # Auto-reconnect if disconnected
                try:
                    if self.iq and self.is_connected:
                        self.iq.connect()
                        self.iq.change_balance(self.account_type)
                except Exception:
                    pass

    # ─────────────────────────────────────────────
    # STATUS & DATA
    # ─────────────────────────────────────────────

    def get_status(self):
        wins = sum(1 for t in self.trades if t['status'] == 'win')
        losses = sum(1 for t in self.trades if t['status'] == 'loss')
        total = wins + losses
        profit = sum(
            t['profit'] for t in self.trades
            if t['profit'] is not None
        )
        return {
            'connected': self.is_connected,
            'running': self.is_running,
            'account_type': self.account_type,
            'balance': round(self.balance, 2),
            'amount': self.amount,
            'wins': wins,
            'losses': losses,
            'win_rate': round(wins / total * 100, 1) if total > 0 else 0,
            'total_profit': round(profit, 2),
            'pairs_count': self.active_pairs_count
        }

    def get_trades(self):
        return self.trades

    def _emit_status(self):
        self.socketio.emit('status_update', self.get_status())
