# Project state (as of 2026-07-19)

## What this is

**Lumon Wellness Compliance Terminal / Innie-Cam** — Severance-themed wellness habit PWA.

- **Desk view:** Floor 7 campus (MDR island default + hallway / wellness / breakroom / O&D / rare perpetuity)
- **Terminal:** MDR/Cold Harbor frame — protocols only while `room === mdr`
- Outie habits → innie metrics via **engine** protocol-bin snapshot (`stateVersion` **3**)
- Department standing + slow sidequests; rare ambient filtered by room

## Recent commits (main)

| Commit | Summary |
|--------|---------|
| *(this pass)* | Floor campus: `?room=`, standing, sidequests, room scenes |
| *(prior)* | Engine v2 + MDR frame UI + QOL; MDR island landing; desk flatten |
| `bfcd902` | Desk idle presence + RESOURCING checklist + optional floor audio |

Branch tracks `origin/main`. Do not commit `.git-status.txt` or `proxmox_mcp.log`.

## Key files

| Path | Role |
|------|------|
| `index.html` | Desk diorama + room layers + CRT MDR frame |
| `styles.css` | Frame + campus room scenes |
| `app.js` | Views, room router, quest hooks, kiosk |
| `engine.js` | Protocol-bin core; migrate → v3 campus fields |
| `campus.js` | Rooms, URL sync, department standing |
| `campusLooks.js` | Gameplay → CSS look signals / beacons |
| `sidequests.js` | Invitation catalog + progress |
| `ambient.js` | Rare A/B/C events with `rooms` filter |
| `audio.js` | Optional floor audio + ambient cues |
| `sw.js` | Offline shell — **CACHE_NAME `lumon-terminal-v18`** |
| `.cursor/knowledge/floor-campus.md` | Campus contract |
| `.cursor/knowledge/sidequests.md` | Invitation design |

## Commands

```bash
npm start          # serve :8080
npm run lint       # validate-static (files, SW UTF-8, cache name)
npm run test:unit
npm run test:smoke
npm test           # unit + all e2e
```

Debug query params: `?reset=1`, `?debugTime=HH:MM`, `?ambientDebug=1|A|B|C`, `?syncApi=`, `?room=hallway|wellness|…`

## Architecture notes

- CRT reparents to `document.body` when focused; ESC → desk; from non-MDR room ESC → MDR
- State: `localStorage['lumon-compliance-state']` — `stateVersion: 3` with `campus`, `departments`, `sidequests`
- Ambient pauses in terminal / hidden tab; room-scoped event pools
- Phone ≤600px: tap MDR scene opens terminal; room peeks still work

## CI / deploy

- `.github/workflows/deploy.yml` — lint → unit → Playwright → Docker; CapRover when secrets set
- Bumping shell assets: bump `sw.js` `CACHE_NAME` **and** `scripts/validate-static.js` expected value

## Tests status

Target green: lint + unit (incl. campus) + smoke + responsive + visual + campus e2e.
