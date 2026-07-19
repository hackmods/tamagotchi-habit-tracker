# Project state (as of 2026-07-19)

## What this is

**Lumon Wellness Compliance Terminal / Innie-Cam** — Severance-themed wellness habit PWA.

- **Desk view:** passive Floor 7 MDR office diorama (camera feed)
- **Terminal:** MDR/Cold Harbor frame (header · rails · center · protocol bins 01–05)
- Outie habits → innie metrics via **engine v2** protocol-bin snapshot
- Four Tempers drive MDR digit feel; rare ambient events entertain during long coding sessions

## Recent commits (main)

| Commit | Summary |
|--------|---------|
| *(this pass)* | Engine v2 + MDR frame UI + QOL (archival/install/audio/visual) |
| `bfcd902` | Desk idle presence + RESOURCING checklist + optional floor audio |
| `403bf27` | Severance knowledge base + Lumon voice / MDR temper digit pass |
| `82e8e1a` | P0–P4 QOL (CRT hit, kiosk, phone portal, fonts, session report) |
| `3f4c904` | Monitor PWA overhaul (ambient.js, engine.js, multi-size, smoke fix) |

Branch tracks `origin/main`. Do not commit `.git-status.txt` or `proxmox_mcp.log`.

## Key files

| Path | Role |
|------|------|
| `index.html` | Desk diorama + CRT-embedded MDR frame shell |
| `styles.css` | Design system **v10** — frame grid, `--ui-scale`, phosphor |
| `app.js` | View layer, kiosk, idle presence, wiring |
| `engine.js` | **v2** protocol-bin core: tick / record / snapshot / migrate |
| `ambient.js` | Rare event scheduler A/B/C |
| `audio.js` | Optional Web Audio floor hum + motifs + ambient cues (default off) |
| `avatar.js` | File-progress avatar helpers |
| `sw.js` | Offline shell — **CACHE_NAME `lumon-terminal-v12`** |
| `fonts/` | Self-hosted IBM Plex Mono + Silkscreen (latin woff2) |
| `tests/e2e/` | smoke, responsive, visual (1920 screenshots), ambient |
| `tests/unit/` | avatar + engine v2 |
| `.cursor/knowledge/visual-direction.md` | Stills → craft |
| `.cursor/knowledge/engine-design.md` | Habit engine v2 contract |

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
- State key: `localStorage['lumon-compliance-state']` — `stateVersion: 2` with explicit `dailyLog.awards`
- Ambient persists cooldowns on `state.ambient`; pause when terminal focused / tab hidden
- Kiosk: wake lock + optional fullscreen; desk HUD `KIOSK` button + UTILITIES engage
- Phone ≤600px: tap scene opens terminal (“desk as portal”); sticky protocol bins

## CI / deploy

- `.github/workflows/deploy.yml` — lint → unit → Playwright Chromium → Docker → CapRover on `main`
- Bumping shell assets requires bumping `sw.js` `CACHE_NAME` **and** `scripts/validate-static.js` expected value (see `docs/DEPLOY-CAPROVER.md`)

## Tests status

Last green target: lint + unit + smoke + responsive + visual.
