# =============================================================================
#  server.py - tiny Flask backend for the GA visualizer
#  ---------------------------------------------------------------------------
#  It keeps ONE GAEngine in memory and exposes a handful of endpoints:
#
#     GET  /                  the web page
#     GET  /api/defaults      the default settings (read from ga_ackley.CONFIG)
#     POST /api/init          start a fresh run with the settings from the UI
#     GET  /api/state         current state (used after a page reload)
#     POST /api/step          run ONE stage  (manual, one step at a time)
#     POST /api/generation    run the remaining stages of this generation
#     POST /api/auto          run one whole generation, details left out
#     POST /api/shutdown      stop the server (used by shutdown.py)
#
#  Run it with:   python server.py      then open http://127.0.0.1:5000
#  Stop it with:  CTRL+C, or  python shutdown.py  from another terminal
# =============================================================================

from flask import Flask, jsonify, request, send_from_directory

import os
import threading
import time
import engine

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(HERE, "static")

app = Flask(__name__, static_folder=None)

# The whole app is a single-user local tool, so one global engine is enough.
STATE = {"engine": None}


# =============================================================================
#  static files
# =============================================================================

@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(STATIC_DIR, filename)


# =============================================================================
#  api
# =============================================================================

@app.route("/api/defaults")
def api_defaults():
    """Send the default configuration so the sliders can start in the right place."""
    config = engine.build_config({})
    return jsonify({"config": config})


@app.route("/api/init", methods=["POST"])
def api_init():
    """Throw the old run away and build a new population."""
    payload = request.get_json(silent=True) or {}
    config = engine.build_config(payload.get("config"))

    STATE["engine"] = engine.GAEngine(config)
    return jsonify({"snapshot": STATE["engine"].snapshot()})


@app.route("/api/state")
def api_state():
    """Current state, or nothing if no run has been started yet."""
    current = STATE["engine"]
    if current is None:
        return jsonify({"snapshot": None})
    return jsonify({"snapshot": current.snapshot()})


@app.route("/api/step", methods=["POST"])
def api_step():
    """Manual mode, one step at a time: run exactly one stage."""
    current = STATE["engine"]
    if current is None:
        return jsonify({"error": "no run started"}), 400
    return jsonify(current.step())


@app.route("/api/generation", methods=["POST"])
def api_generation():
    """Manual mode, whole generation: run every remaining stage, with details."""
    current = STATE["engine"]
    if current is None:
        return jsonify({"error": "no run started"}), 400
    return jsonify(current.step_generation())


@app.route("/api/auto", methods=["POST"])
def api_auto():
    """Automatic mode: run whole generations without the animation details."""
    payload = request.get_json(silent=True) or {}
    count = payload.get("count", 1)
    try:
        count = int(count)
    except (TypeError, ValueError):
        count = 1
    if count < 1:
        count = 1
    if count > 100:
        count = 100

    current = STATE["engine"]
    if current is None:
        return jsonify({"error": "no run started"}), 400

    frames = []
    for i in range(count):
        if current.finished:
            break
        frames.append(current.run_generation_fast())

    return jsonify({"frames": frames, "finished": current.finished,
                    "stop_reason": current.stop_reason})


# =============================================================================
#  shutdown
# =============================================================================

def _quit_soon():
    """Leave the process a moment to send the reply, then stop it.

    os._exit is used on purpose: it stops the development server from any
    thread, which a plain return cannot do.
    """
    time.sleep(0.4)
    os._exit(0)


@app.route("/api/shutdown", methods=["POST"])
def api_shutdown():
    """Stop the server. Only reachable from this machine (see app.run below)."""
    print("")
    print("  shutdown requested - stopping the server")
    threading.Thread(target=_quit_soon, daemon=True).start()
    return jsonify({"stopping": True})


# =============================================================================
#  entry point
# =============================================================================

if __name__ == "__main__":
    print("")
    print("  GA Ackley visualizer")
    print("  open http://127.0.0.1:5000  in your browser")
    print("  stop it with CTRL+C, or with:  python shutdown.py")
    print("")
    # debug=False keeps the reloader from creating a second engine
    app.run(host="127.0.0.1", port=5000, debug=False)
