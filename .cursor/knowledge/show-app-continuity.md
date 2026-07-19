# Show ↔ App Continuity Map

How *Severance* maps onto **Lumon Wellness Compliance Terminal / Innie-Cam**. Keep these links stable when adding features.

## Core metaphor

| Show | App |
|------|-----|
| Innie at MDR | Desk **Innie-Cam** feed (passive ambient) |
| Outie body / real-world care | Habit protocols logged in the **CRT terminal** |
| Severance barrier | Desk ↔ terminal zoom (ESC returns to “floor”) |
| Mysterious important work | Daily quotas feel like **file refinement**, not a todo list |

Outie actions (water, movement, doses, meals) are *translated* into innie metrics (Fluid Efficiency, Quota Progression, Compliance Standing, Sustenance).

## UI surfaces

| Show element | App implementation |
|--------------|-------------------|
| MDR open-plan office | Pseudo-3D diorama: sage carpet, ceiling light grid, 4-pod desks |
| Mark’s workstation cluster | Pod cross (N/W/E/S); interactive CRT on south pod |
| Refinement terminal | `#terminal-frame` inside CRT glass (`DATA_MATRIX` etc.) |
| Floating scary numbers | `.mdr-num` drift field + idle CRT preview digits |
| Four Tempers bins | Quadrants WO/FC/DR/MA + temper bars |
| Security / hallway cam | Cam HUD: `REC · INNIE-CAM · FLOOR 7 · MDR` |
| Intercom / PA | Ambient toast + lasting `#cam-chyron` |
| Break Room dread | Palette `breakroom`; rare compliance drill / diversion events |
| Wellness session | East-pod figure gaze; `wellness` palette |
| O&D / design culture | Procurement palettes & node geometries |

## Progression & perks

| Show | App |
|------|-----|
| File % / refinement progress | `fileState.quota` → avatar stage + milestones |
| Music Dance Experience | Milestone ~75% → fullscreen MDE; ambient may *tease* only |
| Waffle Party | 100% file → waffle overlay + prestige ×1.5 |
| Finger trap | Milestone unlock + UTILITIES widget |
| Helly’s eraser | Desk tumble + rare contraband recover (+tiny CR) |
| Melon bar / coffee / egg | Incentives catalog (palette / skin / decay freeze) |
| Refiner of the Quarter | Laser crystal trophy cosmetic |

## Metrics ↔ Tempers

| Metric pressure | Temper lean |
|-----------------|-------------|
| Low fluid / low sustenance | Dread, Woe |
| Missed AM/PM injection | Woe, Malice |
| Strong all-around metrics | Frolic |
| Compliance breach / penalties | Malice / noncompliant node |

Digit field should **feel** the dominant temper (speed, clustering, jitter) — see `data-dominant` on `#mdr-data-node` and desk CRT preview.

## Ambient events (continuity)

| Event id | Show tieback | App effect |
|----------|--------------|------------|
| `ballast-failure` | MDR ceiling grid | Panel strobe + REC glitch |
| `eraser-pass` / `contraband-recovered` | Helly eraser | Path emphasize / tap for tiny CR |
| `pod-visitor` | Cross-department traffic | Silhouette crosses north pod |
| `intercom` | Corporate PA | “Please return to your workstation” |
| `wellness-gaze` | Wellness / Mark | Figure looks at camera |
| `numbers-huddle` | Scary numbers | Digit cluster animation |
| `night-shift` | After-hours floor | Cooler lighting after 22:00 |
| `compliance-drill` | Handbook / Board | Short decay freeze |
| `mde-tease` | MDE perk | Mini halo, no full party |
| `breakroom-diversion` | Break Room / wellness | Short sustenance pause |

Rarity contract: hours-scale, desk-primary, never replace milestone MDE/Waffle as ambient spam.

## Copy continuity

Prefer these app strings (or close variants):

- Subject designation: `SUBJECT #NNNN`
- Cam status: `STATUS: NOMINAL | OPTIMAL | DEPLETION | BREACH | UNDERUTILIZED`
- Node: `NODE: BASELINE | OPTIMAL THROUGHPUT | …`
- Protocols: `HYDRATE_UNIT`, `LOG_ACTIVITY`, `AM_INJECTION`, `PM_INJECTION`, `SUSTENANCE`
- RESOURCING checklist: `DONE` / `DUE` / `OVERDUE` / `PENDING` + “Please comply”
- Return: `[ESC // RETURN TO DESK]`

When adding UI, check this file first so new features inherit the same metaphor instead of introducing a second product vocabulary.
