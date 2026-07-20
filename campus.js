/**
 * Floor campus — rooms, URL routing, department standing.
 */

import { clamp } from './engine.js';

export const ROOM_IDS = Object.freeze([
  'mdr',
  'hallway',
  'wellness',
  'breakroom',
  'od',
  'perpetuity',
]);

export const ROOM_LABELS = Object.freeze({
  mdr: 'MDR',
  hallway: 'HALLWAY',
  wellness: 'WELLNESS',
  breakroom: 'BREAK ROOM',
  od: 'OPTICS & DESIGN',
  perpetuity: 'PERPETUITY',
});

export const DEPARTMENT_IDS = Object.freeze(['mdr', 'od', 'wellness', 'breakroom']);

export function freshCampus() {
  return {
    room: 'mdr',
    corridorUnlocked: true,
    perpetuityUnlocked: false,
  };
}

export function freshDepartments() {
  return { mdr: 0, od: 0, wellness: 0, breakroom: 0 };
}

export function ensureCampus(state) {
  if (!state.campus) state.campus = freshCampus();
  if (state.campus.corridorUnlocked === undefined) state.campus.corridorUnlocked = true;
  if (state.campus.perpetuityUnlocked === undefined) state.campus.perpetuityUnlocked = false;
  if (!ROOM_IDS.includes(state.campus.room)) state.campus.room = 'mdr';
  return state.campus;
}

export function ensureDepartments(state) {
  if (!state.departments) state.departments = freshDepartments();
  for (const id of DEPARTMENT_IDS) {
    if (typeof state.departments[id] !== 'number') state.departments[id] = 0;
    state.departments[id] = clamp(state.departments[id], -100, 100);
  }
  return state.departments;
}

export function parseRoomFromUrl(search = typeof location !== 'undefined' ? location.search : '') {
  const params = new URLSearchParams(search);
  const room = (params.get('room') || 'mdr').toLowerCase();
  return ROOM_IDS.includes(room) ? room : 'mdr';
}

/** Update ?room= without full navigation. Preserves other query params. */
export function syncRoomToUrl(room, { replace = true } = {}) {
  if (typeof history === 'undefined' || typeof location === 'undefined') return;
  const url = new URL(location.href);
  if (room === 'mdr') url.searchParams.delete('room');
  else url.searchParams.set('room', room);
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (replace) history.replaceState({ room }, '', next);
  else history.pushState({ room }, '', next);
}

export function canEnterRoom(state, room) {
  ensureCampus(state);
  if (!ROOM_IDS.includes(room)) return false;
  if (room === 'perpetuity') return !!state.campus.perpetuityUnlocked;
  return true;
}

export function adjustStanding(state, deptId, delta) {
  ensureDepartments(state);
  if (!DEPARTMENT_IDS.includes(deptId)) return 0;
  const next = clamp((state.departments[deptId] || 0) + delta, -100, 100);
  state.departments[deptId] = next;
  return next;
}

export function standingReadout(state) {
  const d = ensureDepartments(state);
  const fmt = (n) => (n >= 0 ? `+${n}` : String(n));
  return `MDR ${fmt(d.mdr)} · O&D ${fmt(d.od)} · WELL ${fmt(d.wellness)} · BR ${fmt(d.breakroom)}`;
}

export function camFeedLabel(room) {
  const label = ROOM_LABELS[room] || 'MDR';
  return `INNIE-CAM · FLOOR 7 · ${label}`;
}

/** Combined standing used for rare perpetuity gate. */
export function combinedStanding(state) {
  const d = ensureDepartments(state);
  return DEPARTMENT_IDS.reduce((s, id) => s + (d[id] || 0), 0);
}
