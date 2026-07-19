import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyElapsedTime,
  dateKeyOf,
  deriveNodeState,
  deriveTempers,
  evaluateQuotaTargets,
  isComplianceFrozen,
  recalculateRefinementTier,
} from '../../engine.js';
import { canFireAmbient, pickAmbientEvent, COOLDOWN_MS } from '../../ambient.js';

function baseState(overrides = {}) {
  return {
    subject: { subjectNumber: 4229, cumulativeQuota: 0, refinementTier: 0, prestigeMultiplier: 1 },
    fileState: { fileNumber: 1, quota: 0, milestonesHit: [] },
    metrics: {
      fluidEfficiency: 100,
      quotaProgression: 100,
      complianceStanding: 100,
      sustenanceLevel: 100,
    },
    dailyLog: {
      date: '2026-07-19',
      fluidIntakeMl: 0,
      activityUnits: 0,
      sustenanceUnits: 0,
      morningDoseAt: null,
      morningPenaltyApplied: false,
      complianceDoseAt: null,
      compliancePenaltyApplied: false,
      quotasAwarded: 0,
    },
    incentives: { complianceFreezeUntil: null },
    ambient: {
      lastEventAt: null,
      lastEventId: null,
      sessionCount: 0,
      dailyDate: '2026-07-19',
      dailyTiers: { A: 0, B: 0, C: 0 },
      bCreditsToday: 0,
    },
    ...overrides,
  };
}

test('applyElapsedTime decays fluid over four hours', () => {
  const s = baseState();
  applyElapsedTime(s, 4 * 60 * 60 * 1000);
  assert.ok(s.metrics.fluidEfficiency < 100);
  assert.ok(s.metrics.fluidEfficiency > 80);
});

test('evaluateQuotaTargets awards fluid once at 2000ml', () => {
  const log = {
    date: '2026-07-19',
    fluidIntakeMl: 2000,
    activityUnits: 0,
    sustenanceUnits: 0,
    morningDoseAt: null,
    complianceDoseAt: null,
    quotasAwarded: 0,
  };
  const first = evaluateQuotaTargets(log);
  assert.equal(first.quota, 25);
  assert.equal(first.credits, 5);
  const second = evaluateQuotaTargets(log);
  assert.equal(second.quota, 0);
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

test('deriveNodeState marks noncompliant on penalty', () => {
  const s = baseState({
    dailyLog: {
      ...baseState().dailyLog,
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
  // May still fail if document is undefined in node — canFireAmbient checks document.hidden
  // In node, document is undefined so hidden check is skipped
  assert.equal(canFireAmbient(s, now), true);
});
