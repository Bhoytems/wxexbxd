from flask import Flask, render_template, jsonify, request, session
from flask_socketio import SocketIO
import os
from trader import TradingBot

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'fractalbot-motomori-2024')
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

bot = TradingBot(socketio)

APP_PASSWORD = os.environ.get('APP_PASSWORD', 'MOTOMORI')

@app.route('/')
def index():
    return render_template('index.html')

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
    success, message = bot.connect(
        data.get('email'),
        data.get('password'),
        data.get('account_type', 'PRACTICE')
    )
    return jsonify({'success': success, 'message': message})

@app.route('/api/start', methods=['POST'])
def start_bot():
    err = require_auth()
    if err: return err
    data = request.json
    amount = float(data.get('amount', 1))
    account_type = bot.account_type

    if account_type == 'REAL' and amount < 450:
        return jsonify({'success': False, 'message': 'Minimum trade amount for Real account is ₦450'})
    if account_type == 'PRACTICE' and amount < 1:
        return jsonify({'success': False, 'message': 'Minimum trade amount is ₦1'})

    success, message = bot.start(amount)
    return jsonify({'success': success, 'message': message})

@app.route('/api/stop', methods=['POST'])
def stop_bot():
    err = require_auth()
    if err: return err
    success, message = bot.stop()
    return jsonify({'success': success, 'message': message})

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
    success, message = bot.disconnect()
    return jsonify({'success': success, 'message': message})

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
