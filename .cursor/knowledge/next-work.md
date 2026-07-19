# Next work (recommended)

Prioritize in order unless the user redirects. Keep Severance voice + continuity files in sync when adding features.

## Recently shipped (this pass)

- **Engine v2** — protocol-bin core, `deriveTerminalSnapshot`, migration off bitflags, tick/record in engine
- **MDR / Cold Harbor frame UI** — header, temper/vitals rails, center modes, bins 01–05; CSS v10 + `--ui-scale`
- **Archival UX** — transmit status tones; Advanced endpoint; friendlier conflict copy
- **Install tips** — phone A2HS + desktop standalone kiosk dismissible tips
- **Richer optional audio** — motif variants + ambient event cues (still default off)
- **Visual regression smoke** — desk + terminal screenshots @ 1920×1080
- Knowledge: `visual-direction.md`, `engine-design.md`

## High value next slices

### 1. Phone equal polish
- Rail toggles UX polish; bin micro-labels on small screens
- First-run A2HS timing after orientation

### 2. Snapshot golden baselines
- Commit Playwright screenshot baselines if CI artifact review is insufficient

### 3. Archival casual path
- Optional default sync host for friends without Advanced endpoint

### 4. Temper digit deepening
- More dominant-temper digit behaviors tied to bin shortfall micros

## Lumon / Severance alignment (ongoing)

When touching UI/copy/ambient:

- Re-read `severance-facts.md` + `show-app-continuity.md` + `visual-direction.md`
- Habit math → `engine-design.md` / `engine.js` only (no parallel math in `app.js`)
- Easter eggs = lore crumbs; keep CR/XP tiny
- Ambient stays hours-scale

## Explicitly out of scope (unless asked)

- Framework migration
- Frequent ambient (sub-5-minute surprises)
- Auto full MDE / Waffle from ambient
- Shipping copyrighted Severance / show audio
- Committing secrets / `.git-status.txt` / `proxmox_mcp.log`
