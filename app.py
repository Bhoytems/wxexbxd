from functools import wraps
from flask import Flask, render_template, request, redirect, url_for, session, jsonify

import storage
import engine
from config import SECRET_KEY, PASSCODE, ASSETS

app = Flask(__name__)
app.secret_key = SECRET_KEY

storage.init_db()
engine.start_background_thread()


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("authed"):
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return wrapper


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        if request.form.get("passcode") == PASSCODE:
            session["authed"] = True
            return redirect(url_for("dashboard"))
        error = "Incorrect passcode"
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
@login_required
def dashboard():
    toggles = storage.get_asset_toggles()
    channels = storage.list_channels()
    running = storage.is_engine_running()
    signals = storage.recent_signals(30)
    perf = storage.performance_summary()

    for s in signals:
        s["sent_at_wat"] = storage.to_wat(s["sent_at_utc"])

    return render_template(
        "dashboard.html",
        assets=ASSETS,
        toggles=toggles,
        channels=channels,
        running=running,
        signals=signals,
        perf=perf,
    )


# ---------- API: engine control ----------

@app.route("/api/engine/start", methods=["POST"])
@login_required
def api_engine_start():
    storage.set_engine_running(True)
    return jsonify({"running": True})


@app.route("/api/engine/stop", methods=["POST"])
@login_required
def api_engine_stop():
    storage.set_engine_running(False)
    return jsonify({"running": False})


# ---------- API: asset toggles ----------

@app.route("/api/assets/toggle", methods=["POST"])
@login_required
def api_toggle_asset():
    data = request.get_json(force=True)
    asset_key = data.get("asset_key")
    enabled = bool(data.get("enabled"))
    if asset_key not in ASSETS:
        return jsonify({"error": "unknown asset"}), 400
    storage.set_asset_toggle(asset_key, enabled)
    return jsonify({"asset_key": asset_key, "enabled": enabled})


@app.route("/api/assets/toggle_all", methods=["POST"])
@login_required
def api_toggle_all():
    data = request.get_json(force=True)
    enabled = bool(data.get("enabled"))
    storage.set_all_asset_toggles(enabled)
    return jsonify({"enabled": enabled})


# ---------- API: channels ----------

@app.route("/api/channels/add", methods=["POST"])
@login_required
def api_add_channel():
    data = request.get_json(force=True)
    chat_id = (data.get("chat_id") or "").strip()
    label = (data.get("label") or "").strip()
    if not chat_id:
        return jsonify({"error": "chat_id required"}), 400
    cid = storage.add_channel(chat_id, label)
    return jsonify({"id": cid, "chat_id": chat_id, "label": label})


@app.route("/api/channels/remove", methods=["POST"])
@login_required
def api_remove_channel():
    data = request.get_json(force=True)
    channel_id = data.get("id")
    storage.remove_channel(channel_id)
    return jsonify({"removed": channel_id})


# ---------- API: polling for live dashboard refresh ----------

@app.route("/api/status")
@login_required
def api_status():
    return jsonify({
        "running": storage.is_engine_running(),
        "perf": storage.performance_summary(),
        "signals": [
            {**s, "sent_at_wat": storage.to_wat(s["sent_at_utc"])}
            for s in storage.recent_signals(30)
        ],
    })


if __name__ == "__main__":
    import os
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
