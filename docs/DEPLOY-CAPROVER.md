# CapRover deployment (GitHub Actions)

Pushes to `main` validate the static PWA assets, smoke-test the Docker image, then upload the source as a tarball to CapRover. CapRover builds the image from `captain-definition` + `Dockerfile` and deploys it — no container registry required.

## One-time CapRover setup

1. **Create the app** in the CapRover dashboard before the first deploy.
   - Use a short lowercase name, e.g. `lumon-terminal`
   - This name must match `CAPROVER_APP_NAME` **exactly**
2. Open the app → **HTTP Settings** → set container port to **80**
3. Enable **HTTPS** (Let's Encrypt) and map your domain
4. Open the app → **Deployment** → **Enable App Token** → copy the token

No app environment variables are required for the static PWA. Archival sync (`server/sync-server.js`) is a separate optional service — deploy it on its own CapRover app if you need cross-device sync.

## GitHub secrets

| Secret | Required | Example | Notes |
|--------|----------|---------|-------|
| `CAPROVER_SERVER` | Yes | `https://captain.apps.example.com` | CapRover **dashboard** URL |
| `CAPROVER_APP_NAME` | Yes | `lumon-terminal` | Exact app name — not a URL |
| `CAPROVER_APP_TOKEN` | Yes* | (Deployment tab) | App deploy token |
| `CAPROVER_PASSWORD` | Optional | Captain password | Auto-creates app if missing; deploys with password auth |
| `CAPROVER_OTP_TOKEN` | Optional | 2FA code | Required if CapRover dashboard has two-factor auth enabled |

\* Use `CAPROVER_APP_TOKEN` **or** `CAPROVER_PASSWORD`. If the app does not exist yet, add `CAPROVER_PASSWORD` once — CI will create the app, then deploy.

**Find `CAPROVER_SERVER`:** open the CapRover dashboard in your browser and copy that URL.

## How the build works

The workflow tars the repo (excluding `node_modules`, `.git`, `server/data`) and POSTs it to CapRover's `appData` endpoint. CapRover reads `captain-definition`, builds the nginx image on the server, then deploys it.

```
push main → validate static assets + docker build smoke
          → deploy job uploads tarball to CapRover
          → CapRover builds Dockerfile (nginx:alpine + static files)
          → app live at https://<app>.<your-domain>
```

## Local smoke test

```bash
docker build -t lumon-terminal:local .
docker run --rm -p 8080:80 lumon-terminal:local
# open http://localhost:8080
```

## Troubleshooting

### 404 "Nothing here yet" on deploy

The app name in `CAPROVER_APP_NAME` **does not exist** on your CapRover server.

**Fix (pick one):**

1. **Manual:** CapRover dashboard → Apps → Create New App → name it exactly like `CAPROVER_APP_NAME` → Deployment → Enable App Token → update GitHub secrets.
2. **Automatic:** Add GitHub secret `CAPROVER_PASSWORD`. The workflow will create the app on first run, then deploy.

### Wrong server URL

| Wrong (`CAPROVER_SERVER`) | Right |
|---------------------------|-------|
| `https://lumon-terminal.apps.example.com` | `https://captain.apps.example.com` |
| Your app's public URL | CapRover dashboard URL |

### PWA / service worker not updating

The nginx config sets `Cache-Control: no-cache` on `sw.js`. After deploy, users may need one hard refresh (`Ctrl+Shift+R`) to pick up a new service worker.

### Self-signed HTTPS

The workflow calls the CapRover API with `curl -k`, so self-signed captain certificates are accepted. Enable Let's Encrypt in CapRover for production.
