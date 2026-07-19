# Lumon Wellness Compliance Terminal

A self-contained **Innie-Cam** wellness compliance terminal for monitoring **SUBJECT #4229**. Vanilla HTML/CSS/ES modules — no frameworks. Designed as an always-on secondary-monitor ambient PWA with a zoom-into-CRT habit logger.

## Features

- Passive Floor 7 MDR office diorama (Innie-Cam) with rare Severance-tied ambient events
- Embedded MDR terminal: Data Matrix, Resourcing, Compliance, Utilities
- Clinical metric tracking with delta-time decay and Four Tempers
- Quota progression, milestones (eraser / finger trap / MDE / waffle prestige)
- Lumon Procurement (department palettes and node geometries)
- Kiosk / Stay Awake (Screen Wake Lock) for long desk sessions
- iOS / Chromium Add to Home Screen (PWA) + offline shell
- Optional archival transmission (hash-code server sync)

## Quick Start

```bash
npx serve -p 8080
```

Open `http://localhost:8080`

### Archival server (optional)

```bash
node server/sync-server.js 3847
```

## Tests

```bash
npm run lint          # required files, SW UTF-8, shell cache markers
npm run test:unit     # engine + avatar unit tests
npm run test:smoke    # Playwright core smoke
npm test              # unit + full e2e (smoke, responsive, ambient)
```

## iOS Install

1. Deploy static files to HTTPS
2. Open URL in **Safari**
3. Tap **Share** → **Add to Home Screen**
4. Confirm **Innie-Cam**

## Dev Helpers

| Query param | Effect |
|-------------|--------|
| `?debugTime=11:30` | Override local time for compliance testing |
| `?debugTime=14:30` | Test post-cutoff penalty |
| `?reset=1` | Clear localStorage on load |
| `?syncApi=https://host/api` | Pre-fill archival endpoint |
| `?ambientDebug=1` | Force next ambient event |
| `?ambientDebug=A` / `B` / `C` | Force a specific ambient tier |

Ambient events are rare by design (≈45m+ cooldown, 0–2 per long session). Use debug flags for QA.

## File Structure

```
index.html            Innie-Cam + CRT UI
styles.css            Lumon design system (multi-size)
app.js                App shell, render, wiring
engine.js             Pure decay / quota / temper helpers
ambient.js            Rare desk-event scheduler
avatar.js             Refinement avatar helpers
sync.js               Archival encryption and sync
sw.js                 Service worker (offline shell + font cache)
manifest.webmanifest  PWA manifest
tests/                Unit + Playwright e2e
server/sync-server.js Reference archival API
icons/                App icons
```

## Security Note

Archival hashes are secrets. Anyone with the hash (and optional passphrase) can read and overwrite your record. Self-host the reference server for personal use only.
