"""Diwali gift API. Tokens live only in a private Google Sheet, never in GitHub.

A 192-bit bearer-token link permits the holder to reveal exactly one voucher.
No OTP/email authentication is required. Do not share or log tokens.
"""
import hmac
import logging
import os
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from flask import Flask, abort, jsonify, request, send_file
from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

BASE_DIR = Path(__file__).resolve().parent
SPREADSHEET_ID = os.getenv("GOOGLE_SHEET_ID", "")
CREDENTIALS_FILE = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "/run/secrets/google-service-account.json")
TRUSTED_ORIGIN = os.getenv("TRUSTED_ORIGIN", "https://wishes.aadtechgroup.com").rstrip("/")
TOKEN_RE = re.compile(r"^[0-9a-f]{48}$")
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
_app_session = None

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 1024
log = logging.getLogger(__name__)


@app.after_request
def set_headers(response):
    response.headers["Cache-Control"] = "no-store, max-age=0"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    return response


def get_session():
    global _app_session
    if not SPREADSHEET_ID or not Path(CREDENTIALS_FILE).is_file():
        raise RuntimeError("Google Sheet service account is not configured")
    if _app_session is None:
        credentials = service_account.Credentials.from_service_account_file(
            CREDENTIALS_FILE, scopes=SCOPES
        )
        _app_session = AuthorizedSession(credentials)
    return _app_session


def api_url(suffix):
    return "https://sheets.googleapis.com/v4/spreadsheets/" + SPREADSHEET_ID + suffix


def get_rows():
    url = api_url("/values/%27Vouchers%27%21A2%3AL")
    resp = get_session().get(url, timeout=12)
    resp.raise_for_status()
    return resp.json().get("values", [])


def set_cells(changes):
    payload = {
        "valueInputOption": "RAW",
        "data": [
            {"range": "'Vouchers'!" + col + str(row_no), "values": [[value]]}
            for col, row_no, value in changes
        ],
    }
    resp = get_session().post(api_url("/values:batchUpdate"), json=payload, timeout=12)
    resp.raise_for_status()


def locate(token):
    found = None
    for row_num, raw in enumerate(get_rows(), start=2):
        if len(raw) > 5 and isinstance(raw[5], str) and hmac.compare_digest(raw[5], token):
            if found is not None:  # Duplicate token should never disclose either voucher.
                return None
            found = (row_num, (raw + [""] * 12)[:12])
    return found


def client_status(cells):
    code = str(cells[4]).strip()
    status = str(cells[9]).strip().upper()
    if status == "DISABLED":
        return "DISABLED"
    if not code:
        return "PENDING"
    if status == "REVEALED":
        return "REVEALED"
    # Blank status is allowed for vouchers whose codes will be entered later.
    return "READY"


def receive_token():
    if request.headers.get("Origin") not in (None, TRUSTED_ORIGIN):
        abort(403)
    if not request.is_json:
        abort(415)
    data = request.get_json(silent=True) or {}
    token = data.get("token")
    if not isinstance(token, str) or not TOKEN_RE.fullmatch(token):
        abort(404)
    return token


def ist_now():
    return datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(timespec="seconds")


def amount(cells):
    digits = re.sub(r"[^0-9]", "", str(cells[3]).split(".")[0])
    return int(digits) if digits else 0


@app.get("/healthz")
def health():
    return {"service": "diwali-gift", "status": "ok"}


@app.post("/api/gift/lookup")
def lookup():
    token = receive_token()
    try:
        found = locate(token)
        if found is None:
            return jsonify(error="Invalid gift link"), 404
        row_num, cells = found
        status = client_status(cells)
        changes = []
        if not cells[10]:
            changes.append(("K", row_num, ist_now()))
        if status == "READY" and not str(cells[9]).strip():
            changes.append(("J", row_num, "READY"))
        if changes:
            set_cells(changes)
        return jsonify(
            name=str(cells[0])[:120],
            denomination=amount(cells),
            status=status
        )
    except Exception:
        log.exception("Gift lookup failed; bearer token intentionally excluded from logs")
        return jsonify(error="Gift service temporarily unavailable"), 503


@app.post("/api/gift/reveal")
def reveal():
    token = receive_token()
    try:
        found = locate(token)
        if found is None:
            return jsonify(error="Invalid gift link"), 404
        row_num, cells = found
        status = client_status(cells)
        if status == "DISABLED":
            return jsonify(error="Gift link disabled"), 403
        if status == "PENDING":
            return jsonify(error="Your gift is not ready yet"), 409
        changes = []
        if status == "READY":
            changes.append(("J", row_num, "REVEALED"))
        if not cells[11]:
            changes.append(("L", row_num, ist_now()))
        if changes:
            set_cells(changes)
        return jsonify(
            status="REVEALED",
            voucher_code=str(cells[4]).strip(),
            redeem_url="https://www.amazon.in/gc/redeem",
        )
    except Exception:
        log.exception("Gift reveal failed; bearer token intentionally excluded from logs")
        return jsonify(error="Gift service temporarily unavailable"), 503


@app.get("/voucher.js")
def voucher_script():
    return send_file(BASE_DIR / "voucher.js", mimetype="application/javascript")


@app.get("/")
def index_page():
    return send_file(BASE_DIR / "index.html", mimetype="text/html")


@app.get("/<path:slug>")
def greeting_page(slug):
    # Preserve the existing /rajiv-style routes without serving arbitrary files.
    if "/" in slug or len(slug) > 100 or "." in slug:
        abort(404)
    return send_file(BASE_DIR / "index.html", mimetype="text/html")
