import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STATE_VERSION,
  migrateState,
  freshDailyLog,
} from '../../engine.js';
import {
  parseRoomFromUrl,
  canEnterRoom,
  adjustStanding,
  standingReadout,
  ensureCampus,
  ensureDepartments,
  freshCampus,
  freshDepartments,
} from '../../campus.js';
import {
  canStart,
  startQuest,
  advanceQuest,
  questHudLine,
  ensureSidequests,
  freshSidequests,
} from '../../sidequests.js';
import { pickAmbientEvent } from '../../ambient.js';

function baseState(overrides = {}) {
  return {
    stateVersion: STATE_VERSION,
    subject: { subjectNumber: 4229, cumulativeQuota: 0, allocationCredits: 0, refinementTier: 0, prestigeMultiplier: 1 },
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
    campus: freshCampus(),
    departments: freshDepartments(),
    sidequests: freshSidequests(),
    ...overrides,
  };
}

test('migrateState upgrades to v3 campus fields', () => {
  const raw = {
    stateVersion: 2,
    subject: { subjectNumber: 1 },
    fileState: { fileNumber: 1, quota: 0, milestonesHit: [] },
    metrics: { fluidEfficiency: 90, quotaProgression: 90, complianceStanding: 90, sustenanceLevel: 90 },
    dailyLog: freshDailyLog('2026-07-19'),
    incentives: {},
    ambient: {},
  };
  const s = migrateState(raw, baseState());
  assert.equal(s.stateVersion, 3);
  assert.ok(s.campus);
  assert.equal(s.campus.room, 'mdr');
  assert.ok(s.departments);
  assert.equal(s.departments.od, 0);
  assert.ok(s.sidequests);
});

test('parseRoomFromUrl defaults and validates', () => {
  assert.equal(parseRoomFromUrl(''), 'mdr');
  assert.equal(parseRoomFromUrl('?room=hallway'), 'hallway');
  assert.equal(parseRoomFromUrl('?room=nope'), 'mdr');
});

test('perpetuity requires unlock', () => {
  const s = baseState();
  assert.equal(canEnterRoom(s, 'perpetuity'), false);
  s.campus.perpetuityUnlocked = true;
  assert.equal(canEnterRoom(s, 'perpetuity'), true);
});

test('adjustStanding clamps and readout formats', () => {
  const s = baseState();
  adjustStanding(s, 'od', 12);
  adjustStanding(s, 'wellness', -3);
  assert.equal(s.departments.od, 12);
  assert.equal(s.departments.wellness, -3);
  assert.match(standingReadout(s), /O&D \+12/);
  assert.match(standingReadout(s), /WELL -3/);
});

test('sidequest start advance complete', () => {
  const s = baseState();
  const now = new Date('2026-07-19T12:00:00Z');
  assert.equal(canStart(s, 'lost-refiner', now), true);
  assert.equal(startQuest(s, 'lost-refiner', now), true);
  assert.match(questHudLine(s), /MISPLACED REFINER/);
  assert.equal(advanceQuest(s, 'notice', now).advanced, true);
  assert.equal(s.sidequests.active.step, 'crt');
  assert.equal(advanceQuest(s, 'crt', now).advanced, true);
  const done = advanceQuest(s, 'od-cart', now);
  assert.equal(done.completed, true);
  assert.equal(s.sidequests.active, null);
  assert.ok(s.departments.od >= 8);
  assert.ok(s.subject.allocationCredits >= 2);
});

test('pickAmbientEvent respects room filter', () => {
  const s = baseState({ campus: { ...freshCampus(), room: 'hallway' } });
  ensureCampus(s);
  ensureDepartments(s);
  ensureSidequests(s);
  const now = new Date('2026-07-19T12:00:00Z');
  const rng = () => 0.01;
  const ev = pickAmbientEvent(s, now, rng, 'A');
  assert.ok(ev);
  assert.ok(ev.rooms.includes('hallway'));
});
