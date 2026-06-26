import {
  generateSyncCode,
  pushState,
  syncNow,
} from './sync.js';

const STATE_KEY   = 'lumon-compliance-state';
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const FILE_TARGET   = 1000;

// Morning dose: advisory 07:00, penalty 10:00
// Afternoon dose: advisory 11:00, penalty 14:00
const MORNING_ADVISORY_H  = 7;
const MORNING_CUTOFF_H    = 10;
const AFTERNOON_ADVISORY_H = 11;
const AFTERNOON_CUTOFF_H  = 14;

const QUOTA_FLAGS = {
  FLUID:          1,
  ACTIVITY:       2,
  AFTERNOON_DOSE: 4,
  FULL_DAY:       8,
  MORNING_DOSE:  16,
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
  depleted:     'NODE STATUS: FLUID DEPLETION DETECTED',
  noncompliant: 'NODE STATUS: COMPLIANCE BREACH',
  underutilized:'NODE STATUS: QUOTA UNDERUTILIZATION',
};

const PALETTE_CATALOG = [
  { id: 'lumon-default', name: 'LUMON STANDARD',       cost: 0  },
  { id: 'breakroom',     name: 'BREAK ROOM PALETTE',   cost: 30 },
  { id: 'wellness',      name: 'WELLNESS FLOOR PALETTE',cost: 30 },
  { id: 'severed',       name: 'SEVERED WING PALETTE', cost: 50 },
];

const GEOMETRY_CATALOG = [
  { id: 'hex-core',      name: 'HEX CORE',       cost: 0  },
  { id: 'grid-lattice',  name: 'GRID LATTICE',   cost: 20 },
  { id: 'diamond-matrix',name: 'DIAMOND MATRIX', cost: 40 },
  { id: 'fractal-split', name: 'FRACTAL SPLIT',  cost: 40 },
];

const INCENTIVES_CATALOG = [
  { id: 'coffee-cozy',  name: 'LUMON COFFEE COZY',       cost: 50,  type: 'skin',       desc: 'REHYDRATE UNIT BUTTON SKIN'        },
  { id: 'melon-bar',    name: 'THE MELON BAR',            cost: 100, type: 'palette',    desc: 'PASTEL PINK/GREEN ACCENT PALETTE'  },
  { id: 'egg-bar',      name: 'PRE-WAFFLE EGG BAR',       cost: 200, type: 'consumable', desc: 'FREEZE COMPLIANCE DECAY FOR 24 HRS'},
  { id: 'laser-crystal',name: 'LASER-ETCHED CRYSTAL',     cost: 350, type: 'cosmetic',   desc: 'SPINNING REFINER OF THE QUARTER'   },
];

const DEFAULT_STATE = {
  subject: {
    subjectNumber:       4229,
    cumulativeQuota:     0,
    allocationCredits:   0,
    refinementTier:      0,
    prestigeMultiplier:  1,
    filesCompleted:      0,
  },
  fileState: {
    fileNumber:     1,
    quota:          0,
    milestonesHit:  [],
  },
  metrics: {
    fluidEfficiency:   100,
    quotaProgression:  100,
    complianceStanding:100,
  },
  dailyLog: {
    date:                     null,
    fluidIntakeMl:            0,
    activityUnits:            0,
    morningDoseAt:            null,
    morningPenaltyApplied:    false,
    complianceDoseAt:         null,
    compliancePenaltyApplied: false,
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
let state             = null;
let debugTimeOverride = null;
let pushDebounceTimer = null;
let pendingConflict   = null;
let mdeTimer          = null;
let mdeCountdownTimer = null;
let waffleTimer       = null;
let prestigeInProgress= false;
let orientPage        = 1;
const ORIENT_PAGES    = 4;

// Activity log ring buffer (display only, not persisted)
const activityLog = [];
const MAX_LOG = 8;

// ─── helpers ──────────────────────────────────────────────────────
function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

function todayKey() {
  const d = now();
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
  const ts = fmtTime(new Date());
  activityLog.unshift({ ts, text });
  if (activityLog.length > MAX_LOG) activityLog.pop();
  renderActivityLog();
}

function fileProgressPct() {
  return clamp((state.fileState.quota / FILE_TARGET) * 100, 0, 100);
}

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

  // v1 → v3 subject ID migration
  if (merged.subject.id && !merged.subject.subjectNumber) {
    merged.subject.subjectNumber = parseInt(merged.subject.id, 10) || 4229;
  }
  delete merged.subject.id;

  // ensure new fields
  if (!merged.fileState)  merged.fileState  = { ...DEFAULT_STATE.fileState };
  if (!merged.incentives) merged.incentives = { ...DEFAULT_STATE.incentives };
  if (!merged.subject.prestigeMultiplier)  merged.subject.prestigeMultiplier = 1;
  if (!merged.subject.filesCompleted)      merged.subject.filesCompleted = 0;
  if (merged.dailyLog.morningDoseAt       === undefined) merged.dailyLog.morningDoseAt            = null;
  if (merged.dailyLog.morningPenaltyApplied === undefined) merged.dailyLog.morningPenaltyApplied  = false;
  if (merged.onboardingComplete === undefined) merged.onboardingComplete = false;

  // rename old DOSE flag to AFTERNOON_DOSE (value 4, same bitmask)
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

// ─── time decay ───────────────────────────────────────────────────
export function applyElapsedTime(s, elapsedMs) {
  if (elapsedMs <= 0) return;
  const blocks = elapsedMs / FOUR_HOURS_MS;
  s.metrics.fluidEfficiency = clamp(
    s.metrics.fluidEfficiency * Math.pow(0.85, blocks), 0, 100
  );
  if (!isComplianceFrozen(s)) {
    const hours = elapsedMs / (60 * 60 * 1000);
    if (s.metrics.fluidEfficiency < 30) {
      s.metrics.complianceStanding = clamp(s.metrics.complianceStanding - hours, 0, 100);
    }
  }
}

// ─── quota evaluation ─────────────────────────────────────────────
function evaluateQuotaTargets(log) {
  const awards = { quota: 0, credits: 0 };
  const flags  = log.quotasAwarded || 0;
  let   nf     = flags;

  // Morning dose (before cutoff hour)
  const mDose = log.morningDoseAt ? new Date(log.morningDoseAt) : null;
  const mKey  = mDose ? `${mDose.getFullYear()}-${String(mDose.getMonth()+1).padStart(2,'0')}-${String(mDose.getDate()).padStart(2,'0')}` : null;
  if (!(flags & QUOTA_FLAGS.MORNING_DOSE) && mDose && mKey === log.date && mDose.getHours() < MORNING_CUTOFF_H) {
    awards.quota += 25; awards.credits += 5;
    nf |= QUOTA_FLAGS.MORNING_DOSE;
  }

  // Fluid
  if (!(flags & QUOTA_FLAGS.FLUID) && log.fluidIntakeMl >= 2000) {
    awards.quota += 25; awards.credits += 5;
    nf |= QUOTA_FLAGS.FLUID;
  }

  // Activity
  if (!(flags & QUOTA_FLAGS.ACTIVITY) && log.activityUnits >= 8000) {
    awards.quota += 25; awards.credits += 5;
    nf |= QUOTA_FLAGS.ACTIVITY;
  }

  // Afternoon dose
  const aDose = log.complianceDoseAt ? new Date(log.complianceDoseAt) : null;
  const aKey  = aDose ? `${aDose.getFullYear()}-${String(aDose.getMonth()+1).padStart(2,'0')}-${String(aDose.getDate()).padStart(2,'0')}` : null;
  const aDoseOk = aDose && aKey === log.date && aDose.getHours() < AFTERNOON_CUTOFF_H;
  if (!(flags & QUOTA_FLAGS.AFTERNOON_DOSE) && aDoseOk) {
    awards.quota += 25; awards.credits += 5;
    nf |= QUOTA_FLAGS.AFTERNOON_DOSE;
  }

  // Full day bonus
  const allFour =
    (nf & QUOTA_FLAGS.MORNING_DOSE)   &&
    (nf & QUOTA_FLAGS.FLUID)          &&
    (nf & QUOTA_FLAGS.ACTIVITY)       &&
    (nf & QUOTA_FLAGS.AFTERNOON_DOSE);
  if (!(flags & QUOTA_FLAGS.FULL_DAY) && allFour) {
    awards.quota += 25; awards.credits += 5;
    nf |= QUOTA_FLAGS.FULL_DAY;
  }

  log.quotasAwarded = nf;
  return awards;
}

function evaluateDailyQuotas() {
  const awards = evaluateQuotaTargets(state.dailyLog);
  state.subject.allocationCredits += awards.credits;
  addQuotaXp(awards.quota);
}

// ─── XP + file progression ────────────────────────────────────────
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

// ─── MDE ──────────────────────────────────────────────────────────
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

// ─── Prestige / Waffle Party ──────────────────────────────────────
function completeFile() {
  if (prestigeInProgress) return;
  prestigeInProgress = true;
  if (!state.fileState.milestonesHit.includes('caricature')) {
    state.fileState.milestonesHit.push('caricature');
  }
  triggerWaffleParty();
}

function triggerWaffleParty() {
  const overlay = document.getElementById('waffle-overlay');
  const nextEl  = document.getElementById('waffle-subject-next');
  nextEl.textContent = `NEXT ASSIGNMENT: SUBJECT #${state.subject.subjectNumber + 1}`;
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
  state.subject.subjectNumber      += 1;
  state.subject.filesCompleted     += 1;
  state.subject.prestigeMultiplier  = Math.round(state.subject.prestigeMultiplier * 1.5 * 10) / 10;
  state.metrics.fluidEfficiency     = 100;
  state.metrics.quotaProgression    = 100;
  state.metrics.complianceStanding  = 100;
  state.dailyLog = {
    date: todayKey(), fluidIntakeMl: 0, activityUnits: 0,
    morningDoseAt: null, morningPenaltyApplied: false,
    complianceDoseAt: null, compliancePenaltyApplied: false,
    quotasAwarded: 0,
  };
  state.fileState = {
    fileNumber: state.subject.filesCompleted + 1,
    quota: 0,
    milestonesHit: [],
  };
}

// ─── midnight reset ───────────────────────────────────────────────
export function checkMidnightReset(s) {
  const today = todayKey();
  if (!s.dailyLog.date) { s.dailyLog.date = today; return; }
  if (s.dailyLog.date === today) return;

  const awards = evaluateQuotaTargets(s.dailyLog);
  s.subject.allocationCredits += awards.credits;
  addQuotaXp(awards.quota);

  s.dailyLog = {
    date: today, fluidIntakeMl: 0, activityUnits: 0,
    morningDoseAt: null, morningPenaltyApplied: false,
    complianceDoseAt: null, compliancePenaltyApplied: false,
    quotasAwarded: 0,
  };
  pushLog('MIDNIGHT RESET — NEW SESSION');
}

// ─── compliance grace / advisory ─────────────────────────────────
export function checkComplianceGrace(s) {
  const advisory = document.getElementById('compliance-advisory');
  const mins     = now().getHours() * 60 + now().getMinutes();

  const morningDone   = !!s.dailyLog.morningDoseAt;
  const afternoonDone = !!s.dailyLog.complianceDoseAt;

  const messages = [];

  // Morning dose
  if (!morningDone) {
    if (mins >= MORNING_ADVISORY_H * 60 && mins < MORNING_CUTOFF_H * 60) {
      messages.push('☀ MORNING DOSE REQUIRED — ADMINISTER BEFORE 10:00');
    } else if (mins >= MORNING_CUTOFF_H * 60 && !s.dailyLog.morningPenaltyApplied && !isComplianceFrozen(s)) {
      s.metrics.complianceStanding = clamp(s.metrics.complianceStanding - 10, 0, 100);
      s.dailyLog.morningPenaltyApplied = true;
      pushLog('MORNING PROTOCOL MISSED — COMPLIANCE REDUCED');
    }
    if (mins >= MORNING_CUTOFF_H * 60) {
      messages.push('☀ MORNING DOSE OVERDUE — STANDING REDUCED');
    }
  }

  // Afternoon dose
  if (!afternoonDone) {
    if (mins >= AFTERNOON_ADVISORY_H * 60 && mins < AFTERNOON_CUTOFF_H * 60) {
      messages.push('◑ AFTERNOON DOSE REQUIRED — ADMINISTER BEFORE 14:00');
    } else if (mins >= AFTERNOON_CUTOFF_H * 60 && !s.dailyLog.compliancePenaltyApplied && !isComplianceFrozen(s)) {
      s.metrics.complianceStanding = clamp(s.metrics.complianceStanding - 20, 0, 100);
      s.dailyLog.compliancePenaltyApplied = true;
      pushLog('AFTERNOON PROTOCOL MISSED — COMPLIANCE REDUCED -20');
    }
    if (mins >= AFTERNOON_CUTOFF_H * 60) {
      messages.push('◑ AFTERNOON DOSE OVERDUE — STANDING REDUCED');
    }
  }

  if (messages.length) {
    advisory.textContent = messages.join('   |   ');
    advisory.classList.remove('hidden');
  } else {
    advisory.classList.add('hidden');
    advisory.textContent = '';
  }
}

// ─── node state derivation ────────────────────────────────────────
export function deriveNodeState(s) {
  const { fluidEfficiency, quotaProgression, complianceStanding } = s.metrics;
  const penalty = s.dailyLog.compliancePenaltyApplied || s.dailyLog.morningPenaltyApplied;
  if (complianceStanding < 25 || penalty) return 'noncompliant';
  if (fluidEfficiency    < 30)            return 'depleted';
  if (quotaProgression   < 30)            return 'underutilized';
  if (fluidEfficiency >= 60 && quotaProgression >= 60 && complianceStanding >= 60) return 'optimal';
  return 'baseline';
}

function deriveAvatarStage() {
  if (state.fileState.milestonesHit.includes('caricature')) {
    return { id: 'caricature', label: 'CUSTOM CARICATURE' };
  }
  const xp = state.subject.cumulativeQuota;
  let stage = AVATAR_STAGES[0];
  for (const st of AVATAR_STAGES) { if (xp >= st.minXp) stage = st; }
  return stage;
}

export function recalculateRefinementTier(s) {
  const q = s.subject.cumulativeQuota;
  let tier = 0;
  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (q >= TIER_THRESHOLDS[i]) { tier = i; break; }
  }
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
  pushLog(`FLUID INTAKE LOGGED: ${amount} ML (TOTAL ${state.dailyLog.fluidIntakeMl} ML)`);
  tick(false);
}

export function logPhysicalActivity(units) {
  const amount = Number(units) || Number(document.getElementById('activity-units-input').value) || 1000;
  if (amount <= 0) return;
  state.dailyLog.activityUnits += amount;
  state.metrics.quotaProgression = clamp(
    state.metrics.quotaProgression + amount / 200, 0, 100
  );
  evaluateDailyQuotas();
  saveState();
  pushLog(`ACTIVITY LOGGED: ${amount} UNITS (TOTAL ${state.dailyLog.activityUnits})`);
  tick(false);
}

export function administerMorningDose() {
  if (state.dailyLog.morningDoseAt) return;
  state.dailyLog.morningDoseAt = new Date().toISOString();
  state.metrics.complianceStanding = clamp(state.metrics.complianceStanding + 10, 0, 100);
  evaluateDailyQuotas();
  saveState();
  pushLog(`MORNING DOSE ADMINISTERED AT ${fmtTime(state.dailyLog.morningDoseAt)}`);
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
  pushLog(`AFTERNOON DOSE ADMINISTERED AT ${fmtTime(state.dailyLog.complianceDoseAt)}`);
  tick(false);
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

function renderScatterCloud() {
  const cloud = document.getElementById('scatter-cloud');
  if (!cloud) return;
  cloud.innerHTML = '';
  for (let i = 0; i < 18; i++) {
    const span = document.createElement('span');
    span.className = 'scatter-digit';
    span.textContent = String(Math.floor(Math.random() * 10));
    span.style.left = `${10 + Math.random() * 80}%`;
    span.style.top  = `${10 + Math.random() * 80}%`;
    span.style.animationDelay = `${Math.random() * 0.4}s`;
    cloud.appendChild(span);
  }
}

function renderAvatarLayers(stageId) {
  const ids = ['raw', 'fenced', 'singularity', 'caricature'];
  for (const id of ids) {
    const el = document.getElementById(`avatar-${id}`);
    if (!el) continue;
    const show = id === stageId;
    el.hidden = !show;
    el.setAttribute('aria-hidden', show ? 'false' : 'true');
  }
  if (stageId === 'raw') renderScatterCloud();
}

function renderGeometryExtras(geometry) {
  const g = document.querySelector('.mdr-geometry-extra');
  if (!g) return;
  g.innerHTML = '';
  g.hidden = geometry === 'hex-core';
  if (geometry === 'grid-lattice') {
    for (let i = 20; i <= 80; i += 15) {
      g.innerHTML += `<line x1="${i}" y1="15" x2="${i}" y2="85"/>`;
      g.innerHTML += `<line x1="15" y1="${i}" x2="85" y2="${i}"/>`;
    }
  } else if (geometry === 'diamond-matrix') {
    g.innerHTML = `<rect x="25" y="25" width="50" height="50" transform="rotate(45 50 50)"/>
                   <rect x="35" y="35" width="30" height="30" transform="rotate(45 50 50)"/>`;
  } else if (geometry === 'fractal-split') {
    g.innerHTML = `<line x1="25" y1="25" x2="75" y2="75"/>
                   <line x1="75" y1="25" x2="25" y2="75"/>
                   <line x1="50" y1="25" x2="50" y2="75"/>
                   <line x1="25" y1="50" x2="75" y2="50"/>
                   <rect x="40" y="40" width="20" height="20"/>`;
  }
}

function renderProtocolStatus() {
  const mins     = now().getHours() * 60 + now().getMinutes();
  const fl       = state.dailyLog.fluidIntakeMl;
  const act      = state.dailyLog.activityUnits;
  const mDone    = !!state.dailyLog.morningDoseAt;
  const aDone    = !!state.dailyLog.complianceDoseAt;
  const flags    = state.dailyLog.quotasAwarded || 0;

  // helper to set slot status
  function setSlot(id, stateId, status, text) {
    const slot  = document.getElementById(id);
    const stEl  = document.getElementById(stateId);
    if (!slot || !stEl) return;
    slot.dataset.status = status;
    stEl.textContent    = text;
  }

  // Morning dose
  if (mDone) {
    setSlot('proto-morning', 'proto-morning-state', 'ok', `DONE ${fmtTime(state.dailyLog.morningDoseAt)}`);
  } else if (mins >= MORNING_CUTOFF_H * 60) {
    setSlot('proto-morning', 'proto-morning-state', 'miss', 'MISSED');
  } else if (mins >= MORNING_ADVISORY_H * 60) {
    setSlot('proto-morning', 'proto-morning-state', 'warn', 'DUE NOW');
  } else {
    setSlot('proto-morning', 'proto-morning-state', 'pending', 'PENDING');
  }

  // Fluid
  if (fl >= 2000) {
    setSlot('proto-fluid', 'proto-fluid-state', 'ok', `${fl} ML ✓`);
  } else if (fl > 0) {
    setSlot('proto-fluid', 'proto-fluid-state', 'warn', `${fl} / 2000`);
  } else {
    setSlot('proto-fluid', 'proto-fluid-state', 'pending', '0 ML');
  }

  // Activity
  if (act >= 8000) {
    setSlot('proto-activity', 'proto-activity-state', 'ok', `${act} ✓`);
  } else if (act > 0) {
    setSlot('proto-activity', 'proto-activity-state', 'warn', `${act} / 8K`);
  } else {
    setSlot('proto-activity', 'proto-activity-state', 'pending', '0');
  }

  // Afternoon dose
  if (aDone) {
    setSlot('proto-afternoon', 'proto-afternoon-state', 'ok', `DONE ${fmtTime(state.dailyLog.complianceDoseAt)}`);
  } else if (mins >= AFTERNOON_CUTOFF_H * 60) {
    setSlot('proto-afternoon', 'proto-afternoon-state', 'miss', 'MISSED');
  } else if (mins >= AFTERNOON_ADVISORY_H * 60) {
    setSlot('proto-afternoon', 'proto-afternoon-state', 'warn', 'DUE NOW');
  } else {
    setSlot('proto-afternoon', 'proto-afternoon-state', 'pending', 'PENDING');
  }

  // Full day
  const fullDay = !!(flags & QUOTA_FLAGS.FULL_DAY);
  if (fullDay) {
    setSlot('proto-fullday', 'proto-fullday-state', 'ok', 'COMPLETE ★');
  } else {
    const done = [mDone, fl >= 2000, act >= 8000, aDone].filter(Boolean).length;
    setSlot('proto-fullday', 'proto-fullday-state', done > 0 ? 'warn' : 'pending', `${done} / 4`);
  }

  // Time-aware window indicators
  updateWindowIndicator('morning-window-indicator', mins,
    MORNING_ADVISORY_H * 60, MORNING_CUTOFF_H * 60, mDone, 'WINDOW: 07:00–10:00');
  updateWindowIndicator('afternoon-window-indicator', mins,
    AFTERNOON_ADVISORY_H * 60, AFTERNOON_CUTOFF_H * 60, aDone, 'WINDOW: 11:00–14:00');
}

function updateWindowIndicator(id, mins, advisoryMins, cutoffMins, done, base) {
  const el = document.getElementById(id);
  if (!el) return;
  if (done) {
    el.textContent = 'COMPLETED ✓';
    el.className   = 'section-window ok';
  } else if (mins >= cutoffMins) {
    el.textContent = 'WINDOW CLOSED';
    el.className   = 'section-window alert';
  } else if (mins >= advisoryMins) {
    const remaining = cutoffMins - mins;
    el.textContent = `${Math.floor(remaining / 60)}h ${remaining % 60}m REMAINING`;
    el.className   = 'section-window warn';
  } else {
    el.textContent = base;
    el.className   = 'section-window';
  }
}

function renderMilestones() {
  const pct = fileProgressPct();
  document.querySelectorAll('.milestone').forEach((el) => {
    const threshold = Number(el.dataset.milestone);
    el.classList.toggle('unlocked', pct >= threshold);
  });

  const badges  = document.getElementById('inventory-badges');
  const badgeSet = new Set([
    ...state.fileState.milestonesHit
        .map((id) => MILESTONES.find((m) => m.id === id)?.badge)
        .filter(Boolean),
    ...state.incentives.inventory
        .map((id) => INCENTIVES_CATALOG.find((i) => i.id === id)?.name.split(' ')[0])
        .filter(Boolean),
  ]);
  badges.innerHTML = [...badgeSet].map((b) => `<span class="badge">${b}</span>`).join('');
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
    let btn = owned
      ? (item.type === 'skin' || item.id === 'melon-bar')
        ? active
          ? '<span class="catalog-item-info">EQUIPPED</span>'
          : `<button type="button" data-equip-incentive="${item.id}">EQUIP</button>`
        : item.type === 'consumable'
          ? `<button type="button" data-use-incentive="${item.id}">CONSUME</button>`
          : '<span class="catalog-item-info">ACQUIRED</span>'
      : `<button type="button" data-buy-incentive="${item.id}" ${canBuy ? '' : 'disabled'}>ACQUIRE — ${item.cost} CR</button>`;
    return `<div class="catalog-item ${active ? 'active' : ''}">
      <span class="catalog-item-info">${item.name} — ${item.cost} CR<br><small>${item.desc}</small></span>
      ${btn}
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
    return `<div class="catalog-item ${active ? 'active' : ''}">
      <span class="catalog-item-info">${item.name}${item.cost ? ` — ${item.cost} CR` : ''}</span>
      ${btn}
    </div>`;
  }).join('');

  gEl.innerHTML = GEOMETRY_CATALOG.map((item) => {
    const owned  = state.unlockedGeometries.includes(item.id);
    const active = state.activeGeometry === item.id;
    const canBuy = state.subject.allocationCredits >= item.cost;
    const btn = owned
      ? active ? '<span class="catalog-item-info">EQUIPPED</span>'
               : `<button type="button" data-equip-geometry="${item.id}">EQUIP</button>`
      : `<button type="button" data-buy-geometry="${item.id}" ${canBuy ? '' : 'disabled'}>ACQUIRE — ${item.cost} CR</button>`;
    return `<div class="catalog-item ${active ? 'active' : ''}">
      <span class="catalog-item-info">${item.name}${item.cost ? ` — ${item.cost} CR` : ''}</span>
      ${btn}
    </div>`;
  }).join('');
}

function renderActivityLog() {
  const list = document.getElementById('activity-log-list');
  if (!list) return;
  if (activityLog.length === 0) return;
  list.innerHTML = activityLog.map(({ ts, text }) =>
    `<li class="log-entry"><span class="log-ts">${ts}</span>${text}</li>`
  ).join('');
}

// ─── main render ──────────────────────────────────────────────────
function render() {
  document.documentElement.dataset.palette = state.activePalette;
  document.body.dataset.skin = state.incentives.activeSkin || '';

  document.getElementById('subject-designation').textContent  = `SUBJECT #${state.subject.subjectNumber}`;
  document.getElementById('refinement-tier').textContent      = `TIER: ${TIER_NAMES[state.subject.refinementTier]}`;
  document.getElementById('prestige-multiplier').textContent  = `×${state.subject.prestigeMultiplier.toFixed(1)} MULTIPLIER`;
  document.getElementById('quota-cumulative').textContent     = `LIFETIME XP: ${String(state.subject.cumulativeQuota).padStart(4,'0')}`;
  document.getElementById('allocation-credits').textContent   = `CREDITS: ${String(state.subject.allocationCredits).padStart(4,'0')}`;

  // File bar
  const filePct = Math.round(fileProgressPct());
  document.getElementById('file-designation').textContent    = `FILE-${String(state.fileState.fileNumber).padStart(4,'0')}`;
  document.getElementById('file-progress-fill').style.width  = `${filePct}%`;
  document.getElementById('file-progress-bar').setAttribute('aria-valuenow', String(filePct));
  document.getElementById('file-progress-value').textContent = `${filePct}% REFINED`;

  updateMetricBar('fluid-efficiency-bar',    'fluid-efficiency-value',    state.metrics.fluidEfficiency,    'Fluid efficiency');
  updateMetricBar('quota-progression-bar',   'quota-progression-value',   state.metrics.quotaProgression,   'Quota progression');
  updateMetricBar('compliance-standing-bar', 'compliance-standing-value', state.metrics.complianceStanding, 'Compliance standing');

  document.getElementById('fluid-intake-today').textContent  = state.dailyLog.fluidIntakeMl;
  document.getElementById('activity-units-today').textContent= state.dailyLog.activityUnits;

  // Morning dose
  const mEl = document.getElementById('morning-dose-time');
  mEl.textContent = state.dailyLog.morningDoseAt
    ? `${fmtTime(state.dailyLog.morningDoseAt)} — LOGGED`
    : 'NOT RECORDED';
  document.getElementById('btn-administer-morning').disabled = !!state.dailyLog.morningDoseAt;

  // Afternoon dose
  const aEl = document.getElementById('compliance-dose-time');
  aEl.textContent = state.dailyLog.complianceDoseAt
    ? `${fmtTime(state.dailyLog.complianceDoseAt)} — LOGGED`
    : 'NOT RECORDED';
  document.getElementById('btn-administer-dose').disabled = !!state.dailyLog.complianceDoseAt;

  // Compliance freeze
  document.getElementById('compliance-freeze-notice').classList.toggle('hidden', !isComplianceFrozen());

  // Avatar
  const avatar = deriveAvatarStage();
  const node   = document.getElementById('mdr-data-node');
  node.dataset.avatarStage = avatar.id;
  node.dataset.state       = deriveNodeState(state);
  node.dataset.tier        = String(state.subject.refinementTier);
  node.dataset.geometry    = state.activeGeometry;
  document.getElementById('avatar-temper-label').textContent = `TEMPER: ${avatar.label}`;
  document.getElementById('mdr-status-label').textContent    = NODE_STATUS[node.dataset.state];

  renderAvatarLayers(avatar.id);
  renderGeometryExtras(state.activeGeometry);
  renderMilestones();
  renderProtocolStatus();
  renderIncentives();
  renderProcurement();

  // Finger trap
  const ft = document.getElementById('finger-trap-widget');
  if (state.fileState.milestonesHit.includes('finger-trap')) {
    ft.classList.remove('hidden');
    document.getElementById('finger-trap-count').textContent = `${state.incentives.fingerTrapTaps} STRUGGLES`;
  } else {
    ft.classList.add('hidden');
  }

  // Laser crystal
  const crystal = document.getElementById('laser-crystal-footer');
  const hasCrystal = state.incentives.inventory.includes('laser-crystal');
  crystal.classList.toggle('hidden', !hasCrystal);
  crystal.setAttribute('aria-hidden', String(!hasCrystal));

  // Archival
  document.getElementById('archival-enabled').checked      = state.sync.enabled;
  document.getElementById('archival-endpoint').value       = state.sync.apiBase || '';
  document.getElementById('archival-hash').textContent     = state.sync.code || '—';
}

// ─── live clock ───────────────────────────────────────────────────
function startClock() {
  function tick() {
    const d      = new Date();
    const hh     = String(d.getHours()).padStart(2,'0');
    const mm     = String(d.getMinutes()).padStart(2,'0');
    const ss     = String(d.getSeconds()).padStart(2,'0');
    const colon  = d.getSeconds() % 2 === 0 ? ':' : '·';
    const clockEl = document.getElementById('live-clock');
    const dateEl  = document.getElementById('clock-date');
    if (!clockEl) return;
    clockEl.textContent = `${hh}${colon}${mm}${colon}${ss}`;

    const mins = d.getHours() * 60 + d.getMinutes();
    const afternoonDone = !!state?.dailyLog?.complianceDoseAt;
    const morningDone   = !!state?.dailyLog?.morningDoseAt;

    const alertWindow = (!afternoonDone && mins >= AFTERNOON_ADVISORY_H * 60 && mins < AFTERNOON_CUTOFF_H * 60)
                     || (!morningDone   && mins >= MORNING_ADVISORY_H * 60   && mins < MORNING_CUTOFF_H * 60);
    const missWindow  = (!afternoonDone && mins >= AFTERNOON_CUTOFF_H * 60)
                     || (!morningDone   && mins >= MORNING_CUTOFF_H * 60);

    clockEl.className = 'live-clock' + (missWindow ? ' alert' : alertWindow ? ' warn' : '');

    if (dateEl) {
      dateEl.textContent = d.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }).toUpperCase();
    }
  }
  tick();
  setInterval(tick, 1000);
}

// ─── tick loop ────────────────────────────────────────────────────
function tick(applyElapsed = true) {
  if (applyElapsed && state.lastSavedAt) {
    const elapsedMs = Date.now() - new Date(state.lastSavedAt).getTime();
    applyElapsedTime(state, elapsedMs);
    state.lastSavedAt = new Date().toISOString();
  }
  checkMidnightReset(state);
  checkComplianceGrace(state);
  const tierChanged = recalculateRefinementTier(state);
  render();
  if (tierChanged) {
    const node = document.getElementById('mdr-data-node');
    node.classList.add('tier-flash');
    setTimeout(() => node.classList.remove('tier-flash'), 400);
    pushLog(`REFINEMENT TIER ADVANCED: ${TIER_NAMES[state.subject.refinementTier]}`);
  }
}

// ─── drawer / modal helpers ────────────────────────────────────────
function openDrawer(id) {
  document.getElementById(id).classList.remove('hidden');
  document.getElementById('drawer-backdrop').classList.remove('hidden');
}

function closeDrawers() {
  ['incentives-drawer','procurement-drawer','archival-sync-panel'].forEach((id) => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById('drawer-backdrop').classList.add('hidden');
}

// ─── procurement helpers ──────────────────────────────────────────
function acquirePalette(id) {
  const item = PALETTE_CATALOG.find((p) => p.id === id);
  if (!item || state.unlockedPalettes.includes(id)) return;
  if (state.subject.allocationCredits < item.cost) return;
  state.subject.allocationCredits -= item.cost;
  state.unlockedPalettes.push(id);
  state.activePalette = id;
  saveState(); render();
}

function acquireGeometry(id) {
  const item = GEOMETRY_CATALOG.find((g) => g.id === id);
  if (!item || state.unlockedGeometries.includes(id)) return;
  if (state.subject.allocationCredits < item.cost) return;
  state.subject.allocationCredits -= item.cost;
  state.unlockedGeometries.push(id);
  state.activeGeometry = id;
  saveState(); render();
}

function acquireIncentive(id) {
  const item = INCENTIVES_CATALOG.find((i) => i.id === id);
  if (!item || state.incentives.inventory.includes(id)) return;
  if (state.subject.allocationCredits < item.cost) return;
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
  if (id === 'coffee-cozy') {
    state.incentives.activeSkin = state.incentives.activeSkin === id ? null : id;
  } else if (id === 'melon-bar') {
    state.activePalette = state.activePalette === 'melon-bar' ? 'lumon-default' : 'melon-bar';
  }
  saveState(); render();
}

function useIncentive(id) {
  if (id !== 'egg-bar' || !state.incentives.inventory.includes(id)) return;
  const until = new Date();
  until.setHours(until.getHours() + 24);
  state.incentives.complianceFreezeUntil = until.toISOString();
  pushLog('EGG BAR CONSUMED — COMPLIANCE DECAY FROZEN FOR 24H');
  saveState(); render();
}

// ─── orientation modal ────────────────────────────────────────────
function showOrientation() {
  orientPage = 1;
  updateOrientPage();
  document.getElementById('orientation-modal').classList.remove('hidden');
}

function updateOrientPage() {
  document.querySelectorAll('.orientation-page').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.page) === orientPage);
  });
  document.getElementById('orient-page-indicator').textContent = `${orientPage} / ${ORIENT_PAGES}`;
  document.getElementById('btn-orient-prev').disabled = orientPage <= 1;
  document.getElementById('btn-orient-next').textContent = orientPage >= ORIENT_PAGES ? 'DISMISS ×' : 'NEXT →';
}

// ─── archival helpers ─────────────────────────────────────────────
function updateArchivalStatus(msg) {
  const el = document.getElementById('archival-status');
  if (el) el.textContent = msg;
}

function showConflictModal() {
  return new Promise((resolve) => {
    pendingConflict = resolve;
    document.getElementById('conflict-modal').classList.remove('hidden');
  });
}

async function initArchivalPull() {
  if (!state.sync.enabled || !state.sync.apiBase || !state.sync.code) return;
  try {
    const pw     = document.getElementById('archival-passphrase')?.value || '';
    const result = await syncNow(state, pw, () => showConflictModal());
    if (result.action === 'applied' && result.state) {
      state = migrateState(result.state);
      state.sync.enabled = true;
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    }
  } catch (err) {
    updateArchivalStatus('ARCHIVAL ERROR: ' + err.message);
  }
}

// ─── event listeners ──────────────────────────────────────────────
function bindEventListeners() {
  // Protocols
  document.getElementById('btn-administer-morning').addEventListener('click', administerMorningDose);
  document.getElementById('btn-rehydrate-250').addEventListener('click', () => rehydrateUnit(250));
  document.getElementById('btn-rehydrate-500').addEventListener('click', () => rehydrateUnit(500));
  document.getElementById('btn-rehydrate-unit').addEventListener('click', () => rehydrateUnit());
  document.getElementById('btn-log-activity').addEventListener('click', () => logPhysicalActivity());
  document.getElementById('btn-administer-dose').addEventListener('click', administerComplianceDose);

  document.querySelectorAll('.activity-preset').forEach((btn) => {
    btn.addEventListener('click', () => logPhysicalActivity(Number(btn.dataset.units)));
  });

  // Drawers
  document.getElementById('btn-incentives').addEventListener('click',  () => openDrawer('incentives-drawer'));
  document.getElementById('btn-procurement').addEventListener('click', () => openDrawer('procurement-drawer'));
  document.getElementById('btn-archival').addEventListener('click',    () => openDrawer('archival-sync-panel'));
  document.getElementById('btn-close-incentives').addEventListener('click',  closeDrawers);
  document.getElementById('btn-close-procurement').addEventListener('click', closeDrawers);
  document.getElementById('btn-close-archival').addEventListener('click',    closeDrawers);
  document.getElementById('drawer-backdrop').addEventListener('click',       closeDrawers);

  // Finger trap
  document.getElementById('btn-finger-trap')?.addEventListener('click', () => {
    state.incentives.fingerTrapTaps += 1;
    saveState();
    render();
  });

  // Incentives catalog (event delegation)
  document.getElementById('incentives-catalog').addEventListener('click', (e) => {
    const buy   = e.target.dataset.buyIncentive;
    const equip = e.target.dataset.equipIncentive;
    const use   = e.target.dataset.useIncentive;
    if (buy)   acquireIncentive(buy);
    if (equip) equipIncentive(equip);
    if (use)   useIncentive(use);
  });

  // Palette catalog
  document.getElementById('palette-catalog').addEventListener('click', (e) => {
    const buy   = e.target.dataset.buyPalette;
    const equip = e.target.dataset.equipPalette;
    if (buy)   acquirePalette(buy);
    if (equip) { state.activePalette = equip; saveState(); render(); }
  });

  // Geometry catalog
  document.getElementById('geometry-catalog').addEventListener('click', (e) => {
    const buy   = e.target.dataset.buyGeometry;
    const equip = e.target.dataset.equipGeometry;
    if (buy)   acquireGeometry(buy);
    if (equip) { state.activeGeometry = equip; saveState(); render(); }
  });

  // Orientation
  document.getElementById('btn-orientation').addEventListener('click', showOrientation);
  document.getElementById('btn-close-orientation').addEventListener('click', () => {
    document.getElementById('orientation-modal').classList.add('hidden');
    state.onboardingComplete = true;
    saveState();
  });
  document.getElementById('btn-orient-prev').addEventListener('click', () => {
    if (orientPage > 1) { orientPage--; updateOrientPage(); }
  });
  document.getElementById('btn-orient-next').addEventListener('click', () => {
    if (orientPage < ORIENT_PAGES) {
      orientPage++;
      updateOrientPage();
    } else {
      document.getElementById('orientation-modal').classList.add('hidden');
      state.onboardingComplete = true;
      saveState();
    }
  });

  // Archival
  document.getElementById('archival-enabled').addEventListener('change', (e) => {
    state.sync.enabled = e.target.checked; saveState();
  });
  document.getElementById('archival-endpoint').addEventListener('change', (e) => {
    state.sync.apiBase = e.target.value.trim(); saveState();
  });
  document.getElementById('btn-copy-hash').addEventListener('click', async () => {
    if (state.sync.code) {
      await navigator.clipboard.writeText(state.sync.code);
      updateArchivalStatus('HASH COPIED TO CLIPBOARD');
    }
  });
  document.getElementById('btn-regenerate-hash').addEventListener('click', async () => {
    state.sync.code = await generateSyncCode();
    saveState(); render();
    updateArchivalStatus('NEW ARCHIVAL HASH GENERATED');
  });
  document.getElementById('btn-transmit-record').addEventListener('click', async () => {
    try {
      if (!state.sync.code) state.sync.code = await generateSyncCode();
      state.sync.enabled = true;
      state.sync.apiBase = document.getElementById('archival-endpoint').value.trim();
      const pw     = document.getElementById('archival-passphrase').value;
      const result = await syncNow(state, pw, () => showConflictModal());
      if (result.action === 'applied' && result.state) state = migrateState(result.state);
      saveState(); render();
      updateArchivalStatus('RECORD TRANSMITTED — ' + fmtTime(new Date()));
    } catch (err) {
      updateArchivalStatus('TRANSMIT ERROR: ' + err.message);
    }
  });
  document.getElementById('btn-retain-local').addEventListener('click', () => {
    document.getElementById('conflict-modal').classList.add('hidden');
    pendingConflict?.('local'); pendingConflict = null;
  });
  document.getElementById('btn-accept-archival').addEventListener('click', () => {
    document.getElementById('conflict-modal').classList.add('hidden');
    pendingConflict?.('remote'); pendingConflict = null;
  });

  // Visibility / page restore
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) tick(); });
}

// ─── service worker ────────────────────────────────────────────────
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('./sw.js'); } catch { /* optional */ }
}

// ─── init ─────────────────────────────────────────────────────────
async function init() {
  state = loadState();

  if (!state.dailyLog.date) state.dailyLog.date = todayKey();

  await initArchivalPull();

  if (state.lastSavedAt) {
    applyElapsedTime(state, Date.now() - new Date(state.lastSavedAt).getTime());
  }

  checkMidnightReset(state);
  checkComplianceGrace(state);
  recalculateRefinementTier(state);
  render();
  bindEventListeners();
  startClock();
  setInterval(() => tick(), 60_000);
  pushLog('REFINEMENT SESSION INITIALIZED');

  if (!state.onboardingComplete) showOrientation();

  registerServiceWorker();
}

init();
