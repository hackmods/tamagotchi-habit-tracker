import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STATE_VERSION,
  applyElapsedTime,
  applyTick,
  applyWindowPenalties,
  dateKeyOf,
  deriveNodeState,
  deriveProtocolChecklist,
  deriveTempers,
  deriveTerminalSnapshot,
  dominantTemper,
  evaluateQuotaAwards,
  evaluateQuotaTargets,
  freshDailyLog,
  isComplianceFrozen,
  migrateState,
  protocolChecklistSummary,
  recalculateRefinementTier,
  recordProtocol,
  rolloverDayIfNeeded,
  QUOTA_FLAGS,
} from '../../engine.js';
import { canFireAmbient, pickAmbientEvent, COOLDOWN_MS } from '../../ambient.js';

function baseState(overrides = {}) {
  return {
    stateVersion: STATE_VERSION,
    subject: { subjectNumber: 4229, cumulativeQuota: 0, refinementTier: 0, prestigeMultiplier: 1 },
    fileState: { fileNumber: 1, quota: 0, milestonesHit: [] },
    metrics: {
      fluidEfficiency: 100,
      quotaProgression: 100,
      complianceStanding: 100,
      sustenanceLevel: 100,
    },
    dailyLog: freshDailyLog('2026-07-19'),
    incentives: { complianceFreezeUntil: null },
    ambient: {
      lastEventAt: null,
      lastEventId: null,
      sessionCount: 0,
      dailyDate: '2026-07-19',
      dailyTiers: { A: 0, B: 0, C: 0 },
      bCreditsToday: 0,
    },
    uiTips: { a2hsDismissed: false, kioskTipDismissed: false },
    ...overrides,
  };
}

test('applyElapsedTime decays fluid over four hours', () => {
  const s = baseState();
  applyElapsedTime(s, 4 * 60 * 60 * 1000);
  assert.ok(s.metrics.fluidEfficiency < 100);
  assert.ok(s.metrics.fluidEfficiency > 80);
});

test('applyElapsedTime can freeze sustenance while fluid decays', () => {
  const s = baseState();
  applyElapsedTime(s, 4 * 60 * 60 * 1000, new Date(), { sustenanceMs: 0 });
  assert.ok(s.metrics.fluidEfficiency < 100);
  assert.equal(s.metrics.sustenanceLevel, 100);
});

test('evaluateQuotaAwards awards fluid once at 2000ml', () => {
  const s = baseState({
    dailyLog: {
      ...freshDailyLog('2026-07-19'),
      fluidIntakeMl: 2000,
    },
  });
  const first = evaluateQuotaAwards(s);
  assert.equal(first.quota, 25);
  assert.equal(first.credits, 5);
  assert.equal(s.dailyLog.awards.hydrate, true);
  const second = evaluateQuotaAwards(s);
  assert.equal(second.quota, 0);
});

test('evaluateQuotaTargets legacy wrapper still works', () => {
  const log = { ...freshDailyLog('2026-07-19'), fluidIntakeMl: 2000 };
  const first = evaluateQuotaTargets(log);
  assert.equal(first.quota, 25);
});

test('migrateState converts bitflags to awards', () => {
  const raw = {
    subject: { subjectNumber: 1 },
    dailyLog: {
      date: '2026-07-19',
      fluidIntakeMl: 2000,
      quotasAwarded: QUOTA_FLAGS.FLUID | QUOTA_FLAGS.ACTIVITY,
    },
    metrics: {},
  };
  const defaults = baseState();
  const m = migrateState(raw, defaults);
  assert.equal(m.stateVersion, STATE_VERSION);
  assert.equal(m.dailyLog.awards.hydrate, true);
  assert.equal(m.dailyLog.awards.activity, true);
  assert.equal(m.dailyLog.awards.sustenance, false);
  assert.equal(m.uiTips.a2hsDismissed, false);
});

test('deriveTempers elevates dread when fluid and sustenance are low', () => {
  const s = baseState({
    metrics: {
      fluidEfficiency: 10,
      quotaProgression: 50,
      complianceStanding: 80,
      sustenanceLevel: 10,
    },
  });
  const t = deriveTempers(s);
  assert.ok(t.dread > t.frolic);
});

test('dominantTemper prefers highest; frolic on tie bias via sort', () => {
  assert.equal(dominantTemper({ woe: 10, frolic: 90, dread: 10, malice: 10 }), 'frolic');
  assert.equal(dominantTemper({ woe: 80, frolic: 10, dread: 10, malice: 10 }), 'woe');
});

test('deriveNodeState marks noncompliant on penalty', () => {
  const s = baseState({
    dailyLog: {
      ...freshDailyLog('2026-07-19'),
      morningPenaltyApplied: true,
    },
  });
  assert.equal(deriveNodeState(s), 'noncompliant');
});

test('recalculateRefinementTier advances at thresholds', () => {
  const s = baseState({ subject: { cumulativeQuota: 300, refinementTier: 0 } });
  assert.equal(recalculateRefinementTier(s), true);
  assert.equal(s.subject.refinementTier, 2);
});

test('isComplianceFrozen respects future timestamp', () => {
  const until = new Date(Date.now() + 60_000).toISOString();
  assert.equal(isComplianceFrozen({ incentives: { complianceFreezeUntil: until } }), true);
  assert.equal(isComplianceFrozen({ incentives: { complianceFreezeUntil: null } }), false);
});

test('applyWindowPenalties applies AM miss once', () => {
  const s = baseState();
  const at = new Date('2026-07-19T11:00:00');
  const logs = applyWindowPenalties(s, at);
  assert.ok(logs.some((l) => /AM INJECTION MISSED/.test(l)));
  assert.equal(s.dailyLog.morningPenaltyApplied, true);
  assert.equal(s.metrics.complianceStanding, 90);
  const again = applyWindowPenalties(s, at);
  assert.equal(again.filter((l) => /AM INJECTION MISSED/.test(l)).length, 0);
});

test('applyTick combines decay and penalties', () => {
  const s = baseState();
  const { logs } = applyTick(s, 4 * 60 * 60 * 1000, new Date('2026-07-19T11:00:00'));
  assert.ok(s.metrics.fluidEfficiency < 100);
  assert.ok(logs.length >= 1);
});

test('recordProtocol hydrate + idempotent awards', () => {
  const s = baseState();
  const r1 = recordProtocol(s, 'hydrate', { amount: 2000 }, new Date('2026-07-19T09:00:00'));
  assert.equal(r1.ok, true);
  assert.equal(r1.awards.quota, 25);
  const r2 = recordProtocol(s, 'hydrate', { amount: 100 }, new Date('2026-07-19T09:00:00'));
  assert.equal(r2.ok, true);
  assert.equal(r2.awards.quota, 0);
});

test('recordProtocol rejects duplicate AM injection', () => {
  const s = baseState();
  const at = new Date('2026-07-19T08:00:00');
  assert.equal(recordProtocol(s, 'am-injection', {}, at).ok, true);
  assert.equal(recordProtocol(s, 'am-injection', {}, at).ok, false);
});

test('deriveTerminalSnapshot exposes bins 01-05 and dominant', () => {
  const s = baseState();
  const snap = deriveTerminalSnapshot(s, new Date('2026-07-19T08:30:00'));
  assert.equal(snap.bins.length, 5);
  assert.equal(snap.bins[0].bin, '01');
  assert.equal(snap.bins[2].status, 'due');
  assert.ok(snap.dominant);
  assert.ok(snap.checklistSummary.includes('PLEASE COMPLY'));
  assert.ok(snap.bins[0].micro.dr >= 0);
});

test('progress protocols become overdue after 18:00', () => {
  const s = baseState();
  const snap = deriveTerminalSnapshot(s, new Date('2026-07-19T19:00:00'));
  assert.equal(snap.bins.find((b) => b.id === 'hydrate').status, 'overdue');
  assert.equal(snap.bins.find((b) => b.id === 'activity').status, 'overdue');
});

test('rolloverDayIfNeeded awards then resets log', () => {
  const s = baseState({
    dailyLog: {
      ...freshDailyLog('2026-07-18'),
      fluidIntakeMl: 2000,
      awards: { ...freshDailyLog().awards },
    },
  });
  const result = rolloverDayIfNeeded(s, new Date('2026-07-19T01:00:00'));
  assert.equal(result.rolled, true);
  assert.equal(result.awards.quota, 25);
  assert.equal(s.dailyLog.date, '2026-07-19');
  assert.equal(s.dailyLog.fluidIntakeMl, 0);
});

test('pickAmbientEvent returns tier-filtered catalog entry', () => {
  const s = baseState();
  const ev = pickAmbientEvent(s, new Date('2026-07-19T12:00:00'), () => 0.01, 'A');
  assert.ok(ev);
  assert.equal(ev.tier, 'A');
});

test('canFireAmbient enforces cooldown', () => {
  const now = new Date('2026-07-19T12:00:00');
  const s = baseState({
    ambient: {
      lastEventAt: new Date(now.getTime() - 1000).toISOString(),
      lastEventId: 'intercom',
      sessionCount: 0,
      dailyDate: dateKeyOf(now),
      dailyTiers: { A: 0, B: 0, C: 0 },
      bCreditsToday: 0,
    },
  });
  assert.equal(canFireAmbient(s, now), false);
  s.ambient.lastEventAt = new Date(now.getTime() - COOLDOWN_MS - 1000).toISOString();
  assert.equal(canFireAmbient(s, now), true);
});

test('deriveProtocolChecklist marks AM overdue after cutoff', () => {
  const log = baseState().dailyLog;
  const items = deriveProtocolChecklist(log, new Date('2026-07-19T11:00:00'));
  const am = items.find((i) => i.id === 'am-injection');
  assert.equal(am.status, 'overdue');
  const fluid = items.find((i) => i.id === 'hydrate');
  assert.equal(fluid.status, 'due');
});

test('deriveProtocolChecklist marks all done when quotas met', () => {
  const log = {
    ...freshDailyLog('2026-07-19'),
    fluidIntakeMl: 2000,
    activityUnits: 8000,
    sustenanceUnits: 3,
    morningDoseAt: '2026-07-19T08:00:00.000Z',
    complianceDoseAt: '2026-07-19T12:00:00.000Z',
  };
  const items = deriveProtocolChecklist(log, new Date('2026-07-19T15:00:00'));
  assert.ok(items.every((i) => i.status === 'done'));
  assert.match(protocolChecklistSummary(items), /BOARD ACKNOWLEDGES/);
});

test('deriveProtocolChecklist marks AM due inside advisory window', () => {
  const items = deriveProtocolChecklist(baseState().dailyLog, new Date('2026-07-19T08:30:00'));
  assert.equal(items.find((i) => i.id === 'am-injection').status, 'due');
  assert.equal(items.find((i) => i.id === 'pm-injection').status, 'pending');
});
