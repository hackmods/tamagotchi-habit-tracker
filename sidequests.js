/**
 * Slow floor invitations (sidequests). Hours-scale; one active at a time.
 */

import { adjustStanding, ensureCampus, combinedStanding } from './campus.js';
import { clamp } from './engine.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** @typedef {{ id: string, title: string, steps: string[], rooms: string[], rewards: object }} QuestDef */

/** @type {QuestDef[]} */
export const QUEST_CATALOG = [
  {
    id: 'lost-refiner',
    title: 'MISPLACED REFINER',
    steps: ['notice', 'crt', 'od-cart'],
    rooms: ['hallway', 'mdr', 'od'],
    rewards: { od: 8, credits: 2 },
  },
  {
    id: 'wellness-invitation',
    title: 'WELLNESS INVITATION',
    steps: ['gaze', 'enter', 'sit'],
    rooms: ['mdr', 'wellness'],
    rewards: { wellness: 10, credits: 1 },
  },
  {
    id: 'breakroom-apology',
    title: 'REQUIRED APOLOGY',
    steps: ['summons', 'enter', 'hold'],
    rooms: ['mdr', 'breakroom'],
    rewards: { breakroom: 12, credits: 1 },
  },
  {
    id: 'od-cart',
    title: 'DESIGN CART',
    steps: ['hall', 'enter', 'ack'],
    rooms: ['hallway', 'od'],
    rewards: { od: 6, credits: 1 },
  },
  {
    id: 'kier-shrine',
    title: 'PERPETUITY ACCESS',
    steps: ['signal', 'unlock'],
    rooms: ['hallway', 'perpetuity'],
    rewards: { perpetuity: true, mdr: 5 },
  },
];

const byId = Object.fromEntries(QUEST_CATALOG.map((q) => [q.id, q]));

export function freshSidequests() {
  return { active: null, completed: [], cooldowns: {} };
}

export function ensureSidequests(state) {
  if (!state.sidequests) state.sidequests = freshSidequests();
  if (!Array.isArray(state.sidequests.completed)) state.sidequests.completed = [];
  if (!state.sidequests.cooldowns || typeof state.sidequests.cooldowns !== 'object') {
    state.sidequests.cooldowns = {};
  }
  return state.sidequests;
}

export function getQuest(questId) {
  return byId[questId] || null;
}

export function getActiveQuest(state) {
  const sq = ensureSidequests(state);
  if (!sq.active?.id) return null;
  const def = getQuest(sq.active.id);
  if (!def) {
    sq.active = null;
    return null;
  }
  return { def, active: sq.active };
}

export function canStart(state, questId, now = new Date()) {
  ensureSidequests(state);
  const def = getQuest(questId);
  if (!def) return false;
  if (state.sidequests.active) return false;
  const cd = state.sidequests.cooldowns[questId];
  if (cd && new Date(cd) > now) return false;
  if (questId === 'kier-shrine') {
    ensureCampus(state);
    if (state.campus.perpetuityUnlocked) return false;
    if (combinedStanding(state) < 40) return false;
  }
  return true;
}

export function startQuest(state, questId, now = new Date()) {
  if (!canStart(state, questId, now)) return false;
  const def = getQuest(questId);
  state.sidequests.active = {
    id: questId,
    step: def.steps[0],
    startedAt: now.toISOString(),
  };
  return true;
}

/**
 * Advance active quest when stepId matches current step.
 * Completes automatically on last step.
 */
export function advanceQuest(state, stepId, now = new Date()) {
  const cur = getActiveQuest(state);
  if (!cur) return { advanced: false, completed: false };
  if (cur.active.step !== stepId) return { advanced: false, completed: false };

  const idx = cur.def.steps.indexOf(stepId);
  if (idx < 0) return { advanced: false, completed: false };

  if (idx >= cur.def.steps.length - 1) {
    return completeQuest(state, now);
  }

  cur.active.step = cur.def.steps[idx + 1];
  return { advanced: true, completed: false, questId: cur.def.id, step: cur.active.step };
}

export function completeQuest(state, now = new Date()) {
  const cur = getActiveQuest(state);
  if (!cur) return { advanced: false, completed: false };

  const { def } = cur;
  const rewards = def.rewards || {};
  if (rewards.od) adjustStanding(state, 'od', rewards.od);
  if (rewards.wellness) adjustStanding(state, 'wellness', rewards.wellness);
  if (rewards.breakroom) adjustStanding(state, 'breakroom', rewards.breakroom);
  if (rewards.mdr) adjustStanding(state, 'mdr', rewards.mdr);
  if (rewards.credits) {
    state.subject.allocationCredits = (state.subject.allocationCredits || 0) + rewards.credits;
  }
  if (rewards.perpetuity) {
    ensureCampus(state);
    state.campus.perpetuityUnlocked = true;
  }

  if (!state.sidequests.completed.includes(def.id)) {
    state.sidequests.completed.push(def.id);
  }
  state.sidequests.cooldowns[def.id] = new Date(now.getTime() + DAY_MS).toISOString();
  state.sidequests.active = null;

  return { advanced: true, completed: true, questId: def.id, title: def.title };
}

export function questHudLine(state) {
  const cur = getActiveQuest(state);
  if (!cur) return 'INVITATION: NONE';
  const stepIdx = cur.def.steps.indexOf(cur.active.step) + 1;
  return `INVITATION: ${cur.def.title} · STEP ${stepIdx}/${cur.def.steps.length}`;
}

/** Tiny standing nudge from rare ambient (capped). */
export function ambientStandingNudge(state, deptId, amount = 2) {
  return adjustStanding(state, deptId, clamp(amount, -5, 5));
}
