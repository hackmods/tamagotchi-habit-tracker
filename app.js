import {
  FILE_TARGET,
  computeAvatarVisuals,
  deriveAvatarStage as deriveAvatarStageFromState,
  deriveAvatarUnlocks as deriveAvatarUnlocksFromState,
  fileProgressPct as fileProgressPctFromQuota,
  formatFileBadge,
} from './avatar.js';
import {
  applyAmbientSustenancePause,
  createAmbientScheduler,
  COOLDOWN_MS,
} from './ambient.js';
import {
  setAudioEnabled,
  setDeskAudioActive,
  notifyAudioVisibility,
  playIntercomChirp,
} from './audio.js';
import {
  AFTERNOON_ADVISORY_H,
  AFTERNOON_CUTOFF_H,
  MORNING_ADVISORY_H,
  MORNING_CUTOFF_H,
  applyElapsedTime as applyElapsedTimeCore,
  clamp,
  dateKeyOf,
  deriveNodeState as deriveNodeStateCore,
  deriveProtocolChecklist,
  deriveTempers as deriveTempersCore,
  evaluateQuotaTargets,
  isComplianceFrozen as isComplianceFrozenCore,
  protocolChecklistSummary,
  recalculateRefinementTier as recalculateRefinementTierCore,
} from './engine.js';
import {
  generateSyncCode,
  pushState,
  syncNow,
} from './sync.js';

/* ═══════════════════════════════════════════════════════════════════
   LUMON INNIE-CAM — application logic
   View layer rebuilt for the office-scene / zoom-to-terminal model.
   The state engine (localStorage, delta-time decay, quota/XP/prestige,
   tempers, incentives) is preserved end-to-end.
═══════════════════════════════════════════════════════════════════ */

const STATE_KEY        = 'lumon-compliance-state';

const TIER_NAMES      = ['UNINITIALIZED','ACTIVE REFINEMENT','ELEVATED THROUGHPUT','FULL COMPLIANCE'];

const MILESTONES = [
  { pct:10,  id:'eraser',      name:'LUMON ERASER', badge:'ERASER' },
  { pct:25,  id:'finger-trap', name:'FINGER TRAP',  badge:'TRAP'   },
  { pct:75,  id:'mde',         name:'MDE',          badge:'MDE'    },
  { pct:100, id:'caricature',  name:'CARICATURE',   badge:'FACE'   },
];

const NODE_STATUS = {
  baseline:'NODE: BASELINE — NUMBERS NOMINAL',
  optimal:'NODE: OPTIMAL THROUGHPUT',
  depleted:'NODE: SUSTENANCE / FLUID DEPLETION',
  noncompliant:'NODE: COMPLIANCE BREACH — STANDING AT RISK',
  underutilized:'NODE: QUOTA UNDERUTILIZATION',
};
const CAM_STATUS = {
  baseline:'STATUS: NOMINAL',
  optimal:'STATUS: OPTIMAL THROUGHPUT',
  depleted:'STATUS: DEPLETION — RETURN TO PROTOCOLS',
  noncompliant:'STATUS: BREACH',
  underutilized:'STATUS: UNDERUTILIZED',
};
const TEMPER_NAMES = { woe:'WOE', frolic:'FROLIC', dread:'DREAD', malice:'MALICE' };

const PALETTE_CATALOG = [
  { id:'lumon-default', name:'LUMON STANDARD',         cost:0  },
  { id:'breakroom',     name:'BREAK ROOM PALETTE',     cost:30 },
  { id:'wellness',      name:'WELLNESS FLOOR PALETTE', cost:30 },
  { id:'severed',       name:'SEVERED WING PALETTE',   cost:50 },
];
const GEOMETRY_CATALOG = [
  { id:'hex-core',      name:'HEX CORE',       cost:0  },
  { id:'grid-lattice',  name:'GRID LATTICE',   cost:20 },
  { id:'diamond-matrix',name:'DIAMOND MATRIX', cost:40 },
  { id:'fractal-split', name:'FRACTAL SPLIT',  cost:40 },
];
const INCENTIVES_CATALOG = [
  { id:'coffee-cozy',   name:'LUMON COFFEE COZY',    cost:50,  type:'skin',       desc:'HYDRATE BUTTON SKIN'            },
  { id:'melon-bar',     name:'THE MELON BAR',         cost:100, type:'palette',    desc:'PASTEL PINK/GREEN PALETTE'      },
  { id:'egg-bar',       name:'PRE-WAFFLE EGG BAR',    cost:200, type:'consumable', desc:'FREEZE DECAY FOR 24 HRS'        },
  { id:'laser-crystal', name:'LASER-ETCHED CRYSTAL',  cost:350, type:'cosmetic',   desc:'REFINER OF THE QUARTER TROPHY'  },
];

const DEFAULT_STATE = {
  subject: { subjectNumber:4229, cumulativeQuota:0, allocationCredits:0, refinementTier:0, prestigeMultiplier:1, filesCompleted:0 },
  fileState: { fileNumber:1, quota:0, milestonesHit:[] },
  metrics: { fluidEfficiency:100, quotaProgression:100, complianceStanding:100, sustenanceLevel:100 },
  dailyLog: {
    date:null, fluidIntakeMl:0, activityUnits:0, sustenanceUnits:0,
    morningDoseAt:null, morningPenaltyApplied:false,
    complianceDoseAt:null, compliancePenaltyApplied:false,
    sustenanceWarned:false, quotasAwarded:0,
  },
  incentives: { inventory:[], activeSkin:null, complianceFreezeUntil:null, fingerTrapTaps:0 },
  onboardingComplete:false,
  lastSavedAt:new Date().toISOString(),
  unlockedPalettes:['lumon-default'], unlockedGeometries:['hex-core'],
  activePalette:'lumon-default', activeGeometry:'hex-core',
  sync: { enabled:false, code:null, apiBase:'', contentHash:null, lastPushedAt:null, lastPulledAt:null },
  ambient: { lastEventAt:null, lastEventId:null, sessionCount:0, dailyDate:null, dailyTiers:{ A:0, B:0, C:0 }, bCreditsToday:0, sustenancePauseUntil:null },
  kioskAwake: false,
  kioskFullscreen: false,
  ambientHintSeen: false,
  audioEnabled: false,
};

// ─── runtime globals ───────────────────────────────────────────────
let state = null;
let debugTimeOverride = null;
let pushDebounceTimer = null;
let pendingConflict = null;
let mdeTimer = null, mdeCountdownTimer = null, waffleTimer = null;
let burstTimer = null, digitTimer = null;
let prestigeInProgress = false;
let orientPage = 1;
let lastDominantTemper = null;
let activeTab = 'data-matrix';
let logSidebarOpen = true;
let crtHome = null;
let ambientScheduler = null;
let wakeLock = null;
let focusReturnEl = null;
let toastTimer = null;
const ORIENT_PAGES = 3;

const FIELD_ROWS = 6, FIELD_COLS = 13;
const CAM_ROWS = 4, CAM_COLS = 9;

const activityLog = [];
const MAX_LOG = 9;

// ─── helpers ───────────────────────────────────────────────────────
function rndDigit(){ return String(Math.floor(Math.random()*10)); }
function todayKey(){ return dateKeyOf(now()); }

function now(){
  if (debugTimeOverride){
    const [h,m] = debugTimeOverride.split(':').map(Number);
    const d = new Date(); d.setHours(h, m||0, 0, 0); return d;
  }
  return new Date();
}
function fmtTime(v){ const d = v instanceof Date ? v : new Date(v); return d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); }

function pushLog(text){
  activityLog.unshift({ ts: fmtTime(new Date()), text });
  if (activityLog.length > MAX_LOG) activityLog.pop();
  renderActivityLog();
}
function fileProgressPct(){ return fileProgressPctFromQuota(state.fileState.quota); }
function isComplianceFrozen(s = state){ return isComplianceFrozenCore(s, now()); }
function asciiBar(pct, width = 10){ const n = clamp(Math.round((pct/100)*width), 0, width); return '[' + '█'.repeat(n) + '░'.repeat(width-n) + ']'; }

function showToast(msg, { tone = 'dim', sticky = false } = {}){
  const el = document.getElementById('ambient-toast');
  if (!el) return;
  el.textContent = msg;
  el.dataset.tone = tone;
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => hideToast(), 6000);
  setCamChyron(msg);
}
function hideToast(){
  const el = document.getElementById('ambient-toast');
  if (!el) return;
  el.classList.add('hidden');
  el.setAttribute('aria-hidden', 'true');
}
function setCamChyron(msg){
  const el = document.getElementById('cam-chyron');
  if (!el || !msg) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}
function clearCamChyron(){
  const el = document.getElementById('cam-chyron');
  if (!el) return;
  el.classList.add('hidden');
  el.textContent = '';
}

function bumpIdle(){
  document.body.classList.remove('desk-idle');
  setCrtWorkingPresence(false);
  clearTimeout(idleTimer);
  if (document.body.dataset.view !== 'desk' || document.hidden) return;
  idleTimer = setTimeout(() => {
    if (document.body.dataset.view === 'desk') {
      document.body.classList.add('desk-idle');
      setCrtWorkingPresence(true);
    }
  }, IDLE_MS);
}

function setCrtWorkingPresence(active){
  const prompt = document.querySelector('#crt-idle-preview .crt-prompt');
  if (prompt) prompt.textContent = active ? '▶ REFINING…' : '▶ CLICK TO REFINE';
  // Faster digit churn while desk-idle only (still low CPU; independent of ambient cooldown)
  if (active) {
    if (digitTimer) { clearInterval(digitTimer); digitTimer = null; }
    digitTimer = setInterval(refreshDigits, 1100);
  } else if (!document.hidden) {
    if (digitTimer) { clearInterval(digitTimer); digitTimer = null; }
    digitTimer = setInterval(refreshDigits, 2200);
  }
}

function syncDeskAudio(){
  const onDesk = document.body.dataset.view === 'desk' && !document.hidden;
  setDeskAudioActive(onDesk && !!state?.audioEnabled);
}

async function engageKiosk(){
  state.kioskAwake = true;
  const fsToggle = document.getElementById('kiosk-fullscreen');
  if (fsToggle) state.kioskFullscreen = fsToggle.checked;
  saveState();
  document.body.classList.add('kiosk-awake');
  const quick = document.getElementById('btn-kiosk-quick');
  if (quick) quick.setAttribute('aria-pressed', 'true');
  await syncWakeLock();
  if (state.kioskFullscreen && document.documentElement.requestFullscreen) {
    try { await document.documentElement.requestFullscreen(); } catch { /* optional */ }
  }
  showToast('KIOSK PROTOCOL ENGAGED — STAY AT YOUR WORKSTATION', { tone: 'ok' });
  renderAmbientReport();
}
async function toggleKioskQuick(){
  if (state.kioskAwake) {
    state.kioskAwake = false;
    saveState();
    document.body.classList.remove('kiosk-awake');
    await syncWakeLock();
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* optional */ }
    }
    showToast('KIOSK PROTOCOL RELEASED', { tone: 'dim' });
  } else {
    await engageKiosk();
  }
  render();
}

function renderAmbientReport(){
  const lastEl = document.getElementById('ambient-report-last');
  const cdEl = document.getElementById('ambient-report-cooldown');
  const countsEl = document.getElementById('ambient-report-counts');
  if (!lastEl || !state?.ambient) return;
  const amb = state.ambient;
  lastEl.textContent = amb.lastEventId
    ? `LAST EVENT: ${amb.lastEventId.toUpperCase()} @ ${amb.lastEventAt ? fmtTime(amb.lastEventAt) : '—'}`
    : 'LAST EVENT: —';
  let cd = 'COOLDOWN: READY';
  if (amb.lastEventAt) {
    const remain = COOLDOWN_MS - (Date.now() - new Date(amb.lastEventAt).getTime());
    if (remain > 0) {
      const m = Math.ceil(remain / 60000);
      cd = `COOLDOWN: ${m} MIN REMAINING`;
    }
  }
  cdEl.textContent = cd;
  const t = amb.dailyTiers || { A:0, B:0, C:0 };
  countsEl.textContent = `TODAY A/B/C: ${t.A || 0} / ${t.B || 0} / ${t.C || 0}`;
}

function maybeShowAmbientHint(){
  if (state.ambientHintSeen || document.body.dataset.view !== 'desk') return;
  state.ambientHintSeen = true;
  saveState();
  setTimeout(() => {
    showToast('DEPARTMENTAL REMINDER — EVENTS ARE RARE. THE WORK IS MYSTERIOUS AND IMPORTANT.', { tone: 'dim' });
  }, 2500);
}

function trapFocus(container){
  const nodes = [...container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((n) => !n.disabled && n.offsetParent !== null);
  if (!nodes.length) return () => {};
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  function onKey(e){
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  }
  container.addEventListener('keydown', onKey);
  first.focus();
  return () => container.removeEventListener('keydown', onKey);
}
let releaseTerminalFocus = null;
let releaseOrientFocus = null;
let idleTimer = null;
const IDLE_MS = 90_000;

async function requestWakeLock(){
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { /* optional */ }
}
async function releaseWakeLock(){
  try { await wakeLock?.release(); } catch { /* optional */ }
  wakeLock = null;
}
async function syncWakeLock(){
  if (state?.kioskAwake && document.body.dataset.view === 'desk' && !document.hidden) await requestWakeLock();
  else await releaseWakeLock();
}

// ─── state management ──────────────────────────────────────────────
function deepMerge(target, source){
  const out = { ...target };
  for (const key of Object.keys(source)){
    if (source[key] && typeof source[key]==='object' && !Array.isArray(source[key]) && target[key] && typeof target[key]==='object'){
      out[key] = deepMerge(target[key], source[key]);
    } else if (source[key] !== undefined){ out[key] = source[key]; }
  }
  return out;
}

function migrateState(raw){
  if (!raw) return structuredClone(DEFAULT_STATE);
  if (raw.hydration !== undefined || raw.pet !== undefined) return structuredClone(DEFAULT_STATE);
  const m = deepMerge(structuredClone(DEFAULT_STATE), raw);
  if (m.subject.id && !m.subject.subjectNumber) m.subject.subjectNumber = parseInt(m.subject.id,10) || 4229;
  delete m.subject.id;
  if (!m.fileState)  m.fileState  = { ...DEFAULT_STATE.fileState };
  if (!m.incentives) m.incentives = { ...DEFAULT_STATE.incentives };
  if (!m.subject.prestigeMultiplier) m.subject.prestigeMultiplier = 1;
  if (!m.subject.filesCompleted)     m.subject.filesCompleted = 0;
  if (m.metrics.sustenanceLevel === undefined)        m.metrics.sustenanceLevel = 100;
  if (m.dailyLog.sustenanceUnits === undefined)       m.dailyLog.sustenanceUnits = 0;
  if (m.dailyLog.sustenanceWarned === undefined)      m.dailyLog.sustenanceWarned = false;
  if (m.dailyLog.morningDoseAt === undefined)         m.dailyLog.morningDoseAt = null;
  if (m.dailyLog.morningPenaltyApplied === undefined) m.dailyLog.morningPenaltyApplied = false;
  if (m.onboardingComplete === undefined)             m.onboardingComplete = false;
  if (!m.ambient) m.ambient = structuredClone(DEFAULT_STATE.ambient);
  if (m.kioskAwake === undefined) m.kioskAwake = false;
  if (m.kioskFullscreen === undefined) m.kioskFullscreen = false;
  if (m.ambientHintSeen === undefined) m.ambientHintSeen = false;
  if (m.audioEnabled === undefined) m.audioEnabled = false;
  return m;
}

export function loadState(){
  const params = new URLSearchParams(window.location.search);
  if (params.get('reset') === '1') localStorage.removeItem(STATE_KEY);
  if (params.get('debugTime')) debugTimeOverride = params.get('debugTime');
  const syncApi = params.get('syncApi');
  try {
    const raw = localStorage.getItem(STATE_KEY);
    const s = migrateState(raw ? JSON.parse(raw) : null);
    if (syncApi) s.sync.apiBase = syncApi;
    return s;
  } catch { return structuredClone(DEFAULT_STATE); }
}

export function saveState(){
  state.lastSavedAt = new Date().toISOString();
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
  schedulePush();
}

function schedulePush(){
  if (!state.sync?.enabled || !state.sync.code || !state.sync.apiBase) return;
  clearTimeout(pushDebounceTimer);
  pushDebounceTimer = setTimeout(async () => {
    try {
      const pw = document.getElementById('archival-passphrase')?.value || '';
      await pushState(state, pw);
      updateArchivalStatus('LAST TRANSMITTED: ' + fmtTime(new Date()));
    } catch (err){ updateArchivalStatus('TRANSMIT ERROR: ' + err.message); }
  }, 2000);
}

// ─── time decay (CORE) ─────────────────────────────────────────────
export function applyElapsedTime(s, elapsedMs){
  let fluidMs = elapsedMs;
  const pauseUntil = s.ambient?.sustenancePauseUntil;
  let sustenanceMs = elapsedMs;
  if (pauseUntil && new Date(pauseUntil) > now()) {
    sustenanceMs = applyAmbientSustenancePause(s, elapsedMs, now());
  }
  // Apply fluid/compliance on full elapsed; sustenance respects ambient pause via temporary override
  if (sustenanceMs === 0 && fluidMs > 0) {
    const sustenanceBackup = s.metrics.sustenanceLevel;
    applyElapsedTimeCore(s, fluidMs, now());
    s.metrics.sustenanceLevel = sustenanceBackup;
    return;
  }
  applyElapsedTimeCore(s, elapsedMs, now());
}

// ─── quota evaluation (CORE) ───────────────────────────────────────
function evaluateDailyQuotas(){
  const awards = evaluateQuotaTargets(state.dailyLog);
  state.subject.allocationCredits += awards.credits;
  addQuotaXp(awards.quota);
}

// ─── XP + file progression (CORE) ──────────────────────────────────
function addQuotaXp(amount){
  if (amount <= 0 || prestigeInProgress) return;
  const boosted = Math.round(amount * state.subject.prestigeMultiplier);
  state.subject.cumulativeQuota += boosted;
  state.fileState.quota         += boosted;
  checkMilestones();
  if (state.fileState.quota >= FILE_TARGET) completeFile();
  recalculateRefinementTier(state);
}
function checkMilestones(){
  const pct = fileProgressPct();
  for (const ms of MILESTONES){
    if (pct >= ms.pct && !state.fileState.milestonesHit.includes(ms.id)){
      state.fileState.milestonesHit.push(ms.id);
      onMilestoneUnlocked(ms);
    }
  }
}
function onMilestoneUnlocked(ms){
  pushLog(`MILESTONE UNLOCKED: ${ms.name}`);
  if (ms.id === 'mde') triggerMDE();
  renderAvatar();
}

// ─── MDE ───────────────────────────────────────────────────────────
function triggerMDE(){
  const overlay = document.getElementById('mde-overlay');
  const counter = document.getElementById('mde-countdown');
  overlay.classList.remove('hidden');
  let secs = 60; if (counter) counter.textContent = secs;
  clearInterval(mdeCountdownTimer);
  mdeCountdownTimer = setInterval(() => {
    secs--; if (counter) counter.textContent = secs;
    if (secs <= 0){ clearInterval(mdeCountdownTimer); overlay.classList.add('hidden'); }
  }, 1000);
  clearTimeout(mdeTimer);
  mdeTimer = setTimeout(() => { clearInterval(mdeCountdownTimer); overlay.classList.add('hidden'); }, 61_000);
}

// ─── prestige / waffle party ───────────────────────────────────────
function completeFile(){
  if (prestigeInProgress) return;
  prestigeInProgress = true;
  if (!state.fileState.milestonesHit.includes('caricature')) state.fileState.milestonesHit.push('caricature');
  triggerWaffleParty();
}
function triggerWaffleParty(){
  const overlay = document.getElementById('waffle-overlay');
  document.getElementById('waffle-subject-next').textContent = `NEXT ASSIGNMENT: SUBJECT #${state.subject.subjectNumber + 1}`;
  overlay.classList.remove('hidden');
  pushLog('WAFFLE PARTY — PRESTIGE CYCLE INITIATED');
  clearTimeout(waffleTimer);
  waffleTimer = setTimeout(() => { overlay.classList.add('hidden'); applyPrestigeCycle(); prestigeInProgress = false; saveState(); render(); }, 5000);
}
function applyPrestigeCycle(){
  state.subject.subjectNumber += 1;
  state.subject.filesCompleted += 1;
  state.subject.prestigeMultiplier = Math.round(state.subject.prestigeMultiplier * 1.5 * 10) / 10;
  state.metrics = { fluidEfficiency:100, quotaProgression:100, complianceStanding:100, sustenanceLevel:100 };
  state.dailyLog = freshDailyLog();
  state.fileState = { fileNumber: state.subject.filesCompleted + 1, quota:0, milestonesHit:[] };
  pushLog(`NEW FILE ASSIGNED — SUBJECT AVATAR RESET`);
}
function freshDailyLog(){
  return { date:todayKey(), fluidIntakeMl:0, activityUnits:0, sustenanceUnits:0, morningDoseAt:null, morningPenaltyApplied:false, complianceDoseAt:null, compliancePenaltyApplied:false, sustenanceWarned:false, quotasAwarded:0 };
}

// ─── midnight reset (CORE) ─────────────────────────────────────────
export function checkMidnightReset(s){
  const today = todayKey();
  if (!s.dailyLog.date){ s.dailyLog.date = today; return; }
  if (s.dailyLog.date === today) return;
  const awards = evaluateQuotaTargets(s.dailyLog);
  s.subject.allocationCredits += awards.credits;
  addQuotaXp(awards.quota);
  s.dailyLog = freshDailyLog();
  pushLog('MIDNIGHT RESET — NEW SESSION');
}

// ─── compliance grace / advisory (CORE) ────────────────────────────
export function checkComplianceGrace(s){
  const advisory = document.getElementById('compliance-advisory');
  const mins = now().getHours()*60 + now().getMinutes();
  const messages = [];

  if (!s.dailyLog.morningDoseAt){
    if (mins >= MORNING_ADVISORY_H*60 && mins < MORNING_CUTOFF_H*60) messages.push('✚ AM INJECTION REQUIRED — BEFORE 10:00 — PLEASE COMPLY');
    else if (mins >= MORNING_CUTOFF_H*60 && !s.dailyLog.morningPenaltyApplied && !isComplianceFrozen(s)){
      s.metrics.complianceStanding = clamp(s.metrics.complianceStanding - 10, 0, 100);
      s.dailyLog.morningPenaltyApplied = true;
      pushLog('AM INJECTION MISSED — COMPLIANCE STANDING -10');
    }
    if (mins >= MORNING_CUTOFF_H*60) messages.push('✚ AM INJECTION OVERDUE — YOU HAVE BEEN NOTED');
  }
  if (!s.dailyLog.complianceDoseAt){
    if (mins >= AFTERNOON_ADVISORY_H*60 && mins < AFTERNOON_CUTOFF_H*60) messages.push('✚ PM INJECTION REQUIRED — BEFORE 14:00 — PLEASE COMPLY');
    else if (mins >= AFTERNOON_CUTOFF_H*60 && !s.dailyLog.compliancePenaltyApplied && !isComplianceFrozen(s)){
      s.metrics.complianceStanding = clamp(s.metrics.complianceStanding - 20, 0, 100);
      s.dailyLog.compliancePenaltyApplied = true;
      pushLog('PM INJECTION MISSED — COMPLIANCE STANDING -20');
    }
    if (mins >= AFTERNOON_CUTOFF_H*60) messages.push('✚ PM INJECTION OVERDUE — STANDING REDUCED');
  }
  if (s.metrics.sustenanceLevel < 30){
    messages.push('◧ SUSTENANCE LOW — WOE / DREAD ELEVATED');
    if (!s.dailyLog.sustenanceWarned){ s.dailyLog.sustenanceWarned = true; pushLog('SUSTENANCE CRITICAL — TEMPERS SPIKING WOE/DREAD'); }
  } else if (s.dailyLog.sustenanceWarned && s.metrics.sustenanceLevel >= 45){ s.dailyLog.sustenanceWarned = false; }

  if (messages.length){ advisory.textContent = messages.join('   |   '); advisory.classList.remove('hidden'); }
  else { advisory.classList.add('hidden'); advisory.textContent = ''; }
}

// ─── node state + Four Tempers (CORE) ──────────────────────────────
export function deriveNodeState(s){ return deriveNodeStateCore(s); }
export function deriveTempers(s){ return deriveTempersCore(s); }
function dominantTemper(t){ return Object.entries(t).sort((a,b)=>b[1]-a[1])[0][0]; }
function deriveAvatarStage(){
  return deriveAvatarStageFromState(state.fileState);
}

function deriveAvatarUnlocks(){
  return deriveAvatarUnlocksFromState(state.fileState, state.incentives);
}

function renderAvatar(){
  const avatar = deriveAvatarStage();
  const visuals = computeAvatarVisuals(state.fileState.quota, state.fileState.fileNumber);
  const el = document.getElementById('mdr-avatar');
  const node = document.getElementById('mdr-data-node');
  if (!el) return;

  el.style.setProperty('--avatar-opacity', visuals.opacity.toFixed(3));
  el.style.setProperty('--avatar-scale', visuals.scale.toFixed(3));
  el.dataset.stage = avatar.id;
  el.dataset.fileVariant = String(visuals.variant);
  el.dataset.unlock = deriveAvatarUnlocks();

  const badge = el.querySelector('.av-file-badge');
  if (badge) badge.textContent = formatFileBadge(state.fileState.fileNumber);

  if (node) node.dataset.avatarStage = avatar.id;

  const visLabel = document.getElementById('avatar-visibility-label');
  if (visLabel) visLabel.textContent = `VISIBILITY: ${visuals.visibilityPct}%`;
}
export function recalculateRefinementTier(s){
  return recalculateRefinementTierCore(s);
}

// ─── user actions (the 4 endpoints) ────────────────────────────────
export function rehydrateUnit(ml){
  const amount = Number(ml) || Number(document.getElementById('fluid-intake-input').value) || 250;
  if (amount <= 0) return;
  state.dailyLog.fluidIntakeMl += amount;
  state.metrics.fluidEfficiency = clamp(state.metrics.fluidEfficiency + amount/50, 0, 100);
  evaluateDailyQuotas(); saveState();
  pushLog(`FLUID LOGGED: ${amount} ML (TOTAL ${state.dailyLog.fluidIntakeMl})`);
  triggerRefinementBurst(); tick(false);
}
export function logPhysicalActivity(units){
  const amount = Number(units) || Number(document.getElementById('activity-units-input').value) || 1000;
  if (amount <= 0) return;
  state.dailyLog.activityUnits += amount;
  state.metrics.quotaProgression = clamp(state.metrics.quotaProgression + amount/200, 0, 100);
  evaluateDailyQuotas(); saveState();
  pushLog(`ACTIVITY LOGGED: ${amount} UNITS (TOTAL ${state.dailyLog.activityUnits})`);
  triggerRefinementBurst(); tick(false);
}
export function logSustenance(levelBoost){
  const boost = Number(levelBoost) || 34;
  state.dailyLog.sustenanceUnits += 1;
  state.metrics.sustenanceLevel = clamp(state.metrics.sustenanceLevel + boost, 0, 100);
  state.dailyLog.sustenanceWarned = false;
  evaluateDailyQuotas(); saveState();
  pushLog(`SUSTENANCE LOGGED: COMPONENT ${state.dailyLog.sustenanceUnits} (+${boost})`);
  triggerRefinementBurst(); tick(false);
}
export function administerMorningDose(){
  if (state.dailyLog.morningDoseAt) return;
  state.dailyLog.morningDoseAt = new Date().toISOString();
  state.metrics.complianceStanding = clamp(state.metrics.complianceStanding + 10, 0, 100);
  evaluateDailyQuotas(); saveState();
  pushLog(`AM INJECTION ADMINISTERED AT ${fmtTime(state.dailyLog.morningDoseAt)}`);
  triggerRefinementBurst(); tick(false);
}
export function administerComplianceDose(){
  if (state.dailyLog.complianceDoseAt) return;
  state.dailyLog.complianceDoseAt = new Date().toISOString();
  state.metrics.complianceStanding = clamp(state.metrics.complianceStanding + 15, 0, 100);
  const mins = now().getHours()*60 + now().getMinutes();
  if (mins >= AFTERNOON_CUTOFF_H*60 && state.dailyLog.compliancePenaltyApplied) state.metrics.complianceStanding = clamp(state.metrics.complianceStanding + 5, 0, 100);
  evaluateDailyQuotas(); saveState();
  pushLog(`PM INJECTION ADMINISTERED AT ${fmtTime(state.dailyLog.complianceDoseAt)}`);
  triggerRefinementBurst(); tick(false);
}

// ─── data field builders (low-CPU; transform/opacity only) ─────────
function buildNumberField(container, rows, cols){
  if (!container) return;
  container.innerHTML = '';
  for (let r = 0; r < rows; r++){
    const row = document.createElement('div');
    row.className = 'num-row';
    row.style.top = `${(r*100)/rows + 3}%`;
    row.style.setProperty('--row-dur', `${16 + r*4}s`);
    row.style.setProperty('--row-delay', `${-r*3}s`);
    let html = '';
    for (let c = 0; c < cols*2; c++) html += `<span class="mdr-num">${rndDigit()}</span>`;
    row.innerHTML = html;
    container.appendChild(row);
  }
}
function buildScene(){
  buildNumberField(document.getElementById('mdr-grid-bg'), FIELD_ROWS, FIELD_COLS);
  buildNumberField(document.getElementById('cam-drift'), CAM_ROWS, CAM_COLS);

  const grid = document.getElementById('ceiling-grid');
  if (grid){
    grid.innerHTML = '';
    const total = 48;
    const ballastIdx = Math.floor(Math.random() * total);
    for (let i = 0; i < total; i++){
      const p = document.createElement('div');
      p.className = 'light-panel lit';
      const roll = Math.random();
      if (i === ballastIdx) p.classList.add('ballast-flicker');
      else if (roll > 0.86) p.classList.add('flicker');
      else if (roll > 0.8) p.classList.add('flicker','b');
      else if (roll > 0.74) p.classList.add('flicker','c');
      grid.appendChild(p);
    }
  }
}
function refreshDigits(){
  if (document.hidden) return;
  const nums = document.querySelectorAll('.mdr-num');
  if (!nums.length) return;
  const temper = document.getElementById('mdr-data-node')?.dataset?.dominant || 'frolic';
  const step = temper === 'malice' || temper === 'dread' ? 3 + Math.floor(Math.random()*3)
    : temper === 'woe' ? 5 + Math.floor(Math.random()*3)
    : 6 + Math.floor(Math.random()*4);
  const start = Math.floor(Math.random() * Math.min(5, nums.length));
  for (let i = start; i < nums.length; i += step) nums[i].textContent = rndDigit();
  if (temper === 'malice' || temper === 'dread') {
    const huddleAt = Math.floor(Math.random() * Math.max(1, nums.length - 8));
    for (let j = 0; j < 6 && huddleAt + j < nums.length; j++) {
      nums[huddleAt + j].textContent = rndDigit();
      nums[huddleAt + j].classList.add('num-hot');
    }
    setTimeout(() => document.querySelectorAll('.mdr-num.num-hot').forEach((n) => n.classList.remove('num-hot')), 900);
  }
}
function triggerRefinementBurst(){
  const node = document.getElementById('mdr-data-node');
  if (!node) return;
  node.classList.add('refining'); refreshDigits();
  clearTimeout(burstTimer);
  burstTimer = setTimeout(() => node.classList.remove('refining'), 900);
}

// ─── view toggle: desk ⇄ terminal ──────────────────────────────────
function openTerminal(){
  focusReturnEl = document.activeElement;
  document.body.dataset.view = 'terminal';
  document.body.classList.remove('desk-idle');
  setCrtWorkingPresence(false);
  clearTimeout(idleTimer);
  ambientScheduler?.pause();
  syncDeskAudio();
  const crt = document.getElementById('crt-monitor');
  const backdrop = document.getElementById('zoom-backdrop');
  if (crt && crt.parentElement !== document.body) {
    if (!crtHome) crtHome = { parent: crt.parentElement, next: crt.nextSibling };
    document.body.appendChild(crt);
  }
  crt?.classList.add('focused');
  crt?.setAttribute('aria-expanded', 'true');
  crt?.removeAttribute('role');
  crt?.setAttribute('tabindex', '-1');
  backdrop?.setAttribute('aria-hidden', 'false');
  switchTab(activeTab);
  toggleLogSidebar(logSidebarOpen);
  const frame = document.getElementById('terminal-frame');
  if (frame) releaseTerminalFocus = trapFocus(frame);
  syncWakeLock();
}
function closeTerminal(){
  releaseTerminalFocus?.();
  releaseTerminalFocus = null;
  document.body.dataset.view = 'desk';
  const crt = document.getElementById('crt-monitor');
  const backdrop = document.getElementById('zoom-backdrop');
  if (crt && crtHome) crtHome.parent.insertBefore(crt, crtHome.next);
  crt?.classList.remove('focused');
  crt?.setAttribute('aria-expanded', 'false');
  crt?.setAttribute('role', 'button');
  crt?.setAttribute('tabindex', '0');
  backdrop?.setAttribute('aria-hidden', 'true');
  ambientScheduler?.resume();
  syncWakeLock();
  syncDeskAudio();
  bumpIdle();
  if (focusReturnEl && typeof focusReturnEl.focus === 'function') focusReturnEl.focus();
  focusReturnEl = null;
}

// ─── tab navigation ────────────────────────────────────────────────
function switchTab(tabId){
  activeTab = tabId;
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    const on = btn.dataset.tab === tabId;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    const on = panel.id === `tab-${tabId}`;
    panel.classList.toggle('active', on);
    panel.hidden = !on;
  });
}

function toggleLogSidebar(force){
  logSidebarOpen = force !== undefined ? force : !logSidebarOpen;
  const sidebar = document.getElementById('log-sidebar');
  const toggleBtn = document.getElementById('btn-toggle-log');
  sidebar.classList.toggle('open', logSidebarOpen);
  toggleBtn?.classList.toggle('active', logSidebarOpen);
}

// ─── render helpers ────────────────────────────────────────────────
function setMetric(barId, valId, pct){
  document.getElementById(barId).textContent = asciiBar(pct, 10);
  document.getElementById(valId).textContent = `${Math.round(pct)}%`;
}
function setQuad(id, val){
  const el = document.getElementById(id); if (!el) return;
  el.style.setProperty('--v', (val/100).toFixed(2));
  el.querySelector('.quad-val').textContent = String(Math.round(val)).padStart(2,'0');
}
function renderTempers(){
  const t = deriveTempers(state);
  const dom = dominantTemper(t);
  const node = document.getElementById('mdr-data-node');
  if (node) node.dataset.dominant = dom;
  document.body.dataset.temper = dom;
  const camDrift = document.getElementById('cam-drift');
  if (camDrift) camDrift.dataset.dominant = dom;
  setQuad('quad-wo', t.woe); setQuad('quad-fc', t.frolic); setQuad('quad-dr', t.dread); setQuad('quad-ma', t.malice);
  document.getElementById('tempers-readout').textContent = `DOMINANT TEMPER: ${TEMPER_NAMES[dom]}`;
  setMetric('temper-woe-bar', 'temper-woe-val', t.woe);
  setMetric('temper-frolic-bar', 'temper-frolic-val', t.frolic);
  setMetric('temper-dread-bar', 'temper-dread-val', t.dread);
  setMetric('temper-malice-bar', 'temper-malice-val', t.malice);
  if (dom !== lastDominantTemper){ if (lastDominantTemper !== null) pushLog(`TEMPER SHIFT → ${TEMPER_NAMES[dom]}`); lastDominantTemper = dom; }
}
function renderMilestoneLine(){
  const pct = fileProgressPct();
  document.getElementById('milestone-line').textContent =
    'MILESTONES: ' + MILESTONES.map(m => `[${pct >= m.pct ? 'x' : ' '}]${m.pct}%`).join(' ');
  const set = new Set([
    ...state.fileState.milestonesHit.map(id => MILESTONES.find(m => m.id===id)?.badge).filter(Boolean),
    ...state.incentives.inventory.map(id => INCENTIVES_CATALOG.find(i => i.id===id)?.name.split(' ')[0]).filter(Boolean),
  ]);
  document.getElementById('inventory-badges').innerHTML = [...set].map(b => `<span class="badge">${b}</span>`).join('');
}
function updateWindowIndicator(id, mins, advisoryMins, cutoffMins, done){
  const el = document.getElementById(id); if (!el) return;
  if (done) el.textContent = '✓';
  else if (mins >= cutoffMins) el.textContent = '[CLOSED]';
  else if (mins >= advisoryMins){ const rem = cutoffMins - mins; el.textContent = `[${Math.floor(rem/60)}h${rem%60}m]`; }
  else el.textContent = '';
}

const PROTOCOL_STATUS_LABEL = {
  done: 'DONE',
  due: 'DUE',
  overdue: 'OVERDUE',
  pending: 'PENDING',
};

function renderProtocolChecklist(){
  const list = document.getElementById('protocol-checklist');
  const summary = document.getElementById('protocol-checklist-summary');
  if (!list || !state) return;
  const items = deriveProtocolChecklist(state.dailyLog, now());
  list.innerHTML = items.map((item) => `
    <li data-status="${item.status}" role="listitem">
      <span class="protocol-status" data-status="${item.status}">${PROTOCOL_STATUS_LABEL[item.status]}</span>
      <span class="protocol-label">${item.label}</span>
      <span class="protocol-detail">${item.detail}</span>
    </li>
  `).join('');
  if (summary) summary.textContent = protocolChecklistSummary(items);

  for (const item of items) {
    const cmd = document.querySelector(`.cli-cmd[data-protocol="${item.id}"]`);
    if (cmd) cmd.dataset.protocolStatus = item.status;
    const chip = document.querySelector(`.protocol-cmd-status[data-for="${item.id}"]`);
    if (chip) {
      chip.textContent = PROTOCOL_STATUS_LABEL[item.status];
      chip.dataset.status = item.status;
    }
  }
}
function renderIncentives(){
  const el = document.getElementById('incentives-catalog'); if (!el) return;
  el.innerHTML = INCENTIVES_CATALOG.map(item => {
    const owned = state.incentives.inventory.includes(item.id);
    const active = item.id==='coffee-cozy' ? state.incentives.activeSkin===item.id : item.id==='melon-bar' ? state.activePalette==='melon-bar' : false;
    const canBuy = state.subject.allocationCredits >= item.cost;
    const btn = owned
      ? (item.type==='skin' || item.id==='melon-bar')
        ? active ? '<span class="catalog-item-info">EQUIPPED</span>' : `<button type="button" data-equip-incentive="${item.id}">EQUIP</button>`
        : item.type==='consumable' ? `<button type="button" data-use-incentive="${item.id}">CONSUME</button>` : '<span class="catalog-item-info">ACQUIRED</span>'
      : `<button type="button" data-buy-incentive="${item.id}" ${canBuy?'':'disabled'}>ACQUIRE — ${item.cost} CR</button>`;
    return `<div class="catalog-item ${active?'active':''}"><span class="catalog-item-info">${item.name} — ${item.cost} CR<br><small>${item.desc}</small></span>${btn}</div>`;
  }).join('');
}
function renderProcurement(){
  const pEl = document.getElementById('palette-catalog'), gEl = document.getElementById('geometry-catalog');
  if (!pEl || !gEl) return;
  pEl.innerHTML = PALETTE_CATALOG.map(item => {
    const owned = state.unlockedPalettes.includes(item.id), active = state.activePalette===item.id, canBuy = state.subject.allocationCredits >= item.cost;
    const btn = owned ? active ? '<span class="catalog-item-info">EQUIPPED</span>' : `<button type="button" data-equip-palette="${item.id}">EQUIP</button>`
                      : `<button type="button" data-buy-palette="${item.id}" ${canBuy?'':'disabled'}>ACQUIRE — ${item.cost} CR</button>`;
    return `<div class="catalog-item ${active?'active':''}"><span class="catalog-item-info">${item.name}${item.cost?` — ${item.cost} CR`:''}</span>${btn}</div>`;
  }).join('');
  gEl.innerHTML = GEOMETRY_CATALOG.map(item => {
    const owned = state.unlockedGeometries.includes(item.id), active = state.activeGeometry===item.id, canBuy = state.subject.allocationCredits >= item.cost;
    const btn = owned ? active ? '<span class="catalog-item-info">EQUIPPED</span>' : `<button type="button" data-equip-geometry="${item.id}">EQUIP</button>`
                      : `<button type="button" data-buy-geometry="${item.id}" ${canBuy?'':'disabled'}>ACQUIRE — ${item.cost} CR</button>`;
    return `<div class="catalog-item ${active?'active':''}"><span class="catalog-item-info">${item.name}${item.cost?` — ${item.cost} CR`:''}</span>${btn}</div>`;
  }).join('');
}
function renderActivityLog(){
  const list = document.getElementById('activity-log-list');
  if (!list || activityLog.length === 0) return;
  list.innerHTML = activityLog.map(({ts,text}) => `<li class="log-entry"><span class="log-ts">${ts}</span>${text}</li>`).join('');
}

// ─── main render ───────────────────────────────────────────────────
function render(){
  document.documentElement.dataset.palette = state.activePalette;
  document.documentElement.dataset.geometry = state.activeGeometry;
  document.body.dataset.skin = state.incentives.activeSkin || '';
  document.body.classList.toggle('kiosk-awake', !!state.kioskAwake);

  document.getElementById('subject-designation').textContent = `SUBJECT #${state.subject.subjectNumber}`;
  document.getElementById('refinement-tier').textContent     = `TIER: ${TIER_NAMES[state.subject.refinementTier]}`;
  document.getElementById('prestige-multiplier').textContent = `x${state.subject.prestigeMultiplier.toFixed(1)}`;
  document.getElementById('quota-cumulative').textContent    = `XP ${String(state.subject.cumulativeQuota).padStart(4,'0')}`;
  document.getElementById('allocation-credits').textContent  = `CR ${String(state.subject.allocationCredits).padStart(4,'0')}`;

  const filePct = Math.round(fileProgressPct());
  document.getElementById('file-designation').textContent = `FILE-${String(state.fileState.fileNumber).padStart(4,'0')}`;
  document.getElementById('file-bar').textContent = asciiBar(filePct, 14);
  document.getElementById('file-value').textContent = `${filePct}%`;

  setMetric('fluid-bar','fluid-value', state.metrics.fluidEfficiency);
  setMetric('quota-bar','quota-value', state.metrics.quotaProgression);
  setMetric('compliance-bar','compliance-value', state.metrics.complianceStanding);
  setMetric('sustenance-bar','sustenance-value', state.metrics.sustenanceLevel);

  document.getElementById('fluid-intake-today').textContent   = state.dailyLog.fluidIntakeMl;
  document.getElementById('activity-units-today').textContent = state.dailyLog.activityUnits;
  document.getElementById('sustenance-today').textContent     = state.dailyLog.sustenanceUnits;

  document.getElementById('morning-dose-time').textContent = state.dailyLog.morningDoseAt ? `${fmtTime(state.dailyLog.morningDoseAt)} ✓` : 'NOT RECORDED';
  document.getElementById('btn-administer-morning').disabled = !!state.dailyLog.morningDoseAt;
  document.getElementById('compliance-dose-time').textContent = state.dailyLog.complianceDoseAt ? `${fmtTime(state.dailyLog.complianceDoseAt)} ✓` : 'NOT RECORDED';
  document.getElementById('btn-administer-dose').disabled = !!state.dailyLog.complianceDoseAt;

  const mins = now().getHours()*60 + now().getMinutes();
  updateWindowIndicator('morning-window-indicator',   mins, MORNING_ADVISORY_H*60,   MORNING_CUTOFF_H*60,   !!state.dailyLog.morningDoseAt);
  updateWindowIndicator('afternoon-window-indicator', mins, AFTERNOON_ADVISORY_H*60, AFTERNOON_CUTOFF_H*60, !!state.dailyLog.complianceDoseAt);

  document.getElementById('compliance-freeze-notice').classList.toggle('hidden', !isComplianceFrozen());

  renderProtocolChecklist();

  const avatar = deriveAvatarStage();
  const node = document.getElementById('mdr-data-node');
  const nodeState = deriveNodeState(state);
  node.dataset.avatarStage = avatar.id;
  node.dataset.state = nodeState;
  node.dataset.geometry = state.activeGeometry;
  document.getElementById('avatar-temper-label').textContent = `STAGE: ${avatar.label}`;
  document.getElementById('mdr-status-label').textContent = NODE_STATUS[nodeState];
  const cam = document.getElementById('cam-ambient'); if (cam) cam.textContent = CAM_STATUS[nodeState];

  renderAvatar();

  renderTempers();
  renderMilestoneLine();
  renderIncentives();
  renderProcurement();

  const ft = document.getElementById('finger-trap-widget');
  if (state.fileState.milestonesHit.includes('finger-trap')){ ft.classList.remove('hidden'); document.getElementById('finger-trap-count').textContent = `${state.incentives.fingerTrapTaps} STRUGGLES`; }
  else ft.classList.add('hidden');

  const crystal = document.getElementById('laser-crystal-footer');
  const hasCrystal = state.incentives.inventory.includes('laser-crystal');
  crystal.classList.toggle('hidden', !hasCrystal);
  crystal.setAttribute('aria-hidden', String(!hasCrystal));

  document.getElementById('archival-enabled').checked = state.sync.enabled;
  document.getElementById('archival-endpoint').value = state.sync.apiBase || '';
  document.getElementById('archival-hash').textContent = state.sync.code || '—';

  const kioskToggle = document.getElementById('kiosk-awake');
  if (kioskToggle) kioskToggle.checked = !!state.kioskAwake;
  const fsToggle = document.getElementById('kiosk-fullscreen');
  if (fsToggle) fsToggle.checked = !!state.kioskFullscreen;
  const quick = document.getElementById('btn-kiosk-quick');
  if (quick) quick.setAttribute('aria-pressed', state.kioskAwake ? 'true' : 'false');
  const audioToggle = document.getElementById('audio-enabled');
  if (audioToggle) audioToggle.checked = !!state.audioEnabled;
  renderAmbientReport();
}

// ─── live clock (cam + terminal) ───────────────────────────────────
function startClock(){
  function tickClock(){
    if (document.hidden) return;
    const d = new Date();
    const hh = String(d.getHours()).padStart(2,'0'), mm = String(d.getMinutes()).padStart(2,'0'), ss = String(d.getSeconds()).padStart(2,'0');
    const sep = d.getSeconds()%2===0 ? ':' : '·';
    const txt = `${hh}${sep}${mm}${sep}${ss}`;
    const term = document.getElementById('live-clock'); const camc = document.getElementById('cam-clock');
    if (term) term.textContent = txt;
    if (camc) camc.textContent = txt;
    const dateEl = document.getElementById('clock-date');
    if (dateEl) dateEl.textContent = d.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }).toUpperCase();
  }
  tickClock(); setInterval(tickClock, 1000);
}

// ─── tick loop (CORE) ──────────────────────────────────────────────
function tick(applyElapsed = true){
  if (applyElapsed && state.lastSavedAt){
    applyElapsedTime(state, Date.now() - new Date(state.lastSavedAt).getTime());
    state.lastSavedAt = new Date().toISOString();
  }
  checkMidnightReset(state);
  checkComplianceGrace(state);
  const tierChanged = recalculateRefinementTier(state);
  render();
  if (tierChanged) pushLog(`REFINEMENT TIER ADVANCED: ${TIER_NAMES[state.subject.refinementTier]}`);
}

// ─── drawers / incentives / procurement ────────────────────────────
let releaseDrawerFocus = null;
function openDrawer(id){
  document.getElementById(id).classList.remove('hidden');
  document.getElementById('drawer-backdrop').classList.remove('hidden');
  releaseDrawerFocus?.();
  releaseDrawerFocus = trapFocus(document.getElementById(id));
}
function closeDrawers(){
  releaseDrawerFocus?.();
  releaseDrawerFocus = null;
  ['incentives-drawer','procurement-drawer','archival-sync-panel'].forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById('drawer-backdrop').classList.add('hidden');
}

function acquirePalette(id){
  const item = PALETTE_CATALOG.find(p => p.id===id);
  if (!item || state.unlockedPalettes.includes(id) || state.subject.allocationCredits < item.cost) return;
  state.subject.allocationCredits -= item.cost; state.unlockedPalettes.push(id); state.activePalette = id; saveState(); render();
}
function acquireGeometry(id){
  const item = GEOMETRY_CATALOG.find(g => g.id===id);
  if (!item || state.unlockedGeometries.includes(id) || state.subject.allocationCredits < item.cost) return;
  state.subject.allocationCredits -= item.cost; state.unlockedGeometries.push(id); state.activeGeometry = id; saveState(); render();
}
function acquireIncentive(id){
  const item = INCENTIVES_CATALOG.find(i => i.id===id);
  if (!item || state.incentives.inventory.includes(id) || state.subject.allocationCredits < item.cost) return;
  state.subject.allocationCredits -= item.cost; state.incentives.inventory.push(id);
  if (item.type==='skin') state.incentives.activeSkin = id;
  if (item.id==='melon-bar'){ state.activePalette = 'melon-bar'; if (!state.unlockedPalettes.includes('melon-bar')) state.unlockedPalettes.push('melon-bar'); }
  pushLog(`INCENTIVE ACQUIRED: ${item.name}`); saveState(); render();
}
function equipIncentive(id){
  if (!state.incentives.inventory.includes(id)) return;
  if (id==='coffee-cozy') state.incentives.activeSkin = state.incentives.activeSkin===id ? null : id;
  else if (id==='melon-bar') state.activePalette = state.activePalette==='melon-bar' ? 'lumon-default' : 'melon-bar';
  saveState(); render();
}
function useIncentive(id){
  if (id !== 'egg-bar' || !state.incentives.inventory.includes(id)) return;
  const until = new Date(); until.setHours(until.getHours()+24);
  state.incentives.complianceFreezeUntil = until.toISOString();
  pushLog('EGG BAR CONSUMED — DECAY FROZEN 24H'); saveState(); render();
}

// ─── orientation ───────────────────────────────────────────────────
function showOrientation(){
  orientPage = 1;
  updateOrientPage();
  const modal = document.getElementById('orientation-modal');
  modal.classList.remove('hidden');
  releaseOrientFocus?.();
  releaseOrientFocus = trapFocus(modal.querySelector('.orientation-inner') || modal);
}
function dismissOrientation(){
  releaseOrientFocus?.();
  releaseOrientFocus = null;
  document.getElementById('orientation-modal').classList.add('hidden');
  state.onboardingComplete = true;
  saveState();
  maybeShowAmbientHint();
  bumpIdle();
}
function updateOrientPage(){
  document.querySelectorAll('.orientation-page').forEach(el => el.classList.toggle('active', Number(el.dataset.page)===orientPage));
  document.getElementById('orient-page-indicator').textContent = `${orientPage} / ${ORIENT_PAGES}`;
  document.getElementById('btn-orient-prev').disabled = orientPage <= 1;
  document.getElementById('btn-orient-next').textContent = orientPage >= ORIENT_PAGES ? 'DISMISS ×' : 'NEXT →';
}

// ─── archival ──────────────────────────────────────────────────────
function updateArchivalStatus(msg){ const el = document.getElementById('archival-status'); if (el) el.textContent = msg; }
function showConflictModal(){ return new Promise(resolve => { pendingConflict = resolve; document.getElementById('conflict-modal').classList.remove('hidden'); }); }
async function initArchivalPull(){
  if (!state.sync.enabled || !state.sync.apiBase || !state.sync.code) return;
  try {
    const pw = document.getElementById('archival-passphrase')?.value || '';
    const result = await syncNow(state, pw, () => showConflictModal());
    if (result.action === 'applied' && result.state){
      state = migrateState(result.state); state.sync.enabled = true; localStorage.setItem(STATE_KEY, JSON.stringify(state));
    }
  } catch (err){ updateArchivalStatus('ARCHIVAL ERROR: ' + err.message); }
}

// ─── performance: pause when hidden ────────────────────────────────
function handleVisibility(){
  const hidden = document.hidden;
  document.documentElement.classList.toggle('paused', hidden);
  if (hidden){
    clearInterval(digitTimer); digitTimer = null;
    ambientScheduler?.pause();
    releaseWakeLock();
    notifyAudioVisibility();
  } else {
    if (!digitTimer) digitTimer = setInterval(refreshDigits, document.body.classList.contains('desk-idle') ? 1100 : 2200);
    tick();
    if (document.body.dataset.view === 'desk') ambientScheduler?.resume();
    syncWakeLock();
    notifyAudioVisibility();
    syncDeskAudio();
  }
}

// ─── event listeners ───────────────────────────────────────────────
function bindEventListeners(){
  // view toggle — CRT is a div[role=button] on desk so nested terminal controls stay valid
  document.getElementById('crt-monitor').addEventListener('click', () => {
    if (document.body.dataset.view !== 'desk') return;
    openTerminal();
  });
  document.getElementById('crt-monitor').addEventListener('keydown', (e) => {
    if (document.body.dataset.view !== 'desk') return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openTerminal();
    }
  });
  document.getElementById('terminal-frame')?.addEventListener('click', (e) => {
    if (document.body.dataset.view === 'terminal') e.stopPropagation();
  });
  document.getElementById('btn-return-desk').addEventListener('click', (e) => {
    e.stopPropagation();
    closeTerminal();
  });
  document.addEventListener('keydown', (e) => {
    if (document.body.dataset.view !== 'terminal') return;
    if (e.key === 'Escape') closeTerminal();
    if (e.altKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); toggleLogSidebar(); }
  });

  // tab bar
  document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  document.getElementById('btn-toggle-log')?.addEventListener('click', () => toggleLogSidebar());
  document.getElementById('btn-close-log')?.addEventListener('click', () => toggleLogSidebar(false));

  // habit endpoints
  document.getElementById('btn-administer-morning').addEventListener('click', administerMorningDose);
  document.getElementById('btn-administer-dose').addEventListener('click', administerComplianceDose);
  document.getElementById('btn-rehydrate-250').addEventListener('click', () => rehydrateUnit(250));
  document.getElementById('btn-rehydrate-500').addEventListener('click', () => rehydrateUnit(500));
  document.getElementById('btn-rehydrate-unit').addEventListener('click', () => rehydrateUnit());
  document.getElementById('btn-log-activity').addEventListener('click', () => logPhysicalActivity());
  document.querySelectorAll('.activity-preset').forEach(b => b.addEventListener('click', () => logPhysicalActivity(Number(b.dataset.units))));
  document.querySelectorAll('.sustenance-preset').forEach(b => b.addEventListener('click', () => logSustenance(Number(b.dataset.level))));

  // utilities
  document.getElementById('btn-incentives').addEventListener('click', () => openDrawer('incentives-drawer'));
  document.getElementById('btn-procurement').addEventListener('click', () => openDrawer('procurement-drawer'));
  document.getElementById('btn-archival').addEventListener('click', () => openDrawer('archival-sync-panel'));
  document.getElementById('btn-close-incentives').addEventListener('click', closeDrawers);
  document.getElementById('btn-close-procurement').addEventListener('click', closeDrawers);
  document.getElementById('btn-close-archival').addEventListener('click', closeDrawers);
  document.getElementById('drawer-backdrop').addEventListener('click', closeDrawers);

  document.getElementById('btn-finger-trap')?.addEventListener('click', () => { state.incentives.fingerTrapTaps += 1; saveState(); render(); });

  document.getElementById('incentives-catalog').addEventListener('click', (e) => {
    if (e.target.dataset.buyIncentive) acquireIncentive(e.target.dataset.buyIncentive);
    if (e.target.dataset.equipIncentive) equipIncentive(e.target.dataset.equipIncentive);
    if (e.target.dataset.useIncentive) useIncentive(e.target.dataset.useIncentive);
  });
  document.getElementById('palette-catalog').addEventListener('click', (e) => {
    if (e.target.dataset.buyPalette) acquirePalette(e.target.dataset.buyPalette);
    if (e.target.dataset.equipPalette){ state.activePalette = e.target.dataset.equipPalette; saveState(); render(); }
  });
  document.getElementById('geometry-catalog').addEventListener('click', (e) => {
    if (e.target.dataset.buyGeometry) acquireGeometry(e.target.dataset.buyGeometry);
    if (e.target.dataset.equipGeometry){ state.activeGeometry = e.target.dataset.equipGeometry; saveState(); render(); }
  });

  // orientation
  document.getElementById('btn-orientation').addEventListener('click', showOrientation);
  document.getElementById('btn-close-orientation').addEventListener('click', dismissOrientation);
  document.getElementById('btn-orient-prev').addEventListener('click', () => { if (orientPage > 1){ orientPage--; updateOrientPage(); } });
  document.getElementById('btn-orient-next').addEventListener('click', () => { if (orientPage < ORIENT_PAGES){ orientPage++; updateOrientPage(); } else dismissOrientation(); });

  document.getElementById('kiosk-awake')?.addEventListener('change', (e) => {
    state.kioskAwake = e.target.checked;
    document.body.classList.toggle('kiosk-awake', state.kioskAwake);
    saveState();
    syncWakeLock();
    render();
  });
  document.getElementById('kiosk-fullscreen')?.addEventListener('change', (e) => {
    state.kioskFullscreen = e.target.checked;
    saveState();
  });
  document.getElementById('btn-kiosk-engage')?.addEventListener('click', () => engageKiosk());
  document.getElementById('btn-kiosk-quick')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleKioskQuick();
  });
  document.getElementById('audio-enabled')?.addEventListener('change', (e) => {
    state.audioEnabled = e.target.checked;
    setAudioEnabled(state.audioEnabled);
    saveState();
    syncDeskAudio();
    if (state.audioEnabled) {
      showToast('FLOOR AUDIO ENGAGED — ORIGINAL MOTIF ONLY', { tone: 'ok' });
    } else {
      showToast('FLOOR AUDIO MUTED', { tone: 'dim' });
    }
    render();
  });
  document.getElementById('ambient-toast')?.addEventListener('click', hideToast);
  document.getElementById('cam-chyron')?.addEventListener('click', clearCamChyron);

  document.getElementById('office-scene')?.addEventListener('click', (e) => {
    if (document.body.dataset.view !== 'desk') return;
    if (e.target.closest('#crt-monitor') || e.target.closest('#btn-kiosk-quick') || e.target.closest('#helly-eraser')) return;
    const narrow = window.matchMedia('(max-width: 600px)').matches;
    if (narrow) openTerminal();
  });

  ['pointerdown', 'keydown', 'mousemove', 'touchstart'].forEach((evt) => {
    document.addEventListener(evt, () => bumpIdle(), { passive: true });
  });

  // archival
  document.getElementById('archival-enabled').addEventListener('change', (e) => { state.sync.enabled = e.target.checked; saveState(); });
  document.getElementById('archival-endpoint').addEventListener('change', (e) => { state.sync.apiBase = e.target.value.trim(); saveState(); });
  document.getElementById('btn-copy-hash').addEventListener('click', async () => { if (state.sync.code){ await navigator.clipboard.writeText(state.sync.code); updateArchivalStatus('HASH COPIED'); } });
  document.getElementById('btn-regenerate-hash').addEventListener('click', async () => { state.sync.code = await generateSyncCode(); saveState(); render(); updateArchivalStatus('NEW HASH GENERATED'); });
  document.getElementById('btn-transmit-record').addEventListener('click', async () => {
    try {
      if (!state.sync.code) state.sync.code = await generateSyncCode();
      state.sync.enabled = true; state.sync.apiBase = document.getElementById('archival-endpoint').value.trim();
      const pw = document.getElementById('archival-passphrase').value;
      const result = await syncNow(state, pw, () => showConflictModal());
      if (result.action === 'applied' && result.state) state = migrateState(result.state);
      saveState(); render(); updateArchivalStatus('RECORD TRANSMITTED — ' + fmtTime(new Date()));
    } catch (err){ updateArchivalStatus('TRANSMIT ERROR: ' + err.message); }
  });
  document.getElementById('btn-retain-local').addEventListener('click', () => { document.getElementById('conflict-modal').classList.add('hidden'); pendingConflict?.('local'); pendingConflict = null; });
  document.getElementById('btn-accept-archival').addEventListener('click', () => { document.getElementById('conflict-modal').classList.add('hidden'); pendingConflict?.('remote'); pendingConflict = null; });

  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('pageshow', (e) => { if (e.persisted) tick(); });
}

async function registerServiceWorker(){
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('./sw.js'); } catch { /* offline optional */ }
}

// ─── init ──────────────────────────────────────────────────────────
async function init(){
  state = loadState();
  if (!state.dailyLog.date) state.dailyLog.date = todayKey();

  await initArchivalPull();
  if (state.lastSavedAt) applyElapsedTime(state, Date.now() - new Date(state.lastSavedAt).getTime());

  checkMidnightReset(state);
  checkComplianceGrace(state);
  recalculateRefinementTier(state);

  buildScene();
  const crt = document.getElementById('crt-monitor');
  if (crt) crtHome = { parent: crt.parentElement, next: crt.nextSibling };
  render();
  switchTab('data-matrix');
  toggleLogSidebar(true);
  bindEventListeners();
  startClock();

  digitTimer = setInterval(refreshDigits, 2200);
  setInterval(() => tick(), 60_000);

  pushLog('REFINEMENT STREAM INITIALIZED — WELCOME BACK TO THE FLOOR');
  if (!state.onboardingComplete) showOrientation();
  else maybeShowAmbientHint();

  setAudioEnabled(!!state.audioEnabled);
  syncDeskAudio();

  ambientScheduler = createAmbientScheduler({
    getState: () => state,
    saveState,
    pushLog,
    render,
    now,
    showToast: (msg, opts) => {
      showToast(msg, opts);
      if (typeof msg === 'string' && /workstation|intercom|please return/i.test(msg)) {
        playIntercomChirp();
      }
    },
  });
  ambientScheduler.start();

  const params = new URLSearchParams(window.location.search);
  const ambientDebug = params.get('ambientDebug');
  if (ambientDebug) {
    const tier = ambientDebug === '1' ? null : ambientDebug.toUpperCase();
    setTimeout(() => ambientScheduler.debugFire(tier === 'A' || tier === 'B' || tier === 'C' ? tier : null), 400);
  }

  syncWakeLock();
  bumpIdle();
  registerServiceWorker();
}

init();
