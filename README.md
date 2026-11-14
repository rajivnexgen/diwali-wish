# AAD TECH | Diwali Greetings — Hindi + English UI

Responsive festive greeting with polished typography. The main greeting and full Hindi message are left-aligned inside the message card; the headline remains centered. English action labels: **Token of Appreciation**, **Share Wishes**, and **Go Back**.

Fonts: Rozha One for the festive Devanagari headline, Tiro Devanagari Hindi for the greeting, Hind for Hindi body copy, and DM Sans for English UI controls. Fonts are loaded using Google Fonts with system fallbacks.

Open `index.html` directly on a phone or computer. It embeds the logo and festive artwork; no separate assets are required. For hosting, include `index.html`, `Dockerfile`, and `nginx.conf` in your GitHub repository. After publishing a new GHCR image, recreate the existing Hostinger Compose project to pull the new image. This package **does not update GitHub or your live VPS**.

The sample gift card is demo-only; no active redemption link, code or secret is embedded. `nginx.conf` includes fallback routing for `/rajiv`, `/mayank` etc. Personal names are not authentication.
