/**
 * Campus presentation signals — derive only, no habit math.
 * Maps engine snapshot + departments + sidequests → CSS data-* / beacons.
 */

import { ensureDepartments, DEPARTMENT_IDS, combinedStanding } from './campus.js';
import { getActiveQuest } from './sidequests.js';

/** @typedef {'cold'|'neutral'|'warm'} StandingBand */
/** @typedef {'nominal'|'thin'|'breach'} LookPressure */
/** @typedef {'woe'|'frolic'|'dread'|'malice'} TemperId */

/**
 * Quest step → beacon prop id(s) for soft UI emphasis.
 * Props match `[data-beacon="…"]` in index.html.
 */
const STEP_BEACONS = Object.freeze({
  'lost-refiner:notice': ['corridor', 'door-hallway'],
  'lost-refiner:crt': ['crt'],
  'lost-refiner:od-cart': ['door-od', 'od-cart', 'od-ack'],
  'wellness-invitation:gaze': ['wellness-peek', 'mark-figure'],
  'wellness-invitation:enter': ['wellness-peek', 'door-wellness'],
  'wellness-invitation:sit': ['wellness-sit', 'wellness-action'],
  'breakroom-apology:summons': ['corridor', 'door-breakroom'],
  'breakroom-apology:enter': ['door-breakroom'],
  'breakroom-apology:hold': ['apology-hold'],
  'od-cart:hall': ['corridor', 'door-od'],
  'od-cart:enter': ['door-od'],
  'od-cart:ack': ['od-cart', 'od-ack'],
  'kier-shrine:signal': ['corridor', 'door-perpetuity'],
  'kier-shrine:unlock': ['kier-unlock', 'kier-bust'],
});

/**
 * @param {number} n
 * @returns {StandingBand}
 */
export function standingBandOf(n) {
  if (n <= -15) return 'cold';
  if (n >= 15) return 'warm';
  return 'neutral';
}

/**
 * @param {string} [nodeState]
 * @returns {LookPressure}
 */
export function pressureFromNode(nodeState) {
  if (nodeState === 'noncompliant') return 'breach';
  if (nodeState === 'depleted' || nodeState === 'underutilized') return 'thin';
  return 'nominal';
}

/**
 * @param {object} state
 * @param {{ dominant?: TemperId, nodeState?: string } | null} [snap]
 */
export function deriveCampusLooks(state, snap = null) {
  const depts = ensureDepartments(state);
  /** @type {Record<string, StandingBand>} */
  const standingBand = {};
  for (const id of DEPARTMENT_IDS) {
    standingBand[id] = standingBandOf(depts[id] || 0);
  }

  const temper = snap?.dominant || 'frolic';
  const pressure = pressureFromNode(snap?.nodeState);

  const cur = getActiveQuest(state);
  let questBeacon = null;
  /** @type {string[]} */
  let beaconProps = [];
  if (cur) {
    const key = `${cur.def.id}:${cur.active.step}`;
    beaconProps = STEP_BEACONS[key] ? [...STEP_BEACONS[key]] : [];
    const primary = beaconProps[0] || null;
    if (primary) {
      questBeacon = {
        room: cur.def.rooms?.[0] || 'mdr',
        prop: primary,
        questId: cur.def.id,
        step: cur.active.step,
      };
    }
  }

  const combined = combinedStanding(state);
  /** @type {StandingBand} */
  let combinedBand = 'neutral';
  if (combined <= -20) combinedBand = 'cold';
  else if (combined >= 40) combinedBand = 'warm';

  return {
    temper,
    pressure,
    standingBand,
    combinedBand,
    questBeacon,
    beaconProps,
  };
}

/**
 * Apply look signals to document.body and beacon targets.
 * Safe no-op when document is undefined (unit tests).
 * @param {ReturnType<typeof deriveCampusLooks>} looks
 * @param {Document} [doc]
 */
export function applyCampusLooks(looks, doc = typeof document !== 'undefined' ? document : null) {
  if (!doc?.body) return;
  const { body } = doc;
  body.dataset.lookTemper = looks.temper;
  body.dataset.lookPressure = looks.pressure;
  body.dataset.lookCombined = looks.combinedBand;
  for (const id of DEPARTMENT_IDS) {
    body.setAttribute(`data-standing-${id}`, looks.standingBand[id]);
  }

  if (looks.questBeacon) {
    body.dataset.questBeacon = looks.questBeacon.prop;
    body.dataset.questId = looks.questBeacon.questId || '';
  } else {
    delete body.dataset.questBeacon;
    delete body.dataset.questId;
  }

  doc.querySelectorAll('[data-beacon].quest-beacon').forEach((el) => {
    el.classList.remove('quest-beacon');
  });
  const set = new Set(looks.beaconProps || []);
  doc.querySelectorAll('[data-beacon]').forEach((el) => {
    const id = el.getAttribute('data-beacon');
    if (id && set.has(id)) el.classList.add('quest-beacon');
  });
}
