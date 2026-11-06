# Diwali Wish — personalized mobile greeting

A responsive Diwali greeting webpage featuring a personalized `?name=Mayank` greeting, animated festive artwork, and a scroll-safe Amazon gift-card **demo** overlay.

## Files

- `index.html` — standalone responsive site with the corrected unwrap/close behavior
- `Dockerfile` and `nginx.conf` — lightweight static Nginx container
- `compose.yaml` — connects only this container to your existing Nginx Proxy Manager network
- `.env.example` — placeholder for `NPM_NETWORK` (copy to an untracked `.env` on VPS)
- `.github/workflows/deploy.yml` — **manual-only** deployment template; no deployment is triggered by a push
- `.gitignore` / `.dockerignore` — exclude local secrets

## Preview

Open `index.html` in a browser or run the container locally using the Compose file with an existing named Docker network. Name personalization: `?name=Mayank`, `?name=Rahul`, etc.

## Hostinger VPS setup

1. Check your running Nginx Proxy Manager container and its user-defined Docker network:

   ```bash
   docker ps --format 'table {{.Names}}\t{{.Image}}'
   docker inspect NPM_CONTAINER_NAME --format '{{range $name, $cfg := .NetworkSettings.Networks}}{{println $name}}{{end}}'
   ```

2. Connect as an appropriately authorized deployment user and prepare the directory and network configuration:

   ```bash
   sudo mkdir -p /opt/diwali-gift
   sudo chown "$USER":"$USER" /opt/diwali-gift
   cd /opt/diwali-gift
   printf 'NPM_NETWORK=REPLACE_WITH_ACTUAL_NPM_NETWORK\n' > .env
   chmod 600 .env
   ```

3. For **manual deployment** while configuring: clone the public repository to `/opt/diwali-gift` or transfer the files, then run `docker compose up -d --build --no-deps diwali`. Do not overwrite your existing VPS `.env`.

4. To use the GitHub Actions deployment template, set these **repository Actions secrets** under Settings → Secrets and variables → Actions:
   - `DEPLOY_HOST`: VPS public IP or direct SSH hostname, not Cloudflare-proxied hostname
   - `DEPLOY_PORT`: SSH port (normally 22)
   - `DEPLOY_USER`: dedicated SSH user permitted to update `/opt/diwali-gift` and run Docker
   - `DEPLOY_SSH_KEY`: dedicated private key for that user, stored only in GitHub Actions secrets
   - `DEPLOY_KNOWN_HOSTS`: verified SSH host key line(s), with the fingerprint checked out of band

   Never add keys or secrets to Git files. Running Docker is effectively privileged access to your VPS. Restrict the deployment account and credentials appropriately.

5. The workflow is **manual-only** intentionally to prevent an unconfigured or unintended VPS deploy. After the VPS is prepared and secrets set, you can run **Actions → Deploy Diwali website to Hostinger → Run workflow**. To enable automatic deploys later, add this to the YAML under `on:`:

   ```yaml
   push:
     branches: [main]
     paths: [index.html, Dockerfile, compose.yaml, nginx.conf, .github/workflows/deploy.yml]
   ```

6. In Cloudflare, point an A record for `diwali.aadtech.online` to the VPS IP. In Nginx Proxy Manager add a proxy host with upstream `http://diwali-gift-site:80`. Use a valid origin certificate and Full (strict) if proxying via Cloudflare.

The public greeting URL after deployment will be `https://diwali.aadtech.online/?name=Mayank`.

## Privacy / gift configuration

`CONFIG.giftUrl` in `index.html` is intentionally empty. The Amazon card is only a visual demo; it does not contain a real card or send a gift. **Never store claim codes, private redemption URLs, PINs, passwords, or private keys in a public repository or frontend HTML.** For recipient-specific gift redemption, use a protected backend or the official gift provider's secure delivery mechanism.

Changing `?name=` is a greeting customization only, not authentication.

## Troubleshooting

- **502 in Nginx Proxy Manager:** verify both containers share `NPM_NETWORK` and the upstream is `diwali-gift-site:80`.
- **GitHub Action fails:** confirm all five secrets, SSH firewall access, host-key fingerprint and VPS `.env`.
- **Gift card not claimable:** expected behavior until a secure redemption flow is configured.
