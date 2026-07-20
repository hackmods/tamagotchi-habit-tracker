# Sidequests — slow floor invitations

Hours-scale **invitations** that cross rooms. Not daily habit checklists. Cap: one active invitation; rare ambient may start or advance them.

## Design rules

- Mean gap aligned with ambient (hours), not minutes
- Rewards: standing deltas, tiny credits, cosmetics — not parallel habit XP
- Copy stays Lumon handbook (invitation / apology / cart / shrine)
- Persist under `state.sidequests`; logic in `sidequests.js`

## Starter catalog

| id | Title (UI) | Steps (summary) | Reward sketch |
|----|------------|-----------------|---------------|
| `lost-refiner` | Misplaced refiner | hallway notice → MDR tap CRT → OD cart | +OD standing, micro credits |
| `wellness-invitation` | Wellness invitation | east figure / ambient → enter wellness → sit | +wellness, soft cue |
| `breakroom-apology` | Required apology | standing dip or ambient → breakroom → hold apology | +breakroom, clear dread micro |
| `od-cart` | Design cart | hallway → OD → acknowledge cart | +OD, optional palette tease |
| `kier-shrine` | Perpetuity access | high combined standing + rare ambient → unlock perpetuity | `perpetuityUnlocked` |

## API surface (`sidequests.js`)

- `QUEST_CATALOG` — id, title, rooms, steps[], rewards
- `ensureSidequests(state)`
- `getActiveQuest(state)`
- `canStart(state, questId, now)`
- `startQuest(state, questId, now)`
- `advanceQuest(state, stepId, now)` — no-op if wrong step
- `completeQuest(state, now)` — apply rewards, cooldown
- `questHudLine(state)` — short UTILITIES / toast string

## Wiring

- Ambient events call `startQuest` / `advanceQuest` with room-aware ids
- Room enter / CRT open / apology hold call `advanceQuest`
- UTILITIES shows active invitation line + department standing
