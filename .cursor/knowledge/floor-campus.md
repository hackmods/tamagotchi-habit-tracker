# Floor campus — multi-room Innie-Cam

Severed-floor **campus** around the MDR desk: URL room routing, light corridor navigation, department standing, and slow sidequests. Habit protocols remain MDR-only.

## Product locks

- **Surface:** secondary-monitor ambient first; phone is a portal into the same campus
- **Routing:** `?room=` (default `mdr`); `history.replaceState` keeps shareable URLs
- **Nav:** soft desk corridor / door peeks — not a full 3D explorer
- **Terminal:** Cold Harbor / protocol bins only while `room === 'mdr'`
- **Ambient:** still rare (45m+); filter by current room
- **Engine:** protocol-bin core in `engine.js` unchanged; campus/quests sit beside it

## Rooms

| id | Role | Terminal | Default ambient |
|----|------|----------|-----------------|
| `mdr` | Desk island + CRT (home) | yes | desk events |
| `hallway` | Endless green corridor | no | footsteps / door |
| `wellness` | Goat-room calm | no | soft tone / figure |
| `breakroom` | Compliance apology | no | apology loop cue |
| `od` | Optics & Design | no | cart / rivalry wink |
| `perpetuity` | Kier shrine (rare) | no | gated unlock |

## Modules

- [`campus.js`](../../campus.js) — room ids, parse/set URL, standing clamp, labels
- [`campusLooks.js`](../../campusLooks.js) — temper / pressure / standing bands / quest beacons → CSS
- [`sidequests.js`](../../sidequests.js) — quest catalog + progress helpers
- [`engine.js`](../../engine.js) — `stateVersion` 3: `campus`, `departments`, `sidequests`
- [`app.js`](../../app.js) — apply room, gate terminal, UTILITIES standing, quest hooks, look signals
- [`ambient.js`](../../ambient.js) — `rooms: string[]` filter on events

## State (`stateVersion` 3)

```js
campus: { room: 'mdr', corridorUnlocked: true, perpetuityUnlocked: false }
departments: { mdr: 0, od: 0, wellness: 0, breakroom: 0 } // -100..100
sidequests: { active: null | { id, step, startedAt }, completed: [], cooldowns: {} }
```

Standing moves slowly via rare ambient (B/C) and quest completion — never spam from habit taps.

## Navigation UX

1. Desk MDR: corridor peek (N) → hallway; wellness door peek (E) → wellness
2. Hallway: doors to MDR / wellness / breakroom / OD (OD may require light standing or quest)
3. Non-MDR rooms: **RETURN TO MDR** control; Escape returns when not in terminal
4. Deep link: `?room=wellness` opens that scene; invalid → `mdr`

## Voice

Clinical handbook. Prefer *floor / corridor / department / standing / invitation / apology*. Avoid RPG loot/quest log slang in UI copy (internal ids may use `sidequest`).
