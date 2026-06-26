import {
  generateSyncCode,
  pushState,
  syncNow,
} from './sync.js';

const STATE_KEY = 'lumon-compliance-state';
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const FILE_TARGET = 1000;
const QUOTA_FLAGS = { FLUID: 1, ACTIVITY: 2, DOSE: 4, FULL_DAY: 8 };

const TIER_NAMES = [
  'UNINITIALIZED',
  'ACTIVE REFINEMENT',
  'ELEVATED THROUGHPUT',
  'FULL COMPLIANCE',
];

const TIER_THRESHOLDS = [0, 100, 300, 600];

const AVATAR_STAGES = [
  { id: 'raw', label: 'RAW DATASET', minXp: 0 },
  { id: 'fenced', label: 'FENCED MATRIX', minXp: 501 },
  { id: 'singularity', label: 'COMPLIANT SINGULARITY', minXp: 1501 },
];

const MILESTONES = [
  { pct: 10, id: 'eraser', name: 'LUMON ERASER', badge: 'ERASER' },
  { pct: 25, id: 'finger-trap', name: 'FINGER TRAP', badge: 'TRAP' },
  { pct: 75, id: 'mde', name: 'MDE', badge: 'MDE' },
  { pct: 100, id: 'caricature', name: 'CARICATURE', badge: 'FACE' },
];

const NODE_STATUS = {
  baseline: 'NODE STATUS: BASELINE',
  optimal: 'NODE STATUS: OPTIMAL THROUGHPUT',
  depleted: 'NODE STATUS: FLUID DEPLETION DETECTED',
  noncompliant: 'NODE STATUS: COMPLIANCE BREACH',
  underutilized: 'NODE STATUS: QUOTA UNDERUTILIZATION',
};

const PALETTE_CATALOG = [
  { id: 'lumon-default', name: 'LUMON STANDARD', cost: 0 },
  { id: 'breakroom', name: 'BREAK ROOM PALETTE', cost: 30 },
  { id: 'wellness', name: 'WELLNESS FLOOR PALETTE', cost: 30 },
  { id: 'severed', name: 'SEVERED WING PALETTE', cost: 50 },
];

const GEOMETRY_CATALOG = [
  { id: 'hex-core', name: 'HEX CORE', cost: 0 },
  { id: 'grid-lattice', name: 'GRID LATTICE', cost: 20 },
  { id: 'diamond-matrix', name: 'DIAMOND MATRIX', cost: 40 },
  { id: 'fractal-split', name: 'FRACTAL SPLIT', cost: 40 },
];

const INCENTIVES_CATALOG = [
  { id: 'coffee-cozy', name: 'LUMON COFFEE COZY', cost: 50, type: 'skin', desc: 'REHYDRATE UNIT SKIN' },
  { id: 'melon-bar', name: 'THE MELON BAR', cost: 100, type: 'palette', desc: 'PASTEL ACCENT PALETTE' },
  { id: 'egg-bar', name: 'PRE-WAFFLE EGG BAR', cost: 200, type: 'consumable', desc: 'FREEZE COMPLIANCE DECAY 24H' },
  { id: 'laser-crystal', name: 'LASER-ETCHED CRYSTAL', cost: 350, type: 'cosmetic', desc: 'REFINER OF THE QUARTER' },
];

const DEFAULT_STATE = {
  subject: {
    subjectNumber: 4229,
    cumulativeQuota: 0,
    allocationCredits: 0,
    refinementTier: 0,
    prestigeMultiplier: 1,
    filesCompleted: 0,
  },
  fileState: {
    fileNumber: 1,
    quota: 0,
    milestonesHit: [],
  },
  metrics: {
    fluidEfficiency: 100,
    quotaProgression: 100,
    complianceStanding: 100,
  },
  dailyLog: {
    date: null,
    fluidIntakeMl: 0,
    activityUnits: 0,
    complianceDoseAt: null,
    compliancePenaltyApplied: false,
    quotasAwarded: 0,
  },
  incentives: {
    inventory: [],
    activeSkin: null,
    complianceFreezeUntil: null,
    fingerTrapTaps: 0,
  },
  lastSavedAt: new Date().toISOString(),
  unlockedPalettes: ['lumon-default'],
  unlockedGeometries: ['hex-core'],
  activePalette: 'lumon-default',
  activeGeometry: 'hex-core',
  sync: {
    enabled: false,
    code: null,
    apiBase: '',
    contentHash: null,
    lastPushedAt: null,
    lastPulledAt: null,
  },
};

let state = null;
let debugTimeOverride = null;
let pushDebounceTimer = null;
let pendingConflict = null;
let mdeTimer = null;
let waffleTimer = null;
let prestigeInProgress = false;

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function todayKey() {
  const d = now();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

function subjectId() {
  return String(state.subject.subjectNumber);
}

function fileProgressPct() {
  return clamp((state.fileState.quota / FILE_TARGET) * 100, 0, 100);
}

function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object'
    ) {
      out[key] = deepMerge(target[key], source[key]);
    } else if (source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out;
}

function migrateState(raw) {
  if (!raw) return structuredClone(DEFAULT_STATE);

  if (raw.hydration !== undefined || raw.pet !== undefined) {
    return structuredClone(DEFAULT_STATE);
  }

  const merged = deepMerge(structuredClone(DEFAULT_STATE), raw);

  if (merged.subject.id && !merged.subject.subjectNumber) {
    merged.subject.subjectNumber = parseInt(merged.subject.id, 10) || 4229;
  }
  delete merged.subject.id;

  if (!merged.fileState) {
    merged.fileState = { fileNumber: 1, quota: 0, milestonesHit: [] };
  }
  if (!merged.incentives) {
    merged.incentives = structuredClone(DEFAULT_STATE.incentives);
  }
  if (!merged.subject.prestigeMultiplier) {
    merged.subject.prestigeMultiplier = 1;
  }
  if (!merged.subject.filesCompleted) {
    merged.subject.filesCompleted = 0;
  }

  return merged;
}

export function loadState() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('reset') === '1') {
    localStorage.removeItem(STATE_KEY);
  }
  if (params.get('debugTime')) {
    debugTimeOverride = params.get('debugTime');
  }
  const syncApi = params.get('syncApi');
  if (syncApi) {
    const parsed = loadStateFromStorage();
    parsed.sync.apiBase = syncApi;
    return parsed;
  }

  try {
    const raw = localStorage.getItem(STATE_KEY);
    return migrateState(raw ? JSON.parse(raw) : null);
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function loadStateFromStorage() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return migrateState(raw ? JSON.parse(raw) : null);
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
      const passphrase = document.getElementById('archival-passphrase')?.value || '';
      await pushState(state, passphrase);
      updateArchivalStatus('LAST TRANSMITTED: ' + new Date().toLocaleTimeString());
    } catch (err) {
      updateArchivalStatus('TRANSMIT ERROR: ' + err.message);
    }
  }, 2000);
}

function isComplianceFrozen(s = state) {
  const until = s?.incentives?.complianceFreezeUntil;
  return until && new Date(until) > new Date();
}

export function applyElapsedTime(s, elapsedMs) {
  if (elapsedMs <= 0) return;

  const blocks = elapsedMs / FOUR_HOURS_MS;
  s.metrics.fluidEfficiency = clamp(
    s.metrics.fluidEfficiency * Math.pow(0.85, blocks),
    0,
    100
  );

  if (!isComplianceFrozen(s)) {
    const hours = elapsedMs / (60 * 60 * 1000);
    if (s.metrics.fluidEfficiency < 30) {
      s.metrics.complianceStanding = clamp(
        s.metrics.complianceStanding - hours,
        0,
        100
      );
    }
  }
}

function evaluateQuotaTargets(log) {
  const awards = { quota: 0, credits: 0 };
  const flags = log.quotasAwarded || 0;
  let newFlags = flags;

  if (!(flags & QUOTA_FLAGS.FLUID) && log.fluidIntakeMl >= 2000) {
    awards.quota += 25;
    awards.credits += 5;
    newFlags |= QUOTA_FLAGS.FLUID;
  }
  if (!(flags & QUOTA_FLAGS.ACTIVITY) && log.activityUnits >= 8000) {
    awards.quota += 25;
    awards.credits += 5;
    newFlags |= QUOTA_FLAGS.ACTIVITY;
  }

  const doseTime = log.complianceDoseAt ? new Date(log.complianceDoseAt) : null;
  const doseDateKey = doseTime
    ? `${doseTime.getFullYear()}-${String(doseTime.getMonth() + 1).padStart(2, '0')}-${String(doseTime.getDate()).padStart(2, '0')}`
    : null;
  const doseBeforeCutoff =
    doseTime &&
    doseDateKey === log.date &&
    doseTime.getHours() < 14;

  if (!(flags & QUOTA_FLAGS.DOSE) && doseBeforeCutoff) {
    awards.quota += 25;
    awards.credits += 5;
    newFlags |= QUOTA_FLAGS.DOSE;
  }

  const allThree =
    (newFlags & QUOTA_FLAGS.FLUID) &&
    (newFlags & QUOTA_FLAGS.ACTIVITY) &&
    (newFlags & QUOTA_FLAGS.DOSE);
  if (!(flags & QUOTA_FLAGS.FULL_DAY) && allThree) {
    awards.quota += 25;
    awards.credits += 5;
    newFlags |= QUOTA_FLAGS.FULL_DAY;
  }

  log.quotasAwarded = newFlags;
  return awards;
}

function addQuotaXp(amount) {
  if (amount <= 0 || prestigeInProgress) return;
  const boosted = Math.round(amount * state.subject.prestigeMultiplier);
  state.subject.cumulativeQuota += boosted;
  state.fileState.quota += boosted;
  checkMilestones();
  if (state.fileState.quota >= FILE_TARGET) {
    completeFile();
  }
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
  if (ms.id === 'mde') {
    triggerMDE();
  }
}

function triggerMDE() {
  const overlay = document.getElementById('mde-overlay');
  const node = document.getElementById('mdr-data-node');
  overlay.classList.remove('hidden');
  node.classList.add('mde-active');
  clearTimeout(mdeTimer);
  mdeTimer = setTimeout(() => {
    overlay.classList.add('hidden');
    node.classList.remove('mde-active');
  }, 60_000);
}

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
  const nextEl = document.getElementById('waffle-subject-next');
  const nextNum = state.subject.subjectNumber + 1;
  nextEl.textContent = `NEXT ASSIGNMENT: SUBJECT #${nextNum}`;
  overlay.classList.remove('hidden');

  clearTimeout(waffleTimer);
  waffleTimer = setTimeout(() => {
    overlay.classList.add('hidden');
    applyPrestigeCycle();
    prestigeInProgress = false;
    saveState();
    render();
  }, 4500);
}

function applyPrestigeCycle() {
  state.subject.subjectNumber += 1;
  state.subject.filesCompleted += 1;
  state.subject.prestigeMultiplier = Math.round(state.subject.prestigeMultiplier * 1.5 * 10) / 10;

  state.metrics.fluidEfficiency = 100;
  state.metrics.quotaProgression = 100;
  state.metrics.complianceStanding = 100;

  state.dailyLog = {
    date: todayKey(),
    fluidIntakeMl: 0,
    activityUnits: 0,
    complianceDoseAt: null,
    compliancePenaltyApplied: false,
    quotasAwarded: 0,
  };

  state.fileState = {
    fileNumber: state.subject.filesCompleted + 1,
    quota: 0,
    milestonesHit: [],
  };
}

export function checkMidnightReset(s) {
  const today = todayKey();
  if (!s.dailyLog.date) {
    s.dailyLog.date = today;
    return;
  }
  if (s.dailyLog.date === today) return;

  const awards = evaluateQuotaTargets(s.dailyLog);
  s.subject.allocationCredits += awards.credits;
  addQuotaXp(awards.quota);

  s.dailyLog = {
    date: today,
    fluidIntakeMl: 0,
    activityUnits: 0,
    complianceDoseAt: null,
    compliancePenaltyApplied: false,
    quotasAwarded: 0,
  };
}

export function checkComplianceGrace(s) {
  const advisory = document.getElementById('compliance-advisory');
  const doseTaken = !!s.dailyLog.complianceDoseAt;

  if (doseTaken) {
    advisory.classList.add('hidden');
    advisory.textContent = '';
    return;
  }

  const minutes = now().getHours() * 60 + now().getMinutes();

  if (minutes >= 14 * 60 && !s.dailyLog.compliancePenaltyApplied && !isComplianceFrozen()) {
    s.metrics.complianceStanding = clamp(s.metrics.complianceStanding - 20, 0, 100);
    s.dailyLog.compliancePenaltyApplied = true;
  }

  if (minutes >= 11 * 60 && minutes < 14 * 60) {
    advisory.textContent = 'COMPLIANCE DOSE OVERDUE — ADMINISTRATION REQUIRED';
    advisory.classList.remove('hidden');
  } else if (minutes >= 14 * 60) {
    advisory.textContent = 'COMPLIANCE BREACH — STANDING REDUCED';
    advisory.classList.remove('hidden');
  } else {
    advisory.classList.add('hidden');
    advisory.textContent = '';
  }
}

export function deriveNodeState(s) {
  const { fluidEfficiency, quotaProgression, complianceStanding } = s.metrics;
  const penalty = s.dailyLog.compliancePenaltyApplied;

  if (complianceStanding < 25 || penalty) return 'noncompliant';
  if (fluidEfficiency < 30) return 'depleted';
  if (quotaProgression < 30) return 'underutilized';
  if (fluidEfficiency >= 60 && quotaProgression >= 60 && complianceStanding >= 60 && !penalty) {
    return 'optimal';
  }
  return 'baseline';
}

function deriveAvatarStage() {
  if (state.fileState.milestonesHit.includes('caricature')) {
    return { id: 'caricature', label: 'CUSTOM CARICATURE' };
  }
  const xp = state.subject.cumulativeQuota;
  let stage = AVATAR_STAGES[0];
  for (const s of AVATAR_STAGES) {
    if (xp >= s.minXp) stage = s;
  }
  return stage;
}

export function recalculateRefinementTier(s) {
  const q = s.subject.cumulativeQuota;
  let tier = 0;
  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (q >= TIER_THRESHOLDS[i]) {
      tier = i;
      break;
    }
  }
  const prev = s.subject.refinementTier;
  s.subject.refinementTier = tier;
  return tier !== prev;
}

export function rehydrateUnit(ml) {
  const amount = Number(ml) || Number(document.getElementById('fluid-intake-input').value) || 250;
  if (amount <= 0) return;

  state.dailyLog.fluidIntakeMl += amount;
  state.metrics.fluidEfficiency = clamp(state.metrics.fluidEfficiency + amount / 50, 0, 100);
  evaluateDailyQuotas();
  saveState();
  tick(false);
}

export function logPhysicalActivity(units) {
  const amount =
    Number(units) || Number(document.getElementById('activity-units-input').value) || 1000;
  if (amount <= 0) return;

  state.dailyLog.activityUnits += amount;
  state.metrics.quotaProgression = clamp(
    state.metrics.quotaProgression + amount / 200,
    0,
    100
  );
  evaluateDailyQuotas();
  saveState();
  tick(false);
}

export function administerComplianceDose() {
  state.dailyLog.complianceDoseAt = new Date().toISOString();
  state.metrics.complianceStanding = clamp(state.metrics.complianceStanding + 15, 0, 100);

  const minutes = now().getHours() * 60 + now().getMinutes();
  if (minutes >= 14 * 60 && state.dailyLog.compliancePenaltyApplied) {
    state.metrics.complianceStanding = clamp(state.metrics.complianceStanding + 5, 0, 100);
  }

  evaluateDailyQuotas();
  saveState();
  tick(false);
}

function evaluateDailyQuotas() {
  const awards = evaluateQuotaTargets(state.dailyLog);
  state.subject.allocationCredits += awards.credits;
  addQuotaXp(awards.quota);
}

function updateMetricBar(id, valueId, value, label) {
  const bar = document.getElementById(id);
  const fill = bar.querySelector('.metric-bar-fill');
  const pct = Math.round(value);
  fill.style.setProperty('--fill', `${pct}%`);
  fill.style.width = `${pct}%`;
  bar.setAttribute('aria-valuenow', String(pct));
  bar.setAttribute('aria-label', `${label}: ${pct} percent`);
  document.getElementById(valueId).textContent = `${pct}%`;
}

function renderScatterCloud() {
  const cloud = document.getElementById('scatter-cloud');
  if (!cloud) return;
  cloud.innerHTML = '';
  const digits = '0123456789';
  for (let i = 0; i < 18; i++) {
    const span = document.createElement('span');
    span.className = 'scatter-digit';
    span.textContent = digits[Math.floor(Math.random() * 10)];
    span.style.left = `${10 + Math.random() * 80}%`;
    span.style.top = `${10 + Math.random() * 80}%`;
    span.style.animationDelay = `${Math.random() * 0.4}s`;
    cloud.appendChild(span);
  }
}

function renderAvatarLayers(stageId) {
  const layers = {
    raw: document.getElementById('avatar-raw'),
    fenced: document.getElementById('avatar-fenced'),
    singularity: document.getElementById('avatar-singularity'),
    caricature: document.getElementById('avatar-caricature'),
  };
  for (const [id, el] of Object.entries(layers)) {
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
      g.innerHTML += `<line x1="${i}" y1="15" x2="${i}" y2="85" />`;
      g.innerHTML += `<line x1="15" y1="${i}" x2="85" y2="${i}" />`;
    }
  } else if (geometry === 'diamond-matrix') {
    g.innerHTML = `
      <rect x="25" y="25" width="50" height="50" transform="rotate(45 50 50)" />
      <rect x="35" y="35" width="30" height="30" transform="rotate(45 50 50)" />
    `;
  } else if (geometry === 'fractal-split') {
    g.innerHTML = `
      <line x1="25" y1="25" x2="75" y2="75" />
      <line x1="75" y1="25" x2="25" y2="75" />
      <line x1="50" y1="25" x2="50" y2="75" />
      <line x1="25" y1="50" x2="75" y2="50" />
      <rect x="40" y="40" width="20" height="20" />
    `;
  }
}

function renderMilestones() {
  const pct = fileProgressPct();
  document.querySelectorAll('.milestone').forEach((el) => {
    const threshold = Number(el.dataset.milestone);
    const hit = state.fileState.milestonesHit.some((id) => {
      const ms = MILESTONES.find((m) => m.id === id);
      return ms && ms.pct === threshold;
    });
    el.classList.toggle('unlocked', hit || pct >= threshold);
  });

  const badges = document.getElementById('inventory-badges');
  const badgeIds = [
    ...state.fileState.milestonesHit.map((id) => MILESTONES.find((m) => m.id === id)?.badge).filter(Boolean),
    ...state.incentives.inventory.map((id) => INCENTIVES_CATALOG.find((i) => i.id === id)?.name.split(' ')[0]),
  ];
  badges.innerHTML = [...new Set(badgeIds)]
    .map((b) => `<span class="badge">${b}</span>`)
    .join('');
}

function renderIncentives() {
  const el = document.getElementById('incentives-catalog');
  if (!el) return;

  el.innerHTML = INCENTIVES_CATALOG.map((item) => {
    const owned = state.incentives.inventory.includes(item.id);
    const active =
      (item.id === 'coffee-cozy' && state.incentives.activeSkin === 'coffee-cozy') ||
      (item.id === 'melon-bar' && state.activePalette === 'melon-bar');
    const canBuy = state.subject.allocationCredits >= item.cost;
    let btn = '';
    if (owned) {
      if (item.type === 'skin' || item.type === 'palette') {
        btn = active
          ? '<span class="catalog-item-info">EQUIPPED</span>'
          : `<button type="button" data-equip-incentive="${item.id}">EQUIP</button>`;
      } else if (item.type === 'consumable') {
        btn = `<button type="button" data-use-incentive="${item.id}">CONSUME</button>`;
      } else {
        btn = '<span class="catalog-item-info">ACQUIRED</span>';
      }
    } else {
      btn = `<button type="button" data-buy-incentive="${item.id}" ${canBuy ? '' : 'disabled'}>ACQUIRE — ${item.cost}</button>`;
    }
    return `<div class="catalog-item ${active ? 'active' : ''}">
      <span class="catalog-item-info">${item.name} — ${item.cost} CR<br><small>${item.desc}</small></span>
      ${btn}
    </div>`;
  }).join('');
}

function renderProcurement() {
  const paletteEl = document.getElementById('palette-catalog');
  const geometryEl = document.getElementById('geometry-catalog');
  if (!paletteEl || !geometryEl) return;

  paletteEl.innerHTML = PALETTE_CATALOG.map((item) => {
    const owned = state.unlockedPalettes.includes(item.id);
    const active = state.activePalette === item.id;
    const canBuy = state.subject.allocationCredits >= item.cost;
    const btn = owned
      ? active
        ? '<span class="catalog-item-info">EQUIPPED</span>'
        : `<button type="button" data-equip-palette="${item.id}">EQUIP</button>`
      : `<button type="button" data-buy-palette="${item.id}" ${canBuy ? '' : 'disabled'}>ACQUIRE — ${item.cost}</button>`;
    return `<div class="catalog-item ${active ? 'active' : ''}">
      <span class="catalog-item-info">${item.name}${item.cost ? ' — ' + item.cost + ' CREDITS' : ''}</span>
      ${btn}
    </div>`;
  }).join('');

  geometryEl.innerHTML = GEOMETRY_CATALOG.map((item) => {
    const owned = state.unlockedGeometries.includes(item.id);
    const active = state.activeGeometry === item.id;
    const canBuy = state.subject.allocationCredits >= item.cost;
    const btn = owned
      ? active
        ? '<span class="catalog-item-info">EQUIPPED</span>'
        : `<button type="button" data-equip-geometry="${item.id}">EQUIP</button>`
      : `<button type="button" data-buy-geometry="${item.id}" ${canBuy ? '' : 'disabled'}>ACQUIRE — ${item.cost}</button>`;
    return `<div class="catalog-item ${active ? 'active' : ''}">
      <span class="catalog-item-info">${item.name}${item.cost ? ' — ' + item.cost + ' CREDITS' : ''}</span>
      ${btn}
    </div>`;
  }).join('');
}

function render() {
  document.documentElement.dataset.palette = state.activePalette;
  document.body.dataset.skin = state.incentives.activeSkin || '';

  document.getElementById('subject-designation').textContent = `SUBJECT #${subjectId()}`;
  document.getElementById('refinement-tier').textContent =
    `TIER: ${TIER_NAMES[state.subject.refinementTier]}`;
  document.getElementById('prestige-multiplier').textContent =
    `MULTIPLIER: ×${state.subject.prestigeMultiplier.toFixed(1)}`;
  document.getElementById('quota-cumulative').textContent =
    `LIFETIME XP: ${String(state.subject.cumulativeQuota).padStart(4, '0')}`;
  document.getElementById('allocation-credits').textContent =
    `CREDITS: ${String(state.subject.allocationCredits).padStart(4, '0')}`;

  const filePct = Math.round(fileProgressPct());
  document.getElementById('file-designation').textContent =
    `FILE-${String(state.fileState.fileNumber).padStart(4, '0')}`;
  document.getElementById('file-progress-fill').style.width = `${filePct}%`;
  document.getElementById('file-progress-bar').setAttribute('aria-valuenow', String(filePct));
  document.getElementById('file-progress-value').textContent = `${filePct}% REFINED`;

  updateMetricBar('fluid-efficiency-bar', 'fluid-efficiency-value', state.metrics.fluidEfficiency, 'Fluid efficiency');
  updateMetricBar('quota-progression-bar', 'quota-progression-value', state.metrics.quotaProgression, 'Quota progression');
  updateMetricBar('compliance-standing-bar', 'compliance-standing-value', state.metrics.complianceStanding, 'Compliance standing');

  document.getElementById('fluid-intake-today').textContent = state.dailyLog.fluidIntakeMl;
  document.getElementById('activity-units-today').textContent = state.dailyLog.activityUnits;

  const doseEl = document.getElementById('compliance-dose-time');
  doseEl.textContent = state.dailyLog.complianceDoseAt
    ? new Date(state.dailyLog.complianceDoseAt).toLocaleString()
    : 'NOT RECORDED';

  const freezeNotice = document.getElementById('compliance-freeze-notice');
  if (isComplianceFrozen()) {
    freezeNotice.classList.remove('hidden');
  } else {
    freezeNotice.classList.add('hidden');
  }

  const avatar = deriveAvatarStage();
  const node = document.getElementById('mdr-data-node');
  node.dataset.avatarStage = avatar.id;
  node.dataset.state = deriveNodeState(state);
  node.dataset.tier = String(state.subject.refinementTier);
  node.dataset.geometry = state.activeGeometry;
  document.getElementById('avatar-temper-label').textContent = `TEMPER: ${avatar.label}`;
  document.getElementById('mdr-status-label').textContent = NODE_STATUS[node.dataset.state];

  renderAvatarLayers(avatar.id);
  renderGeometryExtras(state.activeGeometry);
  renderMilestones();
  renderIncentives();
  renderProcurement();

  const fingerTrap = document.getElementById('finger-trap-widget');
  if (state.fileState.milestonesHit.includes('finger-trap')) {
    fingerTrap.classList.remove('hidden');
    document.getElementById('finger-trap-count').textContent = state.incentives.fingerTrapTaps;
  } else {
    fingerTrap.classList.add('hidden');
  }

  const crystal = document.getElementById('laser-crystal-footer');
  if (state.incentives.inventory.includes('laser-crystal')) {
    crystal.classList.remove('hidden');
    crystal.setAttribute('aria-hidden', 'false');
  } else {
    crystal.classList.add('hidden');
    crystal.setAttribute('aria-hidden', 'true');
  }

  document.getElementById('archival-enabled').checked = state.sync.enabled;
  document.getElementById('archival-endpoint').value = state.sync.apiBase || '';
  document.getElementById('archival-hash').textContent = state.sync.code || '—';
}

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
    setTimeout(() => node.classList.remove('tier-flash'), 300);
  }
}

function openDrawer(id) {
  document.getElementById(id).classList.remove('hidden');
  document.getElementById('drawer-backdrop').classList.remove('hidden');
}

function closeDrawers() {
  document.getElementById('incentives-drawer').classList.add('hidden');
  document.getElementById('procurement-drawer').classList.add('hidden');
  document.getElementById('archival-sync-panel').classList.add('hidden');
  document.getElementById('drawer-backdrop').classList.add('hidden');
}

function acquirePalette(id) {
  const item = PALETTE_CATALOG.find((p) => p.id === id);
  if (!item || state.unlockedPalettes.includes(id)) return;
  if (state.subject.allocationCredits < item.cost) return;
  state.subject.allocationCredits -= item.cost;
  state.unlockedPalettes.push(id);
  state.activePalette = id;
  saveState();
  render();
}

function acquireGeometry(id) {
  const item = GEOMETRY_CATALOG.find((g) => g.id === id);
  if (!item || state.unlockedGeometries.includes(id)) return;
  if (state.subject.allocationCredits < item.cost) return;
  state.subject.allocationCredits -= item.cost;
  state.unlockedGeometries.push(id);
  state.activeGeometry = id;
  saveState();
  render();
}

function acquireIncentive(id) {
  const item = INCENTIVES_CATALOG.find((i) => i.id === id);
  if (!item || state.incentives.inventory.includes(id)) return;
  if (state.subject.allocationCredits < item.cost) return;
  state.subject.allocationCredits -= item.cost;
  state.incentives.inventory.push(id);
  if (item.type === 'skin') state.incentives.activeSkin = id;
  if (item.type === 'palette') {
    state.activePalette = 'melon-bar';
    if (!state.unlockedPalettes.includes('melon-bar')) {
      state.unlockedPalettes.push('melon-bar');
    }
  }
  if (item.type === 'cosmetic') {
    /* laser crystal shows via render */
  }
  saveState();
  render();
}

function equipIncentive(id) {
  const item = INCENTIVES_CATALOG.find((i) => i.id === id);
  if (!item || !state.incentives.inventory.includes(id)) return;
  if (item.type === 'skin') {
    state.incentives.activeSkin = state.incentives.activeSkin === id ? null : id;
  }
  if (item.id === 'melon-bar') {
    state.activePalette = state.activePalette === 'melon-bar' ? 'lumon-default' : 'melon-bar';
  }
  saveState();
  render();
}

function useIncentive(id) {
  if (id !== 'egg-bar' || !state.incentives.inventory.includes(id)) return;
  const until = new Date();
  until.setHours(until.getHours() + 24);
  state.incentives.complianceFreezeUntil = until.toISOString();
  saveState();
  render();
}

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
    const passphrase = document.getElementById('archival-passphrase')?.value || '';
    const result = await syncNow(state, passphrase, () => showConflictModal());
    if (result.action === 'applied' && result.state) {
      state = migrateState(result.state);
      state.sync.enabled = true;
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    }
  } catch (err) {
    updateArchivalStatus('ARCHIVAL ERROR: ' + err.message);
  }
}

function bindEventListeners() {
  document.getElementById('btn-rehydrate-250').addEventListener('click', () => rehydrateUnit(250));
  document.getElementById('btn-rehydrate-500').addEventListener('click', () => rehydrateUnit(500));
  document.getElementById('btn-rehydrate-unit').addEventListener('click', () => rehydrateUnit());
  document.getElementById('btn-log-activity').addEventListener('click', () => logPhysicalActivity());
  document.getElementById('btn-administer-dose').addEventListener('click', administerComplianceDose);

  document.querySelectorAll('.activity-preset').forEach((btn) => {
    btn.addEventListener('click', () => logPhysicalActivity(Number(btn.dataset.units)));
  });

  document.getElementById('btn-incentives').addEventListener('click', () => openDrawer('incentives-drawer'));
  document.getElementById('btn-procurement').addEventListener('click', () => openDrawer('procurement-drawer'));
  document.getElementById('btn-archival').addEventListener('click', () => openDrawer('archival-sync-panel'));
  document.getElementById('btn-close-incentives').addEventListener('click', closeDrawers);
  document.getElementById('btn-close-procurement').addEventListener('click', closeDrawers);
  document.getElementById('btn-close-archival').addEventListener('click', closeDrawers);
  document.getElementById('drawer-backdrop').addEventListener('click', closeDrawers);

  document.getElementById('btn-finger-trap')?.addEventListener('click', () => {
    state.incentives.fingerTrapTaps += 1;
    saveState();
    render();
  });

  document.getElementById('incentives-catalog').addEventListener('click', (e) => {
    const buy = e.target.dataset.buyIncentive;
    const equip = e.target.dataset.equipIncentive;
    const use = e.target.dataset.useIncentive;
    if (buy) acquireIncentive(buy);
    if (equip) equipIncentive(equip);
    if (use) useIncentive(use);
  });

  document.getElementById('palette-catalog').addEventListener('click', (e) => {
    const buy = e.target.dataset.buyPalette;
    const equip = e.target.dataset.equipPalette;
    if (buy) acquirePalette(buy);
    if (equip) {
      state.activePalette = equip;
      saveState();
      render();
    }
  });

  document.getElementById('geometry-catalog').addEventListener('click', (e) => {
    const buy = e.target.dataset.buyGeometry;
    const equip = e.target.dataset.equipGeometry;
    if (buy) acquireGeometry(buy);
    if (equip) {
      state.activeGeometry = equip;
      saveState();
      render();
    }
  });

  document.getElementById('archival-enabled').addEventListener('change', (e) => {
    state.sync.enabled = e.target.checked;
    saveState();
  });

  document.getElementById('archival-endpoint').addEventListener('change', (e) => {
    state.sync.apiBase = e.target.value.trim();
    saveState();
  });

  document.getElementById('btn-copy-hash').addEventListener('click', async () => {
    if (state.sync.code) {
      await navigator.clipboard.writeText(state.sync.code);
      updateArchivalStatus('HASH COPIED TO CLIPBOARD');
    }
  });

  document.getElementById('btn-regenerate-hash').addEventListener('click', async () => {
    state.sync.code = await generateSyncCode();
    saveState();
    render();
    updateArchivalStatus('NEW ARCHIVAL HASH GENERATED');
  });

  document.getElementById('btn-transmit-record').addEventListener('click', async () => {
    try {
      if (!state.sync.code) {
        state.sync.code = await generateSyncCode();
      }
      state.sync.enabled = true;
      state.sync.apiBase = document.getElementById('archival-endpoint').value.trim();
      const passphrase = document.getElementById('archival-passphrase').value;
      const result = await syncNow(state, passphrase, () => showConflictModal());
      if (result.action === 'applied' && result.state) {
        state = migrateState(result.state);
      }
      saveState();
      render();
      updateArchivalStatus('RECORD TRANSMITTED — ' + new Date().toLocaleTimeString());
    } catch (err) {
      updateArchivalStatus('TRANSMIT ERROR: ' + err.message);
    }
  });

  document.getElementById('btn-retain-local').addEventListener('click', () => {
    document.getElementById('conflict-modal').classList.add('hidden');
    pendingConflict?.('local');
    pendingConflict = null;
  });

  document.getElementById('btn-accept-archival').addEventListener('click', () => {
    document.getElementById('conflict-modal').classList.add('hidden');
    pendingConflict?.('remote');
    pendingConflict = null;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) tick();
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch {
    /* offline shell optional in dev */
  }
}

async function init() {
  state = loadState();

  if (!state.dailyLog.date) {
    state.dailyLog.date = todayKey();
  }

  await initArchivalPull();

  if (state.lastSavedAt) {
    const elapsedMs = Date.now() - new Date(state.lastSavedAt).getTime();
    applyElapsedTime(state, elapsedMs);
  }

  checkMidnightReset(state);
  checkComplianceGrace(state);
  recalculateRefinementTier(state);
  render();
  bindEventListeners();
  setInterval(() => tick(), 60_000);

  registerServiceWorker();
}

init();
