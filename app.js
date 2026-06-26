import {
  generateSyncCode,
  pushState,
  syncNow,
} from './sync.js';

const STATE_KEY      = 'lumon-compliance-state';
const FOUR_HOURS_MS  = 4 * 60 * 60 * 1000;
const SIX_HOURS_MS   = 6 * 60 * 60 * 1000;
const FILE_TARGET    = 1000;
const SUSTENANCE_TARGET = 3; // components / day

// Injection windows: AM advisory 07:00 / cutoff 10:00, PM advisory 11:00 / cutoff 14:00
const MORNING_ADVISORY_H   = 7;
const MORNING_CUTOFF_H     = 10;
const AFTERNOON_ADVISORY_H = 11;
const AFTERNOON_CUTOFF_H   = 14;

const QUOTA_FLAGS = {
  FLUID:          1,
  ACTIVITY:       2,
  AFTERNOON_DOSE: 4,
  FULL_DAY:       8,
  MORNING_DOSE:  16,
  SUSTENANCE:    32,
};

const TIER_NAMES = [
  'UNINITIALIZED',
  'ACTIVE REFINEMENT',
  'ELEVATED THROUGHPUT',
  'FULL COMPLIANCE',
];

const TIER_THRESHOLDS = [0, 100, 300, 600];

const AVATAR_STAGES = [
  { id: 'raw',         label: 'RAW DATASET',           minXp: 0    },
  { id: 'fenced',      label: 'FENCED MATRIX',          minXp: 501  },
  { id: 'singularity', label: 'COMPLIANT SINGULARITY',  minXp: 1501 },
];

const MILESTONES = [
  { pct: 10,  id: 'eraser',     name: 'LUMON ERASER',  badge: 'ERASER' },
  { pct: 25,  id: 'finger-trap',name: 'FINGER TRAP',   badge: 'TRAP'   },
  { pct: 75,  id: 'mde',        name: 'MDE',           badge: 'MDE'    },
  { pct: 100, id: 'caricature', name: 'CARICATURE',    badge: 'FACE'   },
];

const NODE_STATUS = {
  baseline:     'NODE STATUS: BASELINE',
  optimal:      'NODE STATUS: OPTIMAL THROUGHPUT',
  depleted:     'NODE STATUS: SUSTENANCE / FLUID DEPLETION',
  noncompliant: 'NODE STATUS: COMPLIANCE BREACH',
  underutilized:'NODE STATUS: QUOTA UNDERUTILIZATION',
};

const TEMPER_NAMES = { woe: 'WOE', frolic: 'FROLIC', dread: 'DREAD', malice: 'MALICE' };

const PALETTE_CATALOG = [
  { id: 'lumon-default', name: 'LUMON STANDARD',        cost: 0  },
  { id: 'breakroom',     name: 'BREAK ROOM PALETTE',    cost: 30 },
  { id: 'wellness',      name: 'WELLNESS FLOOR PALETTE',cost: 30 },
  { id: 'severed',       name: 'SEVERED WING PALETTE',  cost: 50 },
];

const GEOMETRY_CATALOG = [
  { id: 'hex-core',      name: 'HEX CORE',       cost: 0  },
  { id: 'grid-lattice',  name: 'GRID LATTICE',   cost: 20 },
  { id: 'diamond-matrix',name: 'DIAMOND MATRIX', cost: 40 },
  { id: 'fractal-split', name: 'FRACTAL SPLIT',  cost: 40 },
];

const INCENTIVES_CATALOG = [
  { id: 'coffee-cozy',  name: 'LUMON COFFEE COZY',   cost: 50,  type: 'skin',       desc: 'REHYDRATE UNIT BUTTON SKIN'        },
  { id: 'melon-bar',    name: 'THE MELON BAR',        cost: 100, type: 'palette',    desc: 'PASTEL PINK/GREEN ACCENT PALETTE'  },
  { id: 'egg-bar',      name: 'PRE-WAFFLE EGG BAR',   cost: 200, type: 'consumable', desc: 'FREEZE COMPLIANCE DECAY FOR 24 HRS'},
  { id: 'laser-crystal',name: 'LASER-ETCHED CRYSTAL', cost: 350, type: 'cosmetic',   desc: 'SPINNING REFINER OF THE QUARTER'   },
];

const DEFAULT_STATE = {
  subject: {
    subjectNumber:      4229,
    cumulativeQuota:    0,
    allocationCredits:  0,
    refinementTier:     0,
    prestigeMultiplier: 1,
    filesCompleted:     0,
  },
  fileState: {
    fileNumber:    1,
    quota:         0,
    milestonesHit: [],
  },
  metrics: {
    fluidEfficiency:    100,
    quotaProgression:   100,
    complianceStanding: 100,
    sustenanceLevel:    100,
  },
  dailyLog: {
    date:                     null,
    fluidIntakeMl:            0,
    activityUnits:            0,
    sustenanceUnits:          0,
    morningDoseAt:            null,
    morningPenaltyApplied:    false,
    complianceDoseAt:         null,
    compliancePenaltyApplied: false,
    sustenanceWarned:         false,
    quotasAwarded:            0,
  },
  incentives: {
    inventory:             [],
    activeSkin:            null,
    complianceFreezeUntil: null,
    fingerTrapTaps:        0,
  },
  onboardingComplete: false,
  lastSavedAt: new Date().toISOString(),
  unlockedPalettes:  ['lumon-default'],
  unlockedGeometries:['hex-core'],
  activePalette:     'lumon-default',
  activeGeometry:    'hex-core',
  sync: {
    enabled:     false,
    code:        null,
    apiBase:     '',
    contentHash: null,
    lastPushedAt:null,
    lastPulledAt:null,
  },
};

// ─── runtime globals ───────────────────────────────────────────────
let state              = null;
let debugTimeOverride  = null;
let pushDebounceTimer  = null;
let pendingConflict    = null;
let mdeTimer           = null;
let mdeCountdownTimer  = null;
let waffleTimer        = null;
let burstTimer         = null;
let digitTimer         = null;
let prestigeInProgress = false;
let orientPage         = 1;
let lastDominantTemper = null;
const ORIENT_PAGES     = 4;

// data field config
const FIELD_ROWS = 6;
const FIELD_COLS = 13;

// state log (display only)
const activityLog = [];
const MAX_LOG = 9;

// ─── helpers ──────────────────────────────────────────────────────
function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
function rndDigit() { return String(Math.floor(Math.random() * 10)); }

function todayKey() {
  const d = now();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function dateKeyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function now() {
  if (debugTimeOverride) {
    const [h, m] = debugTimeOverride.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m || 0, 0, 0);
    return d;
  }
  return new Date();
}

function fmtTime(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function pushLog(text) {
  activityLog.unshift({ ts: fmtTime(new Date()), text });
  if (activityLog.length > MAX_LOG) activityLog.pop();
  renderActivityLog();
}

function fileProgressPct() { return clamp((state.fileState.quota / FILE_TARGET) * 100, 0, 100); }

function isComplianceFrozen(s = state) {
  const until = s?.incentives?.complianceFreezeUntil;
  return until && new Date(until) > new Date();
}

// ─── state management ─────────────────────────────────────────────
function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
        && target[key] && typeof target[key] === 'object') {
      out[key] = deepMerge(target[key], source[key]);
    } else if (source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out;
}

function migrateState(raw) {
  if (!raw) return structuredClone(DEFAULT_STATE);
  if (raw.hydration !== undefined || raw.pet !== undefined) return structuredClone(DEFAULT_STATE);

  const merged = deepMerge(structuredClone(DEFAULT_STATE), raw);

  if (merged.subject.id && !merged.subject.subjectNumber) {
    merged.subject.subjectNumber = parseInt(merged.subject.id, 10) || 4229;
  }
  delete merged.subject.id;

  if (!merged.fileState)  merged.fileState  = { ...DEFAULT_STATE.fileState };
  if (!merged.incentives) merged.incentives = { ...DEFAULT_STATE.incentives };
  if (!merged.subject.prestigeMultiplier) merged.subject.prestigeMultiplier = 1;
  if (!merged.subject.filesCompleted)     merged.subject.filesCompleted = 0;

  // v3 → v4 additive fields
  if (merged.metrics.sustenanceLevel === undefined)        merged.metrics.sustenanceLevel = 100;
  if (merged.dailyLog.sustenanceUnits === undefined)       merged.dailyLog.sustenanceUnits = 0;
  if (merged.dailyLog.sustenanceWarned === undefined)      merged.dailyLog.sustenanceWarned = false;
  if (merged.dailyLog.morningDoseAt === undefined)         merged.dailyLog.morningDoseAt = null;
  if (merged.dailyLog.morningPenaltyApplied === undefined) merged.dailyLog.morningPenaltyApplied = false;
  if (merged.onboardingComplete === undefined)             merged.onboardingComplete = false;

  return merged;
}

export function loadState() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('reset') === '1') localStorage.removeItem(STATE_KEY);
  if (params.get('debugTime')) debugTimeOverride = params.get('debugTime');
  const syncApi = params.get('syncApi');
  try {
    const raw = localStorage.getItem(STATE_KEY);
    const s = migrateState(raw ? JSON.parse(raw) : null);
    if (syncApi) s.sync.apiBase = syncApi;
    return s;
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

export function saveState() {
  state.lastSavedAt = new Date().toISOString();
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
  schedulePush();
}

function schedulePush() {
  if (!state.sync?.enabled || !state.sync.code || !state.sync.apiBase) return;
  clearTimeout(pushDebounceTimer);
  pushDebounceTimer = setTimeout(async () => {
    try {
      const pw = document.getElementById('archival-passphrase')?.value || '';
      await pushState(state, pw);
      updateArchivalStatus('LAST TRANSMITTED: ' + fmtTime(new Date()));
    } catch (err) {
      updateArchivalStatus('TRANSMIT ERROR: ' + err.message);
    }
  }, 2000);
}

// ─── time decay (CORE — preserved + sustenance added) ─────────────
export function applyElapsedTime(s, elapsedMs) {
  if (elapsedMs <= 0) return;

  // Fluid: 15% loss per 4-hour block (unchanged)
  const fluidBlocks = elapsedMs / FOUR_HOURS_MS;
  s.metrics.fluidEfficiency = clamp(
    s.metrics.fluidEfficiency * Math.pow(0.85, fluidBlocks), 0, 100
  );

  // Sustenance: 15% loss per 6-hour block (new temperament)
  const sustBlocks = elapsedMs / SIX_HOURS_MS;
  if (s.metrics.sustenanceLevel === undefined) s.metrics.sustenanceLevel = 100;
  s.metrics.sustenanceLevel = clamp(
    s.metrics.sustenanceLevel * Math.pow(0.85, sustBlocks), 0, 100
  );

  // Compliance erosion when fluid is critically low (unchanged behaviour)
  if (!isComplianceFrozen(s)) {
    const hours = elapsedMs / (60 * 60 * 1000);
    if (s.metrics.fluidEfficiency < 30) {
      s.metrics.complianceStanding = clamp(s.metrics.complianceStanding - hours, 0, 100);
    }
  }
}

// ─── quota evaluation (CORE — preserved + sustenance) ─────────────
function evaluateQuotaTargets(log) {
  const awards = { quota: 0, credits: 0 };
  const flags  = log.quotasAwarded || 0;
  let   nf     = flags;

  // AM injection (before cutoff)
  const mDose = log.morningDoseAt ? new Date(log.morningDoseAt) : null;
  if (!(flags & QUOTA_FLAGS.MORNING_DOSE) && mDose && dateKeyOf(mDose) === log.date && mDose.getHours() < MORNING_CUTOFF_H) {
    awards.quota += 25; awards.credits += 5; nf |= QUOTA_FLAGS.MORNING_DOSE;
  }

  // Fluid
  if (!(flags & QUOTA_FLAGS.FLUID) && log.fluidIntakeMl >= 2000) {
    awards.quota += 25; awards.credits += 5; nf |= QUOTA_FLAGS.FLUID;
  }

  // Activity
  if (!(flags & QUOTA_FLAGS.ACTIVITY) && log.activityUnits >= 8000) {
    awards.quota += 25; awards.credits += 5; nf |= QUOTA_FLAGS.ACTIVITY;
  }

  // PM injection (before cutoff)
  const aDose = log.complianceDoseAt ? new Date(log.complianceDoseAt) : null;
  if (!(flags & QUOTA_FLAGS.AFTERNOON_DOSE) && aDose && dateKeyOf(aDose) === log.date && aDose.getHours() < AFTERNOON_CUTOFF_H) {
    awards.quota += 25; awards.credits += 5; nf |= QUOTA_FLAGS.AFTERNOON_DOSE;
  }

  // Sustenance component
  if (!(flags & QUOTA_FLAGS.SUSTENANCE) && log.sustenanceUnits >= SUSTENANCE_TARGET) {
    awards.quota += 25; awards.credits += 5; nf |= QUOTA_FLAGS.SUSTENANCE;
  }

  // Full-day bonus — now requires all five protocols
  const allFive =
    (nf & QUOTA_FLAGS.MORNING_DOSE)   &&
    (nf & QUOTA_FLAGS.FLUID)          &&
    (nf & QUOTA_FLAGS.ACTIVITY)       &&
    (nf & QUOTA_FLAGS.AFTERNOON_DOSE) &&
    (nf & QUOTA_FLAGS.SUSTENANCE);
  if (!(flags & QUOTA_FLAGS.FULL_DAY) && allFive) {
    awards.quota += 25; awards.credits += 5; nf |= QUOTA_FLAGS.FULL_DAY;
  }

  log.quotasAwarded = nf;
  return awards;
}

function evaluateDailyQuotas() {
  const awards = evaluateQuotaTargets(state.dailyLog);
  state.subject.allocationCredits += awards.credits;
  addQuotaXp(awards.quota);
}

// ─── XP + file progression (CORE — preserved) ────────────────────
function addQuotaXp(amount) {
  if (amount <= 0 || prestigeInProgress) return;
  const boosted = Math.round(amount * state.subject.prestigeMultiplier);
  state.subject.cumulativeQuota += boosted;
  state.fileState.quota         += boosted;
  checkMilestones();
  if (state.fileState.quota >= FILE_TARGET) completeFile();
  recalculateRefinementTier(state);
}

function checkMilestones() {
  const pct = fileProgressPct();
  for (const ms of MILESTONES) {
    if (pct >= ms.pct && !state.fileState.milestonesHit.includes(ms.id)) {
      state.fileState.milestonesHit.push(ms.id);
      onMilestoneUnlocked(ms);
    }
  }
}

function onMilestoneUnlocked(ms) {
  pushLog(`MILESTONE UNLOCKED: ${ms.name}`);
  if (ms.id === 'mde') triggerMDE();
}

// ─── MDE (preserved) ──────────────────────────────────────────────
function triggerMDE() {
  const overlay = document.getElementById('mde-overlay');
  const node    = document.getElementById('mdr-data-node');
  const counter = document.getElementById('mde-countdown');
  overlay.classList.remove('hidden');
  node.classList.add('mde-active');
  let secs = 60;
  if (counter) counter.textContent = secs;
  clearInterval(mdeCountdownTimer);
  mdeCountdownTimer = setInterval(() => {
    secs--;
    if (counter) counter.textContent = secs;
    if (secs <= 0) {
      clearInterval(mdeCountdownTimer);
      overlay.classList.add('hidden');
      node.classList.remove('mde-active');
    }
  }, 1000);
  clearTimeout(mdeTimer);
  mdeTimer = setTimeout(() => {
    clearInterval(mdeCountdownTimer);
    overlay.classList.add('hidden');
    node.classList.remove('mde-active');
  }, 61_000);
}

// ─── Prestige / Waffle Party (preserved) ──────────────────────────
function completeFile() {
  if (prestigeInProgress) return;
  prestigeInProgress = true;
  if (!state.fileState.milestonesHit.includes('caricature')) state.fileState.milestonesHit.push('caricature');
  triggerWaffleParty();
}

function triggerWaffleParty() {
  const overlay = document.getElementById('waffle-overlay');
  document.getElementById('waffle-subject-next').textContent = `NEXT ASSIGNMENT: SUBJECT #${state.subject.subjectNumber + 1}`;
  overlay.classList.remove('hidden');
  pushLog('WAFFLE PARTY — PRESTIGE CYCLE INITIATED');
  clearTimeout(waffleTimer);
  waffleTimer = setTimeout(() => {
    overlay.classList.add('hidden');
    applyPrestigeCycle();
    prestigeInProgress = false;
    saveState();
    render();
  }, 5000);
}

function applyPrestigeCycle() {
  state.subject.subjectNumber     += 1;
  state.subject.filesCompleted    += 1;
  state.subject.prestigeMultiplier = Math.round(state.subject.prestigeMultiplier * 1.5 * 10) / 10;
  state.metrics.fluidEfficiency    = 100;
  state.metrics.quotaProgression   = 100;
  state.metrics.complianceStanding = 100;
  state.metrics.sustenanceLevel    = 100;
  state.dailyLog = freshDailyLog();
  state.fileState = { fileNumber: state.subject.filesCompleted + 1, quota: 0, milestonesHit: [] };
}

function freshDailyLog() {
  return {
    date: todayKey(),
    fluidIntakeMl: 0, activityUnits: 0, sustenanceUnits: 0,
    morningDoseAt: null, morningPenaltyApplied: false,
    complianceDoseAt: null, compliancePenaltyApplied: false,
    sustenanceWarned: false,
    quotasAwarded: 0,
  };
}

// ─── midnight reset (preserved) ───────────────────────────────────
export function checkMidnightReset(s) {
  const today = todayKey();
  if (!s.dailyLog.date) { s.dailyLog.date = today; return; }
  if (s.dailyLog.date === today) return;

  const awards = evaluateQuotaTargets(s.dailyLog);
  s.subject.allocationCredits += awards.credits;
  addQuotaXp(awards.quota);

  s.dailyLog = freshDailyLog();
  pushLog('MIDNIGHT RESET — NEW SESSION');
}

// ─── compliance grace / advisory (preserved + sustenance log) ─────
export function checkComplianceGrace(s) {
  const advisory = document.getElementById('compliance-advisory');
  const mins     = now().getHours() * 60 + now().getMinutes();
  const messages = [];

  // AM injection
  if (!s.dailyLog.morningDoseAt) {
    if (mins >= MORNING_ADVISORY_H * 60 && mins < MORNING_CUTOFF_H * 60) {
      messages.push('✚ AM INJECTION REQUIRED — ADMINISTER BEFORE 10:00');
    } else if (mins >= MORNING_CUTOFF_H * 60 && !s.dailyLog.morningPenaltyApplied && !isComplianceFrozen(s)) {
      s.metrics.complianceStanding = clamp(s.metrics.complianceStanding - 10, 0, 100);
      s.dailyLog.morningPenaltyApplied = true;
      pushLog('AM INJECTION MISSED — COMPLIANCE -10');
    }
    if (mins >= MORNING_CUTOFF_H * 60) messages.push('✚ AM INJECTION OVERDUE');
  }

  // PM injection
  if (!s.dailyLog.complianceDoseAt) {
    if (mins >= AFTERNOON_ADVISORY_H * 60 && mins < AFTERNOON_CUTOFF_H * 60) {
      messages.push('✚ PM INJECTION REQUIRED — ADMINISTER BEFORE 14:00');
    } else if (mins >= AFTERNOON_CUTOFF_H * 60 && !s.dailyLog.compliancePenaltyApplied && !isComplianceFrozen(s)) {
      s.metrics.complianceStanding = clamp(s.metrics.complianceStanding - 20, 0, 100);
      s.dailyLog.compliancePenaltyApplied = true;
      pushLog('PM INJECTION MISSED — COMPLIANCE -20');
    }
    if (mins >= AFTERNOON_CUTOFF_H * 60) messages.push('✚ PM INJECTION OVERDUE — STANDING REDUCED');
  }

  // Sustenance low → spike WOE / DREAD (logged once per day)
  if (s.metrics.sustenanceLevel < 30) {
    messages.push('◧ SUSTENANCE LOW — WOE / DREAD ELEVATED');
    if (!s.dailyLog.sustenanceWarned) {
      s.dailyLog.sustenanceWarned = true;
      pushLog('SUSTENANCE CRITICAL — TEMPER ENGINE SPIKING WOE/DREAD');
    }
  } else if (s.dailyLog.sustenanceWarned && s.metrics.sustenanceLevel >= 45) {
    s.dailyLog.sustenanceWarned = false;
  }

  if (messages.length) {
    advisory.textContent = messages.join('   |   ');
    advisory.classList.remove('hidden');
  } else {
    advisory.classList.add('hidden');
    advisory.textContent = '';
  }
}

// ─── node state + Four Tempers sorting engine ─────────────────────
export function deriveNodeState(s) {
  const { fluidEfficiency, quotaProgression, complianceStanding, sustenanceLevel } = s.metrics;
  const penalty = s.dailyLog.compliancePenaltyApplied || s.dailyLog.morningPenaltyApplied;
  if (complianceStanding < 25 || penalty) return 'noncompliant';
  if (fluidEfficiency < 30 || sustenanceLevel < 25) return 'depleted';
  if (quotaProgression < 30) return 'underutilized';
  if (fluidEfficiency >= 60 && quotaProgression >= 60 && complianceStanding >= 60 && sustenanceLevel >= 50) return 'optimal';
  return 'baseline';
}

// Four Tempers: Woe, Frolic, Dread, Malice (0..100)
export function deriveTempers(s) {
  const fl = s.metrics.fluidEfficiency;
  const q  = s.metrics.quotaProgression;
  const co = s.metrics.complianceStanding;
  const su = s.metrics.sustenanceLevel;
  const pen = (s.dailyLog.compliancePenaltyApplied ? 1 : 0) + (s.dailyLog.morningPenaltyApplied ? 1 : 0);
  const lowSust = su < 30 ? (30 - su) : 0; // 0..30 boost when starved

  const dread  = clamp(((100 - fl) + (100 - su)) / 2 + lowSust * 0.8, 0, 100);
  const woe    = clamp(((100 - co) + (100 - su)) / 2 + pen * 12 + lowSust * 0.6, 0, 100);
  const malice = clamp((100 - co) * 0.7 + pen * 20, 0, 100);
  const frolic = clamp((fl + q + co + su) / 4 - pen * 15 - lowSust, 0, 100);

  return { woe, frolic, dread, malice };
}

function dominantTemper(t) {
  return Object.entries(t).sort((a, b) => b[1] - a[1])[0][0];
}

function deriveAvatarStage() {
  if (state.fileState.milestonesHit.includes('caricature')) return { id: 'caricature', label: 'CUSTOM CARICATURE' };
  const xp = state.subject.cumulativeQuota;
  let stage = AVATAR_STAGES[0];
  for (const st of AVATAR_STAGES) { if (xp >= st.minXp) stage = st; }
  return stage;
}

export function recalculateRefinementTier(s) {
  const q = s.subject.cumulativeQuota;
  let tier = 0;
  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) { if (q >= TIER_THRESHOLDS[i]) { tier = i; break; } }
  const prev = s.subject.refinementTier;
  s.subject.refinementTier = tier;
  return tier !== prev;
}

// ─── user actions ─────────────────────────────────────────────────
export function rehydrateUnit(ml) {
  const amount = Number(ml) || Number(document.getElementById('fluid-intake-input').value) || 250;
  if (amount <= 0) return;
  state.dailyLog.fluidIntakeMl += amount;
  state.metrics.fluidEfficiency = clamp(state.metrics.fluidEfficiency + amount / 50, 0, 100);
  evaluateDailyQuotas();
  saveState();
  pushLog(`FLUID LOGGED: ${amount} ML (TOTAL ${state.dailyLog.fluidIntakeMl})`);
  triggerRefinementBurst();
  tick(false);
}

export function logPhysicalActivity(units) {
  const amount = Number(units) || Number(document.getElementById('activity-units-input').value) || 1000;
  if (amount <= 0) return;
  state.dailyLog.activityUnits += amount;
  state.metrics.quotaProgression = clamp(state.metrics.quotaProgression + amount / 200, 0, 100);
  evaluateDailyQuotas();
  saveState();
  pushLog(`ACTIVITY LOGGED: ${amount} UNITS (TOTAL ${state.dailyLog.activityUnits})`);
  triggerRefinementBurst();
  tick(false);
}

export function logSustenance(levelBoost) {
  const boost = Number(levelBoost) || 34;
  state.dailyLog.sustenanceUnits += 1;
  state.metrics.sustenanceLevel = clamp(state.metrics.sustenanceLevel + boost, 0, 100);
  state.dailyLog.sustenanceWarned = false;
  evaluateDailyQuotas();
  saveState();
  pushLog(`SUSTENANCE LOGGED: COMPONENT ${state.dailyLog.sustenanceUnits} (+${boost})`);
  triggerRefinementBurst();
  tick(false);
}

export function administerMorningDose() {
  if (state.dailyLog.morningDoseAt) return;
  state.dailyLog.morningDoseAt = new Date().toISOString();
  state.metrics.complianceStanding = clamp(state.metrics.complianceStanding + 10, 0, 100);
  evaluateDailyQuotas();
  saveState();
  pushLog(`AM INJECTION ADMINISTERED AT ${fmtTime(state.dailyLog.morningDoseAt)}`);
  triggerRefinementBurst();
  tick(false);
}

export function administerComplianceDose() {
  if (state.dailyLog.complianceDoseAt) return;
  state.dailyLog.complianceDoseAt = new Date().toISOString();
  state.metrics.complianceStanding = clamp(state.metrics.complianceStanding + 15, 0, 100);
  const mins = now().getHours() * 60 + now().getMinutes();
  if (mins >= AFTERNOON_CUTOFF_H * 60 && state.dailyLog.compliancePenaltyApplied) {
    state.metrics.complianceStanding = clamp(state.metrics.complianceStanding + 5, 0, 100);
  }
  evaluateDailyQuotas();
  saveState();
  pushLog(`PM INJECTION ADMINISTERED AT ${fmtTime(state.dailyLog.complianceDoseAt)}`);
  triggerRefinementBurst();
  tick(false);
}

// ─── MDR data field (low-CPU, transform/opacity only) ─────────────
function buildDataField() {
  const bg = document.getElementById('mdr-grid-bg');
  if (!bg) return;
  bg.innerHTML = '';
  for (let r = 0; r < FIELD_ROWS; r++) {
    const row = document.createElement('div');
    row.className = 'num-row';
    row.style.top = `${(r * 100) / FIELD_ROWS + 4}%`;
    row.style.setProperty('--row-dur', `${18 + r * 4}s`);
    row.style.setProperty('--row-delay', `${-r * 3}s`);
    // duplicate sequence so the -50% translate loops seamlessly
    let html = '';
    for (let c = 0; c < FIELD_COLS * 2; c++) html += `<span class="mdr-num">${rndDigit()}</span>`;
    row.innerHTML = html;
    bg.appendChild(row);
  }
}

function refreshDigits() {
  if (document.hidden) return; // never churn DOM in a hidden tab
  const nums = document.querySelectorAll('.mdr-num');
  if (!nums.length) return;
  // mutate only a sparse subset for a subtle "live data" shimmer
  for (let i = Math.floor(Math.random() * 5); i < nums.length; i += 6 + Math.floor(Math.random() * 4)) {
    nums[i].textContent = rndDigit();
  }
}

function triggerRefinementBurst() {
  const node = document.getElementById('mdr-data-node');
  if (!node) return;
  node.classList.add('refining');
  refreshDigits();
  clearTimeout(burstTimer);
  burstTimer = setTimeout(() => node.classList.remove('refining'), 900);
}

// ─── render helpers ────────────────────────────────────────────────
function updateMetricBar(id, valueId, value, label) {
  const bar  = document.getElementById(id);
  const fill = bar.querySelector('.metric-bar-fill');
  const pct  = Math.round(value);
  fill.style.setProperty('--fill', `${pct}%`);
  fill.style.width = `${pct}%`;
  bar.setAttribute('aria-valuenow', String(pct));
  bar.setAttribute('aria-label', `${label}: ${pct}%`);
  document.getElementById(valueId).textContent = `${pct}%`;
}

function renderGeometryNote(geometry) {
  // geometry now subtly tints the node via data attribute (kept for procurement)
  const node = document.getElementById('mdr-data-node');
  if (node) node.dataset.geometry = geometry;
}

function renderTempers() {
  const t   = deriveTempers(state);
  const dom = dominantTemper(t);
  const node = document.getElementById('mdr-data-node');
  node.dataset.dominant = dom;

  setQuad('quad-wo', t.woe);
  setQuad('quad-fc', t.frolic);
  setQuad('quad-dr', t.dread);
  setQuad('quad-ma', t.malice);

  document.getElementById('tempers-readout').textContent = `DOMINANT TEMPER: ${TEMPER_NAMES[dom]}`;

  if (dom !== lastDominantTemper) {
    if (lastDominantTemper !== null) pushLog(`TEMPER SHIFT → ${TEMPER_NAMES[dom]}`);
    lastDominantTemper = dom;
  }
}

function setQuad(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.setProperty('--v', (val / 100).toFixed(2));
  el.querySelector('.quad-val').textContent = String(Math.round(val)).padStart(2, '0');
}

function renderMilestones() {
  const pct = fileProgressPct();
  document.querySelectorAll('.milestone').forEach((el) => {
    el.classList.toggle('unlocked', pct >= Number(el.dataset.milestone));
  });
  const badges = document.getElementById('inventory-badges');
  const set = new Set([
    ...state.fileState.milestonesHit.map((id) => MILESTONES.find((m) => m.id === id)?.badge).filter(Boolean),
    ...state.incentives.inventory.map((id) => INCENTIVES_CATALOG.find((i) => i.id === id)?.name.split(' ')[0]).filter(Boolean),
  ]);
  badges.innerHTML = [...set].map((b) => `<span class="badge">${b}</span>`).join('');
}

function renderProtocolStatus() {
  const mins  = now().getHours() * 60 + now().getMinutes();
  const fl    = state.dailyLog.fluidIntakeMl;
  const act   = state.dailyLog.activityUnits;
  const sus   = state.dailyLog.sustenanceUnits;
  const mDone = !!state.dailyLog.morningDoseAt;
  const aDone = !!state.dailyLog.complianceDoseAt;
  const flags = state.dailyLog.quotasAwarded || 0;

  function setSlot(slotId, stateId, status, text) {
    document.getElementById(slotId).dataset.status = status;
    document.getElementById(stateId).textContent   = text;
  }

  // Injection (consolidated AM + PM)
  const injCount = (mDone ? 1 : 0) + (aDone ? 1 : 0);
  let injStatus = 'pending';
  if (injCount === 2) injStatus = 'ok';
  else if ((!mDone && mins >= MORNING_CUTOFF_H * 60) || (!aDone && mins >= AFTERNOON_CUTOFF_H * 60)) injStatus = 'miss';
  else if ((!mDone && mins >= MORNING_ADVISORY_H * 60) || (!aDone && mins >= AFTERNOON_ADVISORY_H * 60)) injStatus = 'warn';
  setSlot('proto-injection', 'proto-injection-state', injStatus, `${injCount} / 2`);

  // Fluid
  setSlot('proto-fluid', 'proto-fluid-state',
    fl >= 2000 ? 'ok' : fl > 0 ? 'warn' : 'pending',
    fl >= 2000 ? `${fl} ML ✓` : `${fl} / 2000`);

  // Activity
  setSlot('proto-activity', 'proto-activity-state',
    act >= 8000 ? 'ok' : act > 0 ? 'warn' : 'pending',
    act >= 8000 ? `${act} ✓` : `${act} / 8K`);

  // Sustenance
  setSlot('proto-sustenance', 'proto-sustenance-state',
    sus >= SUSTENANCE_TARGET ? 'ok' : sus > 0 ? 'warn' : 'pending',
    `${sus} / ${SUSTENANCE_TARGET}`);

  // Full compliance (5 protocols)
  const doneCount = [mDone, fl >= 2000, act >= 8000, aDone, sus >= SUSTENANCE_TARGET].filter(Boolean).length;
  setSlot('proto-fullday', 'proto-fullday-state',
    (flags & QUOTA_FLAGS.FULL_DAY) ? 'ok' : doneCount > 0 ? 'warn' : 'pending',
    (flags & QUOTA_FLAGS.FULL_DAY) ? 'COMPLETE ★' : `${doneCount} / 5`);

  updateWindowIndicator('morning-window-indicator',   mins, MORNING_ADVISORY_H * 60,   MORNING_CUTOFF_H * 60,   mDone, 'WINDOW: 07:00–10:00');
  updateWindowIndicator('afternoon-window-indicator', mins, AFTERNOON_ADVISORY_H * 60, AFTERNOON_CUTOFF_H * 60, aDone, 'WINDOW: 11:00–14:00');
}

function updateWindowIndicator(id, mins, advisoryMins, cutoffMins, done, base) {
  const el = document.getElementById(id);
  if (!el) return;
  if (done)                  { el.textContent = 'COMPLETED ✓';   el.className = 'deck-sub ok'; }
  else if (mins >= cutoffMins){ el.textContent = 'WINDOW CLOSED'; el.className = 'deck-sub alert'; }
  else if (mins >= advisoryMins) {
    const rem = cutoffMins - mins;
    el.textContent = `${Math.floor(rem / 60)}h ${rem % 60}m REMAINING`;
    el.className = 'deck-sub warn';
  } else { el.textContent = base; el.className = 'deck-sub'; }
}

function renderIncentives() {
  const el = document.getElementById('incentives-catalog');
  if (!el) return;
  el.innerHTML = INCENTIVES_CATALOG.map((item) => {
    const owned  = state.incentives.inventory.includes(item.id);
    const active = item.id === 'coffee-cozy' ? state.incentives.activeSkin === item.id
                 : item.id === 'melon-bar'   ? state.activePalette === 'melon-bar'
                 : false;
    const canBuy = state.subject.allocationCredits >= item.cost;
    const btn = owned
      ? (item.type === 'skin' || item.id === 'melon-bar')
        ? active ? '<span class="catalog-item-info">EQUIPPED</span>'
                 : `<button type="button" data-equip-incentive="${item.id}">EQUIP</button>`
        : item.type === 'consumable'
          ? `<button type="button" data-use-incentive="${item.id}">CONSUME</button>`
          : '<span class="catalog-item-info">ACQUIRED</span>'
      : `<button type="button" data-buy-incentive="${item.id}" ${canBuy ? '' : 'disabled'}>ACQUIRE — ${item.cost} CR</button>`;
    return `<div class="catalog-item ${active ? 'active' : ''}">
      <span class="catalog-item-info">${item.name} — ${item.cost} CR<br><small>${item.desc}</small></span>${btn}
    </div>`;
  }).join('');
}

function renderProcurement() {
  const pEl = document.getElementById('palette-catalog');
  const gEl = document.getElementById('geometry-catalog');
  if (!pEl || !gEl) return;

  pEl.innerHTML = PALETTE_CATALOG.map((item) => {
    const owned  = state.unlockedPalettes.includes(item.id);
    const active = state.activePalette === item.id;
    const canBuy = state.subject.allocationCredits >= item.cost;
    const btn = owned
      ? active ? '<span class="catalog-item-info">EQUIPPED</span>'
               : `<button type="button" data-equip-palette="${item.id}">EQUIP</button>`
      : `<button type="button" data-buy-palette="${item.id}" ${canBuy ? '' : 'disabled'}>ACQUIRE — ${item.cost} CR</button>`;
    return `<div class="catalog-item ${active ? 'active' : ''}"><span class="catalog-item-info">${item.name}${item.cost ? ` — ${item.cost} CR` : ''}</span>${btn}</div>`;
  }).join('');

  gEl.innerHTML = GEOMETRY_CATALOG.map((item) => {
    const owned  = state.unlockedGeometries.includes(item.id);
    const active = state.activeGeometry === item.id;
    const canBuy = state.subject.allocationCredits >= item.cost;
    const btn = owned
      ? active ? '<span class="catalog-item-info">EQUIPPED</span>'
               : `<button type="button" data-equip-geometry="${item.id}">EQUIP</button>`
      : `<button type="button" data-buy-geometry="${item.id}" ${canBuy ? '' : 'disabled'}>ACQUIRE — ${item.cost} CR</button>`;
    return `<div class="catalog-item ${active ? 'active' : ''}"><span class="catalog-item-info">${item.name}${item.cost ? ` — ${item.cost} CR` : ''}</span>${btn}</div>`;
  }).join('');
}

function renderActivityLog() {
  const list = document.getElementById('activity-log-list');
  if (!list || activityLog.length === 0) return;
  list.innerHTML = activityLog.map(({ ts, text }) => `<li class="log-entry"><span class="log-ts">${ts}</span>${text}</li>`).join('');
}

// ─── main render ──────────────────────────────────────────────────
function render() {
  document.documentElement.dataset.palette = state.activePalette;
  document.body.dataset.skin = state.incentives.activeSkin || '';

  document.getElementById('subject-designation').textContent = `SUBJECT #${state.subject.subjectNumber}`;
  document.getElementById('refinement-tier').textContent     = `TIER: ${TIER_NAMES[state.subject.refinementTier]}`;
  document.getElementById('prestige-multiplier').textContent = `×${state.subject.prestigeMultiplier.toFixed(1)} MULT`;
  document.getElementById('quota-cumulative').textContent    = `LIFETIME XP: ${String(state.subject.cumulativeQuota).padStart(4,'0')}`;
  document.getElementById('allocation-credits').textContent  = `CREDITS: ${String(state.subject.allocationCredits).padStart(4,'0')}`;

  const filePct = Math.round(fileProgressPct());
  document.getElementById('file-designation').textContent    = `FILE-${String(state.fileState.fileNumber).padStart(4,'0')}`;
  document.getElementById('file-progress-fill').style.width  = `${filePct}%`;
  document.getElementById('file-progress-bar').setAttribute('aria-valuenow', String(filePct));
  document.getElementById('file-progress-value').textContent = `${filePct}% REFINED`;

  updateMetricBar('fluid-efficiency-bar',    'fluid-efficiency-value',    state.metrics.fluidEfficiency,    'Fluid efficiency');
  updateMetricBar('quota-progression-bar',   'quota-progression-value',   state.metrics.quotaProgression,   'Quota progression');
  updateMetricBar('compliance-standing-bar', 'compliance-standing-value', state.metrics.complianceStanding, 'Compliance standing');
  updateMetricBar('sustenance-bar',          'sustenance-value',          state.metrics.sustenanceLevel,    'Sustenance');

  document.getElementById('fluid-intake-today').textContent   = state.dailyLog.fluidIntakeMl;
  document.getElementById('activity-units-today').textContent = state.dailyLog.activityUnits;
  document.getElementById('sustenance-today').textContent     = state.dailyLog.sustenanceUnits;

  const mEl = document.getElementById('morning-dose-time');
  mEl.textContent = state.dailyLog.morningDoseAt ? `${fmtTime(state.dailyLog.morningDoseAt)} ✓` : 'NOT RECORDED';
  document.getElementById('btn-administer-morning').disabled = !!state.dailyLog.morningDoseAt;

  const aEl = document.getElementById('compliance-dose-time');
  aEl.textContent = state.dailyLog.complianceDoseAt ? `${fmtTime(state.dailyLog.complianceDoseAt)} ✓` : 'NOT RECORDED';
  document.getElementById('btn-administer-dose').disabled = !!state.dailyLog.complianceDoseAt;

  document.getElementById('compliance-freeze-notice').classList.toggle('hidden', !isComplianceFrozen());

  const avatar = deriveAvatarStage();
  const node   = document.getElementById('mdr-data-node');
  node.dataset.avatarStage = avatar.id;
  node.dataset.state       = deriveNodeState(state);
  node.dataset.tier        = String(state.subject.refinementTier);
  document.getElementById('avatar-temper-label').textContent = `STAGE: ${avatar.label}`;
  document.getElementById('mdr-status-label').textContent    = NODE_STATUS[node.dataset.state];

  renderGeometryNote(state.activeGeometry);
  renderTempers();
  renderMilestones();
  renderProtocolStatus();
  renderIncentives();
  renderProcurement();

  const ft = document.getElementById('finger-trap-widget');
  if (state.fileState.milestonesHit.includes('finger-trap')) {
    ft.classList.remove('hidden');
    document.getElementById('finger-trap-count').textContent = `${state.incentives.fingerTrapTaps} STRUGGLES`;
  } else { ft.classList.add('hidden'); }

  const crystal = document.getElementById('laser-crystal-footer');
  const hasCrystal = state.incentives.inventory.includes('laser-crystal');
  crystal.classList.toggle('hidden', !hasCrystal);
  crystal.setAttribute('aria-hidden', String(!hasCrystal));

  document.getElementById('archival-enabled').checked  = state.sync.enabled;
  document.getElementById('archival-endpoint').value   = state.sync.apiBase || '';
  document.getElementById('archival-hash').textContent = state.sync.code || '—';
}

// ─── live clock ───────────────────────────────────────────────────
function startClock() {
  function tickClock() {
    if (document.hidden) return;
    const d  = new Date();
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    const ss = String(d.getSeconds()).padStart(2,'0');
    const sep = d.getSeconds() % 2 === 0 ? ':' : '·';
    const clockEl = document.getElementById('live-clock');
    const dateEl  = document.getElementById('clock-date');
    if (!clockEl) return;
    clockEl.textContent = `${hh}${sep}${mm}${sep}${ss}`;

    const mins = d.getHours() * 60 + d.getMinutes();
    const aDone = !!state?.dailyLog?.complianceDoseAt;
    const mDone = !!state?.dailyLog?.morningDoseAt;
    const alertW = (!aDone && mins >= AFTERNOON_ADVISORY_H*60 && mins < AFTERNOON_CUTOFF_H*60)
                || (!mDone && mins >= MORNING_ADVISORY_H*60   && mins < MORNING_CUTOFF_H*60);
    const missW  = (!aDone && mins >= AFTERNOON_CUTOFF_H*60)
                || (!mDone && mins >= MORNING_CUTOFF_H*60);
    clockEl.className = 'live-clock' + (missW ? ' alert' : alertW ? ' warn' : '');
    if (dateEl) dateEl.textContent = d.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }).toUpperCase();
  }
  tickClock();
  setInterval(tickClock, 1000);
}

// ─── tick loop (CORE — preserved) ─────────────────────────────────
function tick(applyElapsed = true) {
  if (applyElapsed && state.lastSavedAt) {
    applyElapsedTime(state, Date.now() - new Date(state.lastSavedAt).getTime());
    state.lastSavedAt = new Date().toISOString();
  }
  checkMidnightReset(state);
  checkComplianceGrace(state);
  const tierChanged = recalculateRefinementTier(state);
  render();
  if (tierChanged) {
    pushLog(`REFINEMENT TIER ADVANCED: ${TIER_NAMES[state.subject.refinementTier]}`);
  }
}

// ─── drawers / modals ──────────────────────────────────────────────
function openDrawer(id) {
  document.getElementById(id).classList.remove('hidden');
  document.getElementById('drawer-backdrop').classList.remove('hidden');
}
function closeDrawers() {
  ['incentives-drawer','procurement-drawer','archival-sync-panel'].forEach((id) => document.getElementById(id).classList.add('hidden'));
  document.getElementById('drawer-backdrop').classList.add('hidden');
}

function acquirePalette(id) {
  const item = PALETTE_CATALOG.find((p) => p.id === id);
  if (!item || state.unlockedPalettes.includes(id) || state.subject.allocationCredits < item.cost) return;
  state.subject.allocationCredits -= item.cost;
  state.unlockedPalettes.push(id);
  state.activePalette = id;
  saveState(); render();
}

function acquireGeometry(id) {
  const item = GEOMETRY_CATALOG.find((g) => g.id === id);
  if (!item || state.unlockedGeometries.includes(id) || state.subject.allocationCredits < item.cost) return;
  state.subject.allocationCredits -= item.cost;
  state.unlockedGeometries.push(id);
  state.activeGeometry = id;
  saveState(); render();
}

function acquireIncentive(id) {
  const item = INCENTIVES_CATALOG.find((i) => i.id === id);
  if (!item || state.incentives.inventory.includes(id) || state.subject.allocationCredits < item.cost) return;
  state.subject.allocationCredits -= item.cost;
  state.incentives.inventory.push(id);
  if (item.type === 'skin') state.incentives.activeSkin = id;
  if (item.id === 'melon-bar') {
    state.activePalette = 'melon-bar';
    if (!state.unlockedPalettes.includes('melon-bar')) state.unlockedPalettes.push('melon-bar');
  }
  pushLog(`INCENTIVE ACQUIRED: ${item.name}`);
  saveState(); render();
}

function equipIncentive(id) {
  if (!state.incentives.inventory.includes(id)) return;
  if (id === 'coffee-cozy') state.incentives.activeSkin = state.incentives.activeSkin === id ? null : id;
  else if (id === 'melon-bar') state.activePalette = state.activePalette === 'melon-bar' ? 'lumon-default' : 'melon-bar';
  saveState(); render();
}

function useIncentive(id) {
  if (id !== 'egg-bar' || !state.incentives.inventory.includes(id)) return;
  const until = new Date();
  until.setHours(until.getHours() + 24);
  state.incentives.complianceFreezeUntil = until.toISOString();
  pushLog('EGG BAR CONSUMED — DECAY FROZEN 24H');
  saveState(); render();
}

// ─── orientation ──────────────────────────────────────────────────
function showOrientation() { orientPage = 1; updateOrientPage(); document.getElementById('orientation-modal').classList.remove('hidden'); }
function dismissOrientation() {
  document.getElementById('orientation-modal').classList.add('hidden');
  state.onboardingComplete = true;
  saveState();
}
function updateOrientPage() {
  document.querySelectorAll('.orientation-page').forEach((el) => el.classList.toggle('active', Number(el.dataset.page) === orientPage));
  document.getElementById('orient-page-indicator').textContent = `${orientPage} / ${ORIENT_PAGES}`;
  document.getElementById('btn-orient-prev').disabled = orientPage <= 1;
  document.getElementById('btn-orient-next').textContent = orientPage >= ORIENT_PAGES ? 'DISMISS ×' : 'NEXT →';
}

// ─── archival ─────────────────────────────────────────────────────
function updateArchivalStatus(msg) { const el = document.getElementById('archival-status'); if (el) el.textContent = msg; }
function showConflictModal() {
  return new Promise((resolve) => { pendingConflict = resolve; document.getElementById('conflict-modal').classList.remove('hidden'); });
}
async function initArchivalPull() {
  if (!state.sync.enabled || !state.sync.apiBase || !state.sync.code) return;
  try {
    const pw = document.getElementById('archival-passphrase')?.value || '';
    const result = await syncNow(state, pw, () => showConflictModal());
    if (result.action === 'applied' && result.state) {
      state = migrateState(result.state);
      state.sync.enabled = true;
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    }
  } catch (err) { updateArchivalStatus('ARCHIVAL ERROR: ' + err.message); }
}

// ─── performance: pause animation + timers when hidden ────────────
function handleVisibility() {
  const hidden = document.hidden;
  document.documentElement.classList.toggle('paused', hidden);
  if (hidden) {
    clearInterval(digitTimer);
    digitTimer = null;
  } else {
    if (!digitTimer) digitTimer = setInterval(refreshDigits, 2200);
    tick(); // catch up decay + clock immediately on return
  }
}

// ─── event listeners ──────────────────────────────────────────────
function bindEventListeners() {
  document.getElementById('btn-administer-morning').addEventListener('click', administerMorningDose);
  document.getElementById('btn-administer-dose').addEventListener('click', administerComplianceDose);
  document.getElementById('btn-rehydrate-250').addEventListener('click', () => rehydrateUnit(250));
  document.getElementById('btn-rehydrate-500').addEventListener('click', () => rehydrateUnit(500));
  document.getElementById('btn-rehydrate-unit').addEventListener('click', () => rehydrateUnit());
  document.getElementById('btn-log-activity').addEventListener('click', () => logPhysicalActivity());
  document.getElementById('btn-log-sustenance').addEventListener('click', () => logSustenance(34));

  document.querySelectorAll('.activity-preset').forEach((btn) => btn.addEventListener('click', () => logPhysicalActivity(Number(btn.dataset.units))));
  document.querySelectorAll('.sustenance-preset').forEach((btn) => btn.addEventListener('click', () => logSustenance(Number(btn.dataset.level))));

  document.getElementById('btn-incentives').addEventListener('click',  () => openDrawer('incentives-drawer'));
  document.getElementById('btn-procurement').addEventListener('click', () => openDrawer('procurement-drawer'));
  document.getElementById('btn-archival').addEventListener('click',    () => openDrawer('archival-sync-panel'));
  document.getElementById('btn-close-incentives').addEventListener('click',  closeDrawers);
  document.getElementById('btn-close-procurement').addEventListener('click', closeDrawers);
  document.getElementById('btn-close-archival').addEventListener('click',    closeDrawers);
  document.getElementById('drawer-backdrop').addEventListener('click',       closeDrawers);

  document.getElementById('btn-finger-trap')?.addEventListener('click', () => {
    state.incentives.fingerTrapTaps += 1; saveState(); render();
  });

  document.getElementById('incentives-catalog').addEventListener('click', (e) => {
    if (e.target.dataset.buyIncentive)   acquireIncentive(e.target.dataset.buyIncentive);
    if (e.target.dataset.equipIncentive) equipIncentive(e.target.dataset.equipIncentive);
    if (e.target.dataset.useIncentive)   useIncentive(e.target.dataset.useIncentive);
  });
  document.getElementById('palette-catalog').addEventListener('click', (e) => {
    if (e.target.dataset.buyPalette) acquirePalette(e.target.dataset.buyPalette);
    if (e.target.dataset.equipPalette) { state.activePalette = e.target.dataset.equipPalette; saveState(); render(); }
  });
  document.getElementById('geometry-catalog').addEventListener('click', (e) => {
    if (e.target.dataset.buyGeometry) acquireGeometry(e.target.dataset.buyGeometry);
    if (e.target.dataset.equipGeometry) { state.activeGeometry = e.target.dataset.equipGeometry; saveState(); render(); }
  });

  document.getElementById('btn-orientation').addEventListener('click', showOrientation);
  document.getElementById('btn-close-orientation').addEventListener('click', dismissOrientation);
  document.getElementById('btn-orient-prev').addEventListener('click', () => { if (orientPage > 1) { orientPage--; updateOrientPage(); } });
  document.getElementById('btn-orient-next').addEventListener('click', () => {
    if (orientPage < ORIENT_PAGES) { orientPage++; updateOrientPage(); } else dismissOrientation();
  });

  document.getElementById('archival-enabled').addEventListener('change', (e) => { state.sync.enabled = e.target.checked; saveState(); });
  document.getElementById('archival-endpoint').addEventListener('change', (e) => { state.sync.apiBase = e.target.value.trim(); saveState(); });
  document.getElementById('btn-copy-hash').addEventListener('click', async () => {
    if (state.sync.code) { await navigator.clipboard.writeText(state.sync.code); updateArchivalStatus('HASH COPIED TO CLIPBOARD'); }
  });
  document.getElementById('btn-regenerate-hash').addEventListener('click', async () => {
    state.sync.code = await generateSyncCode(); saveState(); render(); updateArchivalStatus('NEW ARCHIVAL HASH GENERATED');
  });
  document.getElementById('btn-transmit-record').addEventListener('click', async () => {
    try {
      if (!state.sync.code) state.sync.code = await generateSyncCode();
      state.sync.enabled = true;
      state.sync.apiBase = document.getElementById('archival-endpoint').value.trim();
      const pw = document.getElementById('archival-passphrase').value;
      const result = await syncNow(state, pw, () => showConflictModal());
      if (result.action === 'applied' && result.state) state = migrateState(result.state);
      saveState(); render();
      updateArchivalStatus('RECORD TRANSMITTED — ' + fmtTime(new Date()));
    } catch (err) { updateArchivalStatus('TRANSMIT ERROR: ' + err.message); }
  });
  document.getElementById('btn-retain-local').addEventListener('click', () => {
    document.getElementById('conflict-modal').classList.add('hidden'); pendingConflict?.('local'); pendingConflict = null;
  });
  document.getElementById('btn-accept-archival').addEventListener('click', () => {
    document.getElementById('conflict-modal').classList.add('hidden'); pendingConflict?.('remote'); pendingConflict = null;
  });

  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('pageshow', (e) => { if (e.persisted) tick(); });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('./sw.js'); } catch { /* optional */ }
}

// ─── init ─────────────────────────────────────────────────────────
async function init() {
  state = loadState();
  if (!state.dailyLog.date) state.dailyLog.date = todayKey();

  await initArchivalPull();

  if (state.lastSavedAt) applyElapsedTime(state, Date.now() - new Date(state.lastSavedAt).getTime());

  checkMidnightReset(state);
  checkComplianceGrace(state);
  recalculateRefinementTier(state);

  buildDataField();
  render();
  bindEventListeners();
  startClock();

  digitTimer = setInterval(refreshDigits, 2200);
  setInterval(() => tick(), 60_000);

  pushLog('REFINEMENT STREAM INITIALIZED');
  if (!state.onboardingComplete) showOrientation();

  registerServiceWorker();
}

init();
