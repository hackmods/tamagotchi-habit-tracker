# Visual direction (Severance stills → Innie-Cam)

Craft rules for desk ambient + MDR terminal. Pair with `show-app-continuity.md` (metaphor) and `styles.css` (tokens).

## Reference roles

| Role | Finding |
|------|---------|
| **Office island** | Centered 4-pod on vast sage carpet; extreme negative space; white desks/walls; deep forest partition panels; recessed ceiling light grid |
| **MDR chrome** | Deep teal void + cyan phosphor; titlebar (file · % · Lumon); dense monospaced center; thin 1px rules; footer bins `01`–`05` with segment bars |
| **Cold Harbor frame** | Edge vitals clear the center; modular bottom row; all-caps mono; scanlines; hierarchy via number weight, not chrome clutter |
| **Conference** | Secondary palette only (grey panels, teal, mustard) → maps to `breakroom` / procurement, **not** default shell |

## Locked craft principles

1. **Sterile modularism** — high-contrast boundaries, generous empty space, modular repeating units.
2. **Central work stage** — refinement (digit field / protocol expand) is the island; rails and bins frame it.
3. **Phosphor, not neon** — cyan/green on deep teal; no purple cyber glow.
4. **Grid discipline** — ceiling grid (desk) and CSS grid frame (terminal) imply the same order.
5. **Reduction** — if a control isn’t needed for the immediate protocol, hide it behind UTILITIES or Advanced.

## Rejected

- Purple-on-white / indigo gradients; cream + terracotta serif; broadsheet hairline newspaper layouts
- Card dashboards, soft glassmorphism, Inter/Roboto as hero type
- Turning the office diorama into a fluid CSS grid (keep art-directed absolute %)

## Token mapping (implementation)

| Still cue | CSS / surface |
|-----------|----------------|
| Sage carpet | `--carpet*` |
| Deep partitions | `--partition*` |
| White desk/wall | `--desk*`, `--wall*`, `--ceiling*` |
| MDR phosphor | `--bg-void/deep/panel`, `--term-green`, `--text*` |
| Temper bins | `--woe`, `--frolic`, `--dread`, `--malice` |
| Scale | `--ui-scale` consumed on `#terminal-frame` |

## Campus rooms (craft)

| Room | Look |
|------|------|
| MDR | Compact island on carpet (existing) |
| Hallway | Vanishing corridor, sage floor plane, door chips |
| Wellness | Warm radial chamber, plant + chair + lamp |
| Break room | Dim table + apology plaque |
| O&D | Cool studio + cart + swatches |
| Perpetuity | Dark shrine + bust (rare) |

Soft peeks (CORRIDOR / WELLNESS) on MDR only — not a minimap.

## Gameplay → looks

Presentation-only signals from [`campusLooks.js`](../../campusLooks.js) (no new habit math):

| Signal | Body attr | Effect |
|--------|-----------|--------|
| Dominant temper | `data-look-temper` | MDR island filter + CRT idle logo tint |
| Vitals pressure | `data-look-pressure` | Carpet / cam status (nominal · thin · breach) |
| Dept standing | `data-standing-{dept}` | Room lighting (cold · neutral · warm) |
| Active invitation | `data-quest-beacon` + `.quest-beacon` | Soft amber pulse on next prop/door |

## Decision log

- **2026-07-19 — Frame IA:** Replaced peer tabs with MDR header + Cold Harbor temper/vitals rails + five protocol bins so the shell matches the stills and the engine snapshot API.
- **2026-07-19 — Desk polish:** Tuned partition/carpet contrast and cam HUD labels toward office stills; diorama stays percentage-absolute art.
- **2026-07-19 — Phosphor:** Default terminal tokens nudged cyan-on-teal (MDR still); temper colors + department palettes retained.
- **2026-07-19 — Scale:** `--ui-scale` now sets `#terminal-frame` font-size; tablet band 601–1100px added.
- **2026-07-19 — Desk camera:** Flattened diorama angle (ceiling 54°→28°, walls 38°→18°, pod tip 14°→4°, softer perspective) toward elevated frontal stills; cam HUD corner brackets.
- **2026-07-19 — Landing island:** Replaced scattered 4-grid with compact MDR island (shared partition cross, quiet N/W/E, hero south CRT, more carpet negative space).
- **2026-07-19 — Desk refiners:** Pixel coworkers at all four pods (Irving N · Dylan W · Mark E · Helly S) with staggered breathe / typing / glance loops; Mark still owns wellness-gaze + invitation beacon.
