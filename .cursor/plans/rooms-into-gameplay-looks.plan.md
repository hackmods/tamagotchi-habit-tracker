---
name: Rooms into gameplay looks
overview: Drive each campus room’s lighting, props, and CRT/cam chrome from existing gameplay signals — shipped.
todos:
  - id: look-signals
    content: Define CSS data-* signals from standing/quest/temper/vitals (campusLooks helper)
    status: completed
  - id: mdr-look
    content: MDR island + CRT idle preview respond to dominant temper + protocol pressure
    status: completed
  - id: room-tints
    content: Per-room lighting/prop heat for hallway, wellness, breakroom, od, perpetuity
    status: completed
  - id: quest-beacons
    content: Soft beacon on doors/props when they advance the active invitation
    status: completed
  - id: tests-sw
    content: Unit + e2e look signals; SW bump; update visual-direction
    status: completed
---

# Rooms → gameplay looks (shipped)

Presentation-only coupling via [`campusLooks.js`](../../campusLooks.js):

- `deriveCampusLooks(state, snap)` → temper, pressure, standing bands, beacon props
- `applyCampusLooks` → `data-look-*` / `data-standing-*` / `.quest-beacon`
- CSS in `styles.css` under “Gameplay → looks”
- Wired from `render()` and `enterRoom()` in `app.js`

No new habit math; ambient rarity unchanged; terminal still MDR-only.
