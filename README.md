# Lumon Wellness Compliance Terminal

A self-contained wellness compliance terminal for monitoring **SUBJECT #4229**. Built with vanilla HTML5, CSS custom properties, and ES6 JavaScript. No frameworks.

## Features

- Clinical metric tracking: Fluid Efficiency, Quota Progression, Compliance Standing
- MDR wireframe data node viewport with state-driven animations
- Delta-time fluid efficiency decay (15% per 4 hours)
- Compliance dose grace period (advisory 11:00, penalty after 14:00)
- Quota progression and refinement tiers
- Lumon Procurement (department palettes and node geometries)
- iOS Add to Home Screen (PWA)
- Optional archival transmission (hash-code server sync)

## Quick Start

### Static app

Serve the project root over HTTP (required for ES modules and service worker):

```bash
# Python
python -m http.server 8080

# Node (npx)
npx serve -p 8080
```

Open `http://localhost:8080`

### Archival server (optional)

```bash
node server/sync-server.js 3847
```

In the terminal UI, open **ARCHIVAL**, set endpoint to `http://localhost:3847/api`, enable protocol, and **TRANSMIT RECORD**.

> For cross-origin sync from the static app, serve both over HTTP. In production, deploy the API with HTTPS and CORS enabled.

## iOS Install

1. Deploy static files to HTTPS (GitHub Pages, Netlify, Cloudflare Pages)
2. Open URL in **Safari**
3. Tap **Share** → **Add to Home Screen**
4. Confirm **Lumon Terminal**

iOS requires HTTPS for PWA installation (except localhost during development).

## Dev Helpers

| Query param | Effect |
|-------------|--------|
| `?debugTime=11:30` | Override local time for compliance testing |
| `?debugTime=14:30` | Test post-cutoff penalty |
| `?reset=1` | Clear localStorage on load |
| `?syncApi=https://host/api` | Pre-fill archival endpoint |

## File Structure

```
index.html          Compliance UI
styles.css            Lumon design system
app.js                State engine and render loop
sync.js               Archival encryption and sync
sw.js                 Service worker (offline shell)
manifest.webmanifest  PWA manifest
server/sync-server.js Reference archival API
icons/                App icons
```

## Security Note

Archival hashes are secrets. Anyone with the hash (and optional passphrase) can read and overwrite your record. Self-host the reference server for personal use only.
