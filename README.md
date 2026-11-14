# AAD TECH | Private Diwali Gift Links (no OTP/email verification)

## What is included
- Hindi/English responsive Diwali webpage, with personalized greeting and existing design.
- **103 unique per-client links already stored privately in the Google Sheet**, not in this repository.
- Browser fragment URLs: `https://wishes.aadtechgroup.com/#gift=<48-hex-character-token>`.
- `voucher.js` asks the backend for the matching recipient and (only after a click) that row's gift code.
- `app.py` is the Flask server-side Google Sheets API. No Google Sheet API keys or voucher codes are shipped to the browser in advance.
- No OTP or email verification. Anyone holding a complete private link can access its voucher. Do not forward or publish private links.

## Existing Google Sheet
Spreadsheet: `13OGBaycDMzoOGlykcDJToU1LVilRVRJwwldTKy5RXrg`; tab: `Vouchers`.

| Column | Purpose |
|---|---|
| A | client_name |
| D | denomination |
| E | voucher_code — fill in later for pending ₹5,001 gifts |
| F | link_token, unique 192-bit token |
| G | gift_link |
| J | READY, REVEALED, DISABLED, or blank for pending codes |
| K | first_opened_at |
| L | revealed_at |

As initially prepared: 73 codes present and 30 codes missing (all ₹5,001). All 103 links can be reserved before codes arrive. When a code is entered in column E, the backend treats that row as READY unless J is DISABLED. An already-REVEALED gift remains viewable. The code is never regenerated automatically.

## VPS setup — required before distributing links
1. Create a Google Cloud service account with Sheets API enabled. Give its `client_email` **Editor access to this one private Sheet only**. Do not make the Sheet publicly accessible.
2. Download its JSON credential to the VPS path `/opt/diwali-gift/service-account.json`; protect it using filesystem permissions and backups. **Never add credential JSON to GitHub or the website.**
3. Configure the runtime environment variables `GOOGLE_SHEET_ID=13OGBaycDMzoOGlykcDJToU1LVilRVRJwwldTKy5RXrg`, `GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/google-service-account.json`, `TRUSTED_ORIGIN=https://wishes.aadtechgroup.com`.
4. Mount `/opt/diwali-gift/service-account.json:/run/secrets/google-service-account.json:ro` into the container. `hostinger-compose.voucher.example.yml` is a sample; apply the equivalent settings to the **actual** Hostinger deployment mode (local build vs GHCR image). Preserve the Nginx Proxy Manager network.
5. Publish/rebuild the latest Docker image using the existing manually-triggered GitHub Actions workflows and redeploy the Hostinger container. Check `/healthz` and test with a controlled private sample link before distributing anything.
6. Treat all shared links as bearer credentials. Don't log the fragment, copy client links into public chats, expose the Sheet, or put spreadsheet contents in GitHub.

## Notes
The front-end `Share Wishes` button shares only the public greeting URL, never a recipient's private token. Existing `/rajiv` style greeting routes are preserved. An unavailable backend returns an error rather than exposing a fake voucher. `REVEALED` means viewed, not redeemed on Amazon.

**Current state:** Code in GitHub is not proof that the Hostinger VPS was redeployed or service-account permissions were configured. Without the private credential and deployment, gift links are not yet functional.
