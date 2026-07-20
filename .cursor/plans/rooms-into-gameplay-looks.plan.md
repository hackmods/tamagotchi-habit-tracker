---
name: Rooms into gameplay looks
overview: Drive each campus room’s lighting, props, and CRT/cam chrome from existing gameplay signals (department standing, active invitation, tempers, vitals) — no new habit math, hours-scale only.
todos:
  - id: look-signals
    content: Define CSS data-* signals from standing/quest/temper/vitals (campusLooks helper)
  - id: mdr-look
    content: MDR island + CRT idle preview respond to dominant temper + protocol pressure
  - id: room-tints
    content: Per-room lighting/prop heat for hallway, wellness, breakroom, od, perpetuity
  - id: quest-beacons
    content: Soft beacon on doors/props when they advance the active invitation
  - id: tests-sw
    content: Unit + e2e look signals; SW bump; update visual-direction
---

# Rooms → gameplay looks

Tie **already-shipped** campus rooms to **gameplay state** so the floor *reads* progress without becoming a second habit UI.

## Locked constraints

- No parallel XP/quota math in `app.js` — only derive presentation from `engine` snapshot + `departments` + `sidequests`
- Ambient rarity unchanged; looks are mostly continuous CSS, not new event spam
- Terminal remains MDR-only; non-MDR rooms get environmental feedback only
- Lumon voice — “standing / invitation / temper pressure,” not RPG quest markers

## Signal model

Add thin helper [`campusLooks.js`](../../campusLooks.js) (or functions in `campus.js`):

```js
// outputs for document.body / .scene-stage
{
  temper: 'frolic'|'woe'|'dread'|'malice',
  pressure: 'nominal'|'thin'|'breach',      // from vitals / nodeState
  standingBand: { mdr, od, wellness, breakroom }, // 'cold'|'neutral'|'warm'
  questBeacon: null | { room, prop },       // door/prop to emphasize
}
```

Wire once from `render()` / `enterRoom()` → `document.body.dataset.lookTemper`, `data-look-pressure`, `data-standing-od`, etc.

## Per-room visual mapping

| Room | Gameplay → look |
|------|-----------------|
| **MDR** | Dominant temper shifts CRT idle digit feel + partition warmth; low fluid cools carpet saturation; active invitation soft-pulses corridor/wellness peeks |
| **Hallway** | High O&D standing brightens east wall; breakroom standing dips cool the end door; quest step lights the matching `.room-door` |
| **Wellness** | Wellness standing + Frolic → warmer lamp; Woe/Dread → cooler chamber; sit target beacon when quest step is `sit` |
| **Breakroom** | Low compliance / Malice → plaque emphasis + dimmer floor; apology button beacon on `hold` |
| **O&D** | O&D standing → swatch saturation; cart beacon on `ack` / `od-cart` |
| **Perpetuity** | Only when unlocked; combined standing warm-gold bust; `unlock` step beacon |

## Implementation slices

1. **Signals** — pure helper + unit tests; apply `data-*` in `app.js` render
2. **MDR** — CSS under `body[data-look-temper=…]` / pressure (minimal, reuse temper tokens)
3. **Room tints** — CSS filters/gradients per `data-room` × standing band (subtle)
4. **Quest beacons** — `.quest-beacon` class on `#nav-corridor`, doors, `#od-cart`, etc.
5. **Polish** — e2e asserts `data-look-*` after seeded state; SW bump; docs in `visual-direction.md`

## Out of scope

- New rooms or quest catalog expansion
- Changing standing formulas or ambient cooldowns
- Animated “quest log” UI chrome
