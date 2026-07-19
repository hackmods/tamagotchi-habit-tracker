/**
 * Rare desk ambient events (Severance-tied).
 * Rarity: 0–2 / long session, mean gap 90–180m, hard cooldown ≥45m.
 * Tiers: A cosmetic · B micro-reward · C meaningful gameplay.
 */

import { clamp, dateKeyOf, departmentalSeed } from './engine.js';

export const COOLDOWN_MS = 45 * 60 * 1000;
export const MEAN_GAP_MS = 135 * 60 * 1000;
export const GAP_JITTER_MS = 45 * 60 * 1000;
export const MAX_SESSION_EVENTS = 2;
export const DAILY_CAP = { A: 4, B: 2, C: 1 };

const REDUCED_MOTION =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** @typedef {'A'|'B'|'C'} Tier */

/**
 * @typedef {object} AmbientEvent
 * @property {string} id
 * @property {Tier} tier
 * @property {number} weight
 * @property {(ctx: AmbientContext) => void} run
 */

/**
 * @typedef {object} AmbientContext
 * @property {object} state
 * @property {() => void} saveState
 * @property {(text: string) => void} pushLog
 * @property {() => void} render
 * @property {() => Date} now
 * @property {(msg: string, opts?: {tone?: string}) => void} showToast
 * @property {(cls: string, ms?: number) => void} pulseScene
 */

function ensureAmbientState(state, now) {
  const today = dateKeyOf(now);
  if (!state.ambient) {
    state.ambient = {
      lastEventAt: null,
      lastEventId: null,
      sessionCount: 0,
      dailyDate: today,
      dailyTiers: { A: 0, B: 0, C: 0 },
      bCreditsToday: 0,
    };
  }
  if (state.ambient.dailyDate !== today) {
    state.ambient.dailyDate = today;
    state.ambient.dailyTiers = { A: 0, B: 0, C: 0 };
    state.ambient.bCreditsToday = 0;
    state.ambient.sessionCount = 0;
  }
  return state.ambient;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function awardCredits(ctx, amount, reason) {
  const amb = ensureAmbientState(ctx.state, ctx.now());
  if (amb.bCreditsToday + amount > 6) amount = Math.max(0, 6 - amb.bCreditsToday);
  if (amount <= 0) return 0;
  ctx.state.subject.allocationCredits += amount;
  amb.bCreditsToday += amount;
  ctx.pushLog(`${reason} (+${amount} CR)`);
  return amount;
}

function awardXp(ctx, amount, reason) {
  if (amount <= 0) return;
  const boosted = Math.round(amount * (ctx.state.subject.prestigeMultiplier || 1));
  ctx.state.subject.cumulativeQuota += boosted;
  ctx.state.fileState.quota += boosted;
  ctx.pushLog(`${reason} (+${boosted} XP)`);
}

/** @type {AmbientEvent[]} */
export const AMBIENT_EVENTS = [
  {
    id: 'ballast-failure',
    tier: 'A',
    weight: 12,
    run(ctx) {
      ctx.pulseScene('ambient-ballast', 10000);
      ctx.showToast('CEILING BALLAST FAULT — FLOOR 7 MDR', { tone: 'warn' });
      ctx.pushLog('AMBIENT: BALLAST FAILURE');
    },
  },
  {
    id: 'eraser-pass',
    tier: 'A',
    weight: 10,
    run(ctx) {
      ctx.pulseScene('ambient-eraser-pass', 8000);
      ctx.pushLog('AMBIENT: ERASER PATH OBSERVED');
    },
  },
  {
    id: 'pod-visitor',
    tier: 'A',
    weight: 10,
    run(ctx) {
      ctx.pulseScene('ambient-visitor', 9000);
      ctx.showToast('UNIDENTIFIED REFINER CROSSING — NORTH POD', { tone: 'dim' });
      ctx.pushLog('AMBIENT: EMPTY POD VISITOR');
    },
  },
  {
    id: 'wellness-gaze',
    tier: 'A',
    weight: 8,
    run(ctx) {
      ctx.pulseScene('ambient-gaze', 6000);
      ctx.pushLog('AMBIENT: WELLNESS GAZE');
    },
  },
  {
    id: 'intercom',
    tier: 'A',
    weight: 9,
    run(ctx) {
      ctx.showToast('PLEASE RETURN TO YOUR WORKSTATION', { tone: 'amber', sticky: true });
      ctx.pushLog('AMBIENT: INTERCOM CHYRON');
    },
  },
  {
    id: 'numbers-huddle',
    tier: 'A',
    weight: 8,
    run(ctx) {
      ctx.pulseScene('ambient-numbers', 7000);
      ctx.pushLog('AMBIENT: NUMBERS HUDDLE');
    },
  },
  {
    id: 'night-shift',
    tier: 'A',
    weight: 6,
    run(ctx) {
      const h = ctx.now().getHours();
      if (h < 22 && h >= 6) {
        ctx.showToast('NIGHT-SHIFT PROTOCOL STANDBY', { tone: 'dim' });
        return;
      }
      ctx.pulseScene('ambient-night', 120000);
      ctx.pushLog('AMBIENT: NIGHT SHIFT LIGHTING');
    },
  },
  {
    id: 'contraband-recovered',
    tier: 'B',
    weight: 6,
    run(ctx) {
      ctx.pulseScene('ambient-eraser-hot', 20000);
      const eraser = document.getElementById('helly-eraser');
      if (eraser) {
        eraser.classList.add('interactive');
        eraser.setAttribute('aria-hidden', 'false');
        eraser.setAttribute('role', 'button');
        eraser.setAttribute('tabindex', '0');
        eraser.setAttribute('aria-label', 'Recover Helly eraser contraband');
        const once = () => {
          eraser.classList.remove('interactive');
          eraser.removeAttribute('role');
          eraser.removeAttribute('tabindex');
          eraser.setAttribute('aria-hidden', 'true');
          eraser.removeEventListener('click', once);
          eraser.removeEventListener('keydown', onKey);
          const n = awardCredits(ctx, 2, 'CONTRABAND RECOVERED');
          ctx.showToast(`CONTRABAND RECOVERED — +${n} CR`, { tone: 'ok' });
          ctx.saveState();
          ctx.render();
        };
        const onKey = (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            once();
          }
        };
        eraser.addEventListener('click', once);
        eraser.addEventListener('keydown', onKey);
        setTimeout(() => {
          if (eraser.classList.contains('interactive')) {
            eraser.classList.remove('interactive');
            eraser.setAttribute('aria-hidden', 'true');
          }
        }, 20000);
      } else {
        awardCredits(ctx, 1, 'CONTRABAND RECOVERED');
      }
      ctx.showToast('HELLY’S ERASER — TAP TO RECOVER', { tone: 'amber' });
    },
  },
  {
    id: 'coffee-service',
    tier: 'B',
    weight: 5,
    run(ctx) {
      const n = awardCredits(ctx, 1, 'COFFEE SERVICE');
      ctx.pulseScene('ambient-coffee', 6000);
      ctx.showToast(`BREAK ROOM COURTESY — +${n} CR`, { tone: 'ok' });
    },
  },
  {
    id: 'quota-encouragement',
    tier: 'B',
    weight: 5,
    run(ctx) {
      awardXp(ctx, 8, 'QUOTA ENCOURAGEMENT');
      ctx.showToast('REFINER PRAISE — THROUGHPUT NOTED', { tone: 'ok' });
      ctx.render();
    },
  },
  {
    id: 'melon-courtesy',
    tier: 'B',
    weight: 4,
    run(ctx) {
      ctx.pulseScene('ambient-melon', 5000);
      if (ctx.state.unlockedPalettes?.includes('melon-bar')) {
        awardCredits(ctx, 1, 'MELON BAR COURTESY');
      }
      ctx.showToast('MELON BAR COURTESY WINDOW', { tone: 'ok' });
      ctx.render();
    },
  },
  {
    id: 'compliance-drill',
    tier: 'C',
    weight: 3,
    run(ctx) {
      const until = new Date(ctx.now().getTime() + 12 * 60 * 1000);
      const existing = ctx.state.incentives.complianceFreezeUntil
        ? new Date(ctx.state.incentives.complianceFreezeUntil)
        : null;
      if (!existing || existing < until) {
        ctx.state.incentives.complianceFreezeUntil = until.toISOString();
      }
      ctx.showToast('COMPLIANCE DRILL — DECAY FREEZE 12 MIN', { tone: 'ok' });
      ctx.pushLog('AMBIENT: COMPLIANCE DRILL');
      ctx.render();
    },
  },
  {
    id: 'protocol-reminder',
    tier: 'C',
    weight: 3,
    run(ctx) {
      const log = ctx.state.dailyLog;
      const missing = !log.morningDoseAt || !log.complianceDoseAt;
      if (missing) {
        ctx.state.metrics.complianceStanding = clamp(
          ctx.state.metrics.complianceStanding + 3,
          0,
          100,
        );
        ctx.showToast('OVERNIGHT PROTOCOL REMINDER — STANDING +3', { tone: 'amber' });
        ctx.pushLog('AMBIENT: PROTOCOL REMINDER (+3 STANDING)');
      } else {
        ctx.showToast('PROTOCOLS COMPLETE — NOMINAL', { tone: 'ok' });
        ctx.pushLog('AMBIENT: PROTOCOL REMINDER (CLEAR)');
      }
      ctx.render();
    },
  },
  {
    id: 'temper-spike',
    tier: 'C',
    weight: 3,
    run(ctx) {
      ctx.pulseScene('ambient-temper', 15000);
      const q = ctx.state.metrics.quotaProgression;
      ctx.state.metrics.quotaProgression = clamp(q + 4, 0, 100);
      ctx.showToast('TEMPER SPIKE — QUADRANT EMPHASIS', { tone: 'warn' });
      ctx.pushLog('AMBIENT: TEMPER SPIKE');
      ctx.render();
    },
  },
  {
    id: 'mde-tease',
    tier: 'C',
    weight: 2,
    run(ctx) {
      const pct = (ctx.state.fileState.quota / 1000) * 100;
      const hit = ctx.state.fileState.milestonesHit?.includes('mde');
      if (pct >= 50 && !hit) {
        ctx.pulseScene('ambient-mde-tease', 8000);
        ctx.showToast('MDE TEASE — CONTINUE REFINEMENT', { tone: 'ok' });
        ctx.pushLog('AMBIENT: MDE TEASE');
      } else {
        ctx.pulseScene('ambient-numbers', 5000);
        ctx.pushLog('AMBIENT: MDE TEASE (DEFERRED)');
      }
    },
  },
  {
    id: 'redistribution',
    tier: 'C',
    weight: 1,
    run(ctx) {
      awardXp(ctx, 15, 'DEPARTMENTAL REDISTRIBUTION');
      ctx.showToast('DEPARTMENTAL REDISTRIBUTION — MINOR QUOTA STEP', { tone: 'ok' });
      ctx.render();
    },
  },
  {
    id: 'breakroom-diversion',
    tier: 'C',
    weight: 2,
    run(ctx) {
      const until = new Date(ctx.now().getTime() + 5 * 60 * 1000);
      ctx.state.ambient.sustenancePauseUntil = until.toISOString();
      ctx.showToast('BREAK ROOM DIVERSION — SUSTENANCE PAUSE 5 MIN', { tone: 'ok' });
      ctx.pushLog('AMBIENT: BREAK ROOM DIVERSION');
      ctx.render();
    },
  },
];

export function pickAmbientEvent(state, now, rng, forceTier = null) {
  const amb = ensureAmbientState(state, now);
  const pool = AMBIENT_EVENTS.filter((ev) => {
    if (forceTier && ev.tier !== forceTier) return false;
    if (amb.dailyTiers[ev.tier] >= DAILY_CAP[ev.tier]) return false;
    if (ev.id === amb.lastEventId) return false;
    return true;
  });
  if (!pool.length) return null;
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let roll = rng() * total;
  for (const ev of pool) {
    roll -= ev.weight;
    if (roll <= 0) return ev;
  }
  return pool[pool.length - 1];
}

export function canFireAmbient(state, now, { ignoreSessionCap = false } = {}) {
  if (REDUCED_MOTION) return false;
  if (typeof document !== 'undefined' && document.hidden) return false;
  if (typeof document !== 'undefined' && document.body?.dataset?.view === 'terminal') return false;
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('paused')) {
    return false;
  }
  const amb = ensureAmbientState(state, now);
  if (!ignoreSessionCap && amb.sessionCount >= MAX_SESSION_EVENTS) return false;
  if (amb.lastEventAt) {
    const elapsed = now.getTime() - new Date(amb.lastEventAt).getTime();
    if (elapsed < COOLDOWN_MS) return false;
  }
  return true;
}

export function nextGapMs(state, now) {
  const seed = departmentalSeed(state.subject?.subjectNumber || 0, dateKeyOf(now));
  const rng = mulberry32(seed ^ (now.getHours() << 8));
  return MEAN_GAP_MS + Math.floor((rng() * 2 - 1) * GAP_JITTER_MS);
}

/**
 * @param {AmbientContext & { getState: () => object }} hooks
 */
export function createAmbientScheduler(hooks) {
  let timer = null;
  let running = false;

  function clearPulse() {
    document.body.classList.remove(
      'ambient-ballast',
      'ambient-eraser-pass',
      'ambient-visitor',
      'ambient-gaze',
      'ambient-numbers',
      'ambient-night',
      'ambient-eraser-hot',
      'ambient-coffee',
      'ambient-melon',
      'ambient-temper',
      'ambient-mde-tease',
    );
  }

  const ctxBase = {
    get state() {
      return hooks.getState();
    },
    saveState: () => hooks.saveState(),
    pushLog: (t) => hooks.pushLog(t),
    render: () => hooks.render(),
    now: () => hooks.now(),
    showToast: (msg, opts) => hooks.showToast(msg, opts),
    pulseScene(cls, ms = 8000) {
      clearPulse();
      document.body.classList.add(cls);
      setTimeout(() => document.body.classList.remove(cls), ms);
    },
  };

  function fire(forceTier = null, { bypassGates = false } = {}) {
    const state = hooks.getState();
    const now = hooks.now();
    if (typeof document !== 'undefined' && document.hidden) return null;
    if (!bypassGates && !canFireAmbient(state, now)) return null;

    const amb = ensureAmbientState(state, now);
    const seed = departmentalSeed(state.subject?.subjectNumber || 0, dateKeyOf(now));
    const rng = mulberry32((seed ^ Date.now()) >>> 0);
    const ev = pickAmbientEvent(state, now, rng, forceTier);
    if (!ev) return null;

    amb.lastEventAt = now.toISOString();
    amb.lastEventId = ev.id;
    amb.sessionCount += 1;
    amb.dailyTiers[ev.tier] = (amb.dailyTiers[ev.tier] || 0) + 1;
    hooks.saveState();
    ev.run(ctxBase);
    hooks.saveState();
    return ev;
  }

  function schedule() {
    if (!running) return;
    clearTimeout(timer);
    const state = hooks.getState();
    const now = hooks.now();
    const gap = nextGapMs(state, now);
    timer = setTimeout(() => {
      fire();
      schedule();
    }, gap);
  }

  return {
    start() {
      running = true;
      schedule();
    },
    stop() {
      running = false;
      clearTimeout(timer);
      timer = null;
    },
    pause() {
      clearTimeout(timer);
      timer = null;
    },
    resume() {
      if (running) schedule();
    },
    /** Debug / Playwright: force next event immediately. */
    debugFire(tier = null) {
      return fire(tier, { bypassGates: true, ignoreSessionCap: true });
    },
    fire,
  };
}

/** Apply sustenance pause from breakroom diversion during decay. */
export function applyAmbientSustenancePause(state, elapsedMs, at = new Date()) {
  const until = state.ambient?.sustenancePauseUntil;
  if (!until || new Date(until) <= at) return elapsedMs;
  return 0;
}
