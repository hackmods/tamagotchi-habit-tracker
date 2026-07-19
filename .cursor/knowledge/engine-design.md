# Habit engine v2 (protocol-bin core)

Single source of truth for protocols, decay, quota awards, tempers, and the terminal snapshot. UI consumes `deriveTerminalSnapshot`; `app.js` is view + persistence only.

## Product constants (unchanged for users)

| Protocol | Bin | Target / window | Quota / CR |
|----------|-----|-----------------|------------|
| `hydrate` | 01 | 2000 ml | +25 / +5 |
| `activity` | 02 | 8000 u | +25 / +5 |
| `am-injection` | 03 | before 10:00 (advisory 07:00) | +25 / +5 |
| `pm-injection` | 04 | before 14:00 (advisory 11:00) | +25 / +5 |
| `sustenance` | 05 | 3 completions | +25 / +5 |
| Full day (all five) | — | — | +25 / +5 |

Decay: fluid ~0.85 / 4h; sustenance ~0.85 / 6h; standing decays when fluid &lt; 30 (unless freeze).

## Architecture

```
PROTOCOLS catalog → recordProtocol() / applyTick()
                 → dailyLog + metrics + awards
                 → deriveTerminalSnapshot()
                      → bins[], temperVector, dominant, nodeState, vitals
```

### Key exports

| Export | Role |
|--------|------|
| `STATE_VERSION` / `migrateState` | v1 bitflags → v2 explicit `awards` map |
| `PROTOCOLS` | Ordered bin catalog |
| `applyTick(state, elapsedMs, at)` | Decay + window penalties + freeze |
| `recordProtocol(state, id, payload, at)` | Log mutations + metric bumps |
| `evaluateQuotaAwards(state)` | Idempotent awards from `dailyLog.awards` |
| `deriveTerminalSnapshot(state, at)` | Frame UI contract |
| `rolloverDayIfNeeded(state, at)` | Day boundary + final awards |

### Snapshot bin shape

```js
{
  id, bin, label, kind, status, // done|due|overdue|pending
  progressPct, detail,
  micro: { wo, fc, dr, ma } // shortfall-weighted 0–100 cues for Cold Harbor modules
}
```

## Progress urgency (v2 upgrade)

Unfinished progress protocols:

- Before 12:00 → `due` (or `pending` only for window protocols before advisory)
- ≥ 12:00 and incomplete → stay `due` with midday pressure (temper weight ↑)
- ≥ 18:00 and incomplete → `overdue`

Window protocols keep advisory / cutoff semantics (07–10 AM, 11–14 PM).

## Tempers

Base standing formulas retained, plus **per-bin shortfall weights** so each module’s WO/FC/DR/MA micros reflect that protocol’s pressure. Dominant temper = max of vector (ties → frolic).

## Migration

- `stateVersion: 2`
- `quotasAwarded` bitfield → `dailyLog.awards: { hydrate, activity, amInjection, pmInjection, sustenance, fullDay }`
- Legacy bitfield constants kept only for migration decode
- `uiTips` defaults for install tips

## What stays vs improves

| Stays | Improves |
|-------|----------|
| Five protocols + targets | Single snapshot for UI |
| Tiny CR/XP | Honest bin % + micros |
| Freeze / incentives hooks | Tick/penalties in engine |
| Rare ambient (separate module) | Progress overdue late day |

## Decision log

- **2026-07-19:** Rewrite over wrap — split checklist/bitflags/app penalties made bin UI dishonest; engine owns tick + record + snapshot.
- **2026-07-19:** Progress protocols go `overdue` after 18:00; midday shortfall increases temper pressure for Cold Harbor micros.
