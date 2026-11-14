"""Flask host for private voucher links backed by a Google Apps Script web app.

Uses no Google Cloud service account. The shared secret is server-side only.
Browser users supply a 192-bit bearer token in a POST JSON body.
Do not log tokens, posted bodies, or returned gift codes.
"""
import logging
import os
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from flask import Flask, abort, jsonify, request, send_file

BASE_DIR = Path(__file__).resolve().parent
APPS_SCRIPT_URL = os.getenv("APPS_SCRIPT_URL", "").strip()
APPS_SCRIPT_SECRET = os.getenv("APPS_SCRIPT_SECRET", "").strip()
TRUSTED_ORIGIN = os.getenv("TRUSTED_ORIGIN", "https://wishes.aadtechgroup.com").rstrip("/")
TOKEN_RE = re.compile(r"^[0-9a-f]{48}$")
SECRET_RE = re.compile(r"^[0-9a-f]{64}$")
app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 2048
logger = logging.getLogger(__name__)


@app.after_request
def private_headers(response):
    response.headers["Cache-Control"] = "no-store, max-age=0"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


def configured():
    url = urlparse(APPS_SCRIPT_URL)
    return (
        url.scheme == "https"
        and url.netloc == "script.google.com"
        and url.path.startswith("/macros/s/")
        and url.path.endswith("/exec")
        and bool(SECRET_RE.fullmatch(APPS_SCRIPT_SECRET))
    )


def get_token():
    origin = request.headers.get("Origin")
    if origin and origin != TRUSTED_ORIGIN:
        abort(403)
    if not request.is_json:
        abort(415)
    payload = request.get_json(silent=True) or {}
    token = payload.get("token")
    if not isinstance(token, str) or not TOKEN_RE.fullmatch(token):
        abort(404)
    return token


def bridge_call(action, token):
    if not configured():
        logger.error("Apps Script bridge configuration is missing or invalid")
        return None, 503
    try:
        # Don't auto-follow a POST redirect: keep the secret POST body at script.google.com.
        result = requests.post(
            APPS_SCRIPT_URL,
            json={"action": action, "token": token, "secret": APPS_SCRIPT_SECRET},
            timeout=(7, 25),
            allow_redirects=False,
        )
        if result.status_code in (301, 302, 303):
            location = result.headers.get("Location", "")
            destination = urlparse(urljoin(APPS_SCRIPT_URL, location))
            if destination.scheme != "https" or destination.hostname != "script.googleusercontent.com":
                raise ValueError("Unexpected Apps Script redirect")
            result = requests.get(destination.geturl(), timeout=(7, 25), allow_redirects=False)
        if result.status_code != 200:
            logger.error("Apps Script returned HTTP %s", result.status_code)
            return None, 503
        data = result.json()
        if not isinstance(data, dict) or type(data.get("ok")) is not bool:
            return None, 503
        if not data["ok"]:
            error = str(data.get("error", "Gift service unavailable"))
            if error == "Invalid gift link":
                return {"error": error}, 404
            if error == "Gift link disabled":
                return {"error": error}, 403
            if error == "Your gift is not ready yet":
                return {"error": error}, 409
            if error == "Busy; try again":
                return {"error": "Service busy; please retry"}, 503
            return {"error": "Gift service temporarily unavailable"}, 503
        return data, 200
    except (requests.RequestException, ValueError, TypeError):
        # Never log the token, secret, returned voucher, or request body.
        logger.error("Apps Script bridge request failed")
        return None, 503


@app.get("/healthz")
def health():
    return jsonify(service="diwali-gift", status="ok", bridge_configured=configured())


@app.post("/api/gift/lookup")
def lookup():
    data, status = bridge_call("lookup", get_token())
    if status != 200:
        return jsonify(data or {"error": "Gift service temporarily unavailable"}), status
    return jsonify(
        name=str(data.get("name", ""))[:120],
        denomination=data.get("denomination", 0),
        status=data.get("status", "PENDING"),
    )


@app.post("/api/gift/reveal")
def reveal():
    data, status = bridge_call("reveal", get_token())
    if status != 200:
        return jsonify(data or {"error": "Gift service temporarily unavailable"}), status
    code = data.get("voucher_code")
    if not isinstance(code, str) or not code:
        return jsonify(error="Gift service temporarily unavailable"), 503
    return jsonify(
        status="REVEALED",
        voucher_code=code,
        redeem_url="https://www.amazon.in/gc/redeem",
    )


@app.get("/voucher.js")
def voucher_script():
    return send_file(BASE_DIR / "voucher.js", mimetype="application/javascript")


@app.get("/")
def homepage():
    return send_file(BASE_DIR / "index.html", mimetype="text/html")


@app.get("/<path:name>")
def greeting_page(name):
    # Keep existing /rajiv personalization; never serve arbitrary container files.
    if "/" in name or len(name) > 100 or "." in name:
        abort(404)
    return send_file(BASE_DIR / "index.html", mimetype="text/html")
