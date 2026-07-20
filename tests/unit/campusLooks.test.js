import assert from 'node:assert/strict';
import test from 'node:test';
import {
  standingBandOf,
  pressureFromNode,
  deriveCampusLooks,
  applyCampusLooks,
} from '../../campusLooks.js';
import { freshCampus, freshDepartments } from '../../campus.js';
import { freshSidequests, startQuest } from '../../sidequests.js';
import { freshDailyLog } from '../../engine.js';

function baseState(overrides = {}) {
  return {
    subject: { subjectNumber: 4229, allocationCredits: 0 },
    metrics: {
      fluidEfficiency: 100,
      quotaProgression: 100,
      complianceStanding: 100,
      sustenanceLevel: 100,
    },
    dailyLog: freshDailyLog('2026-07-19'),
    campus: freshCampus(),
    departments: freshDepartments(),
    sidequests: freshSidequests(),
    ...overrides,
  };
}

function makeClassList() {
  const set = new Set();
  return {
    add(c) { set.add(c); },
    remove(c) { set.delete(c); },
    contains(c) { return set.has(c); },
  };
}

test('standingBandOf thresholds', () => {
  assert.equal(standingBandOf(-20), 'cold');
  assert.equal(standingBandOf(0), 'neutral');
  assert.equal(standingBandOf(20), 'warm');
});

test('pressureFromNode maps engine node states', () => {
  assert.equal(pressureFromNode('baseline'), 'nominal');
  assert.equal(pressureFromNode('optimal'), 'nominal');
  assert.equal(pressureFromNode('depleted'), 'thin');
  assert.equal(pressureFromNode('underutilized'), 'thin');
  assert.equal(pressureFromNode('noncompliant'), 'breach');
});

test('deriveCampusLooks standing bands and temper', () => {
  const s = baseState({
    departments: { mdr: 0, od: 22, wellness: -18, breakroom: 5 },
  });
  const looks = deriveCampusLooks(s, { dominant: 'dread', nodeState: 'depleted' });
  assert.equal(looks.temper, 'dread');
  assert.equal(looks.pressure, 'thin');
  assert.equal(looks.standingBand.od, 'warm');
  assert.equal(looks.standingBand.wellness, 'cold');
  assert.equal(looks.standingBand.breakroom, 'neutral');
  assert.equal(looks.questBeacon, null);
});

test('deriveCampusLooks quest beacon props', () => {
  const s = baseState();
  const now = new Date('2026-07-19T12:00:00Z');
  assert.equal(startQuest(s, 'wellness-invitation', now), true);
  const looks = deriveCampusLooks(s, { dominant: 'frolic', nodeState: 'baseline' });
  assert.ok(looks.questBeacon);
  assert.equal(looks.questBeacon.step, 'gaze');
  assert.ok(looks.beaconProps.includes('wellness-peek'));
  assert.ok(looks.beaconProps.includes('mark-figure'));
});

test('applyCampusLooks sets body data attributes and beacon class', () => {
  const attrs = {};
  const body = {
    dataset: {},
    setAttribute(k, v) { attrs[k] = v; },
  };
  const peeks = [
    { getAttribute: () => 'wellness-peek', classList: makeClassList() },
    { getAttribute: () => 'corridor', classList: makeClassList() },
  ];
  const doc = {
    body,
    querySelectorAll(sel) {
      if (sel === '[data-beacon].quest-beacon') {
        return peeks.filter((p) => p.classList.contains('quest-beacon'));
      }
      if (sel === '[data-beacon]') return peeks;
      return [];
    },
  };

  const s = baseState({ departments: { mdr: 0, od: 20, wellness: 0, breakroom: 0 } });
  startQuest(s, 'wellness-invitation', new Date());
  const looks = deriveCampusLooks(s, { dominant: 'woe', nodeState: 'noncompliant' });
  applyCampusLooks(looks, doc);

  assert.equal(body.dataset.lookTemper, 'woe');
  assert.equal(body.dataset.lookPressure, 'breach');
  assert.equal(attrs['data-standing-od'], 'warm');
  assert.ok(peeks[0].classList.contains('quest-beacon'));
  assert.equal(peeks[1].classList.contains('quest-beacon'), false);
});
