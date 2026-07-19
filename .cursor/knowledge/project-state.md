# Project state (as of 2026-07-19)

## What this is

**Lumon Wellness Compliance Terminal / Innie-Cam** — Severance-themed wellness habit PWA.

- **Desk view:** passive Floor 7 MDR office diorama (camera feed)
- **Terminal:** click CRT → embedded MDR app (DATA_MATRIX / RESOURCING / COMPLIANCE / UTILITIES)
- Outie habits → innie metrics (fluid, activity, AM/PM injection, sustenance)
- Four Tempers drive MDR digit feel; rare ambient events entertain during long coding sessions

## Recent commits (main)

| Commit | Summary |
|--------|---------|
| `bfcd902` | Desk idle presence + RESOURCING checklist + optional floor audio |
| `403bf27` | Severance knowledge base + Lumon voice / MDR temper digit pass |
| `82e8e1a` | P0–P4 QOL (CRT hit, kiosk, phone portal, fonts, session report) |
| `3f4c904` | Monitor PWA overhaul (ambient.js, engine.js, multi-size, smoke fix) |

Branch tracks `origin/main`. Do not commit `.git-status.txt` or `proxmox_mcp.log`.

## Key files

| Path | Role |
|------|------|
| `index.html` | Desk diorama + CRT-embedded terminal shell |
| `styles.css` | Design system v9+, multi-size, ambient, temper digits |
| `app.js` | State, render, kiosk, idle presence, wiring |
| `engine.js` | Pure decay / quota / temper / protocol checklist (unit-tested) |
| `ambient.js` | Rare event scheduler A/B/C |
| `audio.js` | Optional Web Audio floor hum + original motif (default off) |
| `avatar.js` | File-progress avatar helpers |
| `sw.js` | Offline shell — **CACHE_NAME `lumon-terminal-v11`** |
| `fonts/` | Self-hosted IBM Plex Mono + Silkscreen (latin woff2) |
| `tests/e2e/` | smoke (+ pointer CRT), responsive, ambient |
| `tests/unit/` | avatar + engine |

## Commands

```bash
npm start          # serve :8080
npm run lint       # validate-static (files, SW UTF-8, cache name)
npm run test:unit
npm run test:smoke
npm test           # unit + all e2e
```

Debug query params: `?reset=1`, `?debugTime=HH:MM`, `?ambientDebug=1|A|B|C`, `?syncApi=`

## Architecture notes

- CRT is `div#crt-monitor[role=button]` with `.crt-hit` plate (not a `<button>` — nested controls must stay valid)
- Terminal reparents CRT to `document.body` when focused; ESC restores to south pod
- State key: `localStorage['lumon-compliance-state']`
- Ambient persists cooldowns on `state.ambient`; pause when terminal focused / tab hidden
- Kiosk: wake lock + optional fullscreen; desk HUD `KIOSK` button + UTILITIES engage
- Phone ≤600px: tap scene opens terminal (“desk as portal”)

## CI / deploy

- `.github/workflows/deploy.yml` — lint → unit → Playwright Chromium → Docker → CapRover on `main`
- Bumping shell assets requires bumping `sw.js` `CACHE_NAME` **and** `scripts/validate-static.js` expected value (see `docs/DEPLOY-CAPROVER.md`)

## Tests status

Last green: lint + 16 unit + 13 e2e (includes real pointer CRT open).
