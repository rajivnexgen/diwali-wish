# AADTECH Diwali gift website — Google Apps Script integration

The existing 103 personalized client gift links are kept in the **private** AADTECH Diwali Voucher Register Google Sheet. No OTP/email verification is required. **Do not publish or forward a customer's private link.**

- `index.html` and `voucher.js`: greeting + private gift link reveal
- `app.py`: public Flask website and proxy that holds the Apps Script secret on the VPS
- `apps-script/Code.gs`: Google Apps Script bridge. Reads one matching customer row, records first open/reveal, and returns a voucher code only on reveal
- `hostinger-compose.apps-script.yml`: Hostinger Docker Compose example with the existing Nginx Proxy Manager network

## One-time Google Apps Script deployment (no separate Google Cloud project)

1. Open the existing private Sheet: https://docs.google.com/spreadsheets/d/13OGBaycDMzoOGlykcDJToU1LVilRVRJwwldTKy5RXrg/edit
2. Go to **Extensions → Apps Script**. Replace the code in the default `Code.gs` with `apps-script/Code.gs` from this repository, then save.
3. In the VPS terminal, run `openssl rand -hex 32`. Keep the resulting **64-hex-character string secret**. Do not put the secret into GitHub, browser code, a chat, or a public sheet.
4. In Apps Script **Project Settings → Script Properties**, create property `BRIDGE_SECRET` with that exact secret string.
5. In Apps Script choose the function `authorizeBridge` and click **Run**. Authorize access to your private Sheet as its owner. This check does not read voucher codes or modify rows.
6. **Deploy → New deployment → Web app**; execute as **Me** and grant access to **Anyone** (anonymous access is needed for the private Flask backend to call it). Your organization's Google Workspace admin may disallow that setting. Copy the exact `https://script.google.com/macros/s/.../exec` web-app URL. **Anyone can invoke the endpoint, so protect it with the long secret.**
7. On your VPS, create an `.env` file in your existing Compose project directory, containing `APPS_SCRIPT_URL`, `APPS_SCRIPT_SECRET`, and `NPM_NETWORK`. Use `.env.apps-script.example` as a reference; substitute real values locally without committing them.
8. Adapt your **existing** Hostinger Diwali project to `hostinger-compose.apps-script.yml`, retaining the original Docker network and Nginx Proxy Manager hostname. The previous service-account JSON and `GOOGLE_SHEET_ID` variables are no longer needed.
9. In GitHub Actions, manually run **Publish Diwali Docker Image**, then on Hostinger pull and recreate only the Diwali service (`docker compose pull diwali && docker compose up -d --no-deps --force-recreate diwali`). If you use Hostinger Docker Manager instead, update the same existing project with equivalent Compose content. Do not create a conflicting duplicate.
10. Visit `https://wishes.aadtechgroup.com/healthz`: expect `"bridge_configured":true`. Then **privately test** one controlled gift link before sending any client links. The health endpoint checks configuration syntax, not connectivity or permissions.

## Sheet behavior (unchanged mappings)

- A: client_name
- D: denomination
- E: voucher_code
- F: link_token
- G: gift_link
- J: status (`READY`, `REVEALED`, `DISABLED`, or blank if code pending)
- K: first_opened_at
- L: revealed_at

30 customers with ₹5,001 gifts have reserved unique links while their voucher codes remain blank. Enter the actual voucher in **column E** when ready; the **same link** then becomes usable, unless the status is `DISABLED`. Never overwrite columns F or G. A `REVEALED` state records a code viewed, **not actual Amazon redemption**.

## Important security / operational notes

- No voucher code, private link, or Apps Script shared secret should be pushed to GitHub.
- The HTTPS URL fragment `#gift=...` avoids placing the bearer token in normal web-server request logs. The token still grants access to anyone who possesses it.
- The Apps Script secret is POSTed only from the VPS over HTTPS. Apps Script redirects its JSON response to a Googleusercontent URL; the Flask bridge follows only HTTPS redirects to `script.googleusercontent.com`.
- **A pre-launch cryptographic randomness audit of the 103 existing tokens is still required.** Unique token strings alone do not prove unguessability. If they are not securely random, replace and redistribute them **before** using real gift codes.
- Apps Script calls can encounter quotas and concurrency limits. The script uses a lock for tracking writes; excessive usage should return a temporary error.
- Test in a controlled row; testing an actual voucher reveal will set its status to `REVEALED`.
- Deployment/owner authorization **cannot be completed by committing files to GitHub**. Finish the Google and VPS actions above before distributing the private links.
