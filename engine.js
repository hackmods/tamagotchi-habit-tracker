/** Habit engine — protocol-bin core (unit-testable, no DOM). stateVersion 3 = campus. */

export const STATE_VERSION = 3;

export const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
export const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
export const SUSTENANCE_TARGET = 3;
export const FLUID_TARGET_ML = 2000;
export const ACTIVITY_TARGET_U = 8000;
export const TIER_THRESHOLDS = [0, 100, 300, 600];
export const MORNING_ADVISORY_H = 7;
export const MORNING_CUTOFF_H = 10;
export const AFTERNOON_ADVISORY_H = 11;
export const AFTERNOON_CUTOFF_H = 14;
export const PROGRESS_MIDDAY_H = 12;
export const PROGRESS_OVERDUE_H = 18;

/** Legacy bitflags — migration only. */
export const QUOTA_FLAGS = {
  FLUID: 1,
  ACTIVITY: 2,
  AFTERNOON_DOSE: 4,
  FULL_DAY: 8,
  MORNING_DOSE: 16,
  SUSTENANCE: 32,
};

/** @typedef {'done'|'due'|'overdue'|'pending'} ProtocolStatus */
/** @typedef {'hydrate'|'activity'|'am-injection'|'pm-injection'|'sustenance'} ProtocolId */

export const EMPTY_AWARDS = Object.freeze({
  hydrate: false,
  activity: false,
  amInjection: false,
  pmInjection: false,
  sustenance: false,
  fullDay: false,
});

/**
 * Ordered catalog — UI bins 01–05.
 * temperWeights: shortfall pressure toward WO/FC/DR/MA (0–1 each).
 */
export const PROTOCOLS = Object.freeze([
  {
    id: 'hydrate',
    bin: '01',
    label: 'HYDRATE_UNIT',
    kind: 'progress',
    target: FLUID_TARGET_ML,
    unit: 'ml',
    awardKey: 'hydrate',
    temperWeights: { wo: 0.2, fc: 0.35, dr: 0.55, ma: 0.1 },
  },
  {
    id: 'activity',
    bin: '02',
    label: 'LOG_ACTIVITY',
    kind: 'progress',
    target: ACTIVITY_TARGET_U,
    unit: 'u',
    awardKey: 'activity',
    temperWeights: { wo: 0.15, fc: 0.5, dr: 0.25, ma: 0.15 },
  },
  {
    id: 'am-injection',
    bin: '03',
    label: 'AM_INJECTION',
    kind: 'window',
    advisoryH: MORNING_ADVISORY_H,
    cutoffH: MORNING_CUTOFF_H,
    awardKey: 'amInjection',
    temperWeights: { wo: 0.45, fc: 0.15, dr: 0.25, ma: 0.4 },
  },
  {
    id: 'pm-injection',
    bin: '04',
    label: 'PM_INJECTION',
    kind: 'window',
    advisoryH: AFTERNOON_ADVISORY_H,
    cutoffH: AFTERNOON_CUTOFF_H,
    awardKey: 'pmInjection',
    temperWeights: { wo: 0.4, fc: 0.1, dr: 0.3, ma: 0.55 },
  },
  {
    id: 'sustenance',
    bin: '05',
    label: 'SUSTENANCE',
    kind: 'progress',
    target: SUSTENANCE_TARGET,
    unit: 'comp',
    awardKey: 'sustenance',
    temperWeights: { wo: 0.5, fc: 0.2, dr: 0.55, ma: 0.15 },
  },
]);

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function dateKeyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isComplianceFrozen(s, at = new Date()) {
  const u = s?.incentives?.complianceFreezeUntil;
  return Boolean(u && new Date(u) > at);
}

export function freshAwards() {
  return { ...EMPTY_AWARDS };
}

export function freshDailyLog(dateKey = null) {
  return {
    date: dateKey,
    fluidIntakeMl: 0,
    activityUnits: 0,
    sustenanceUnits: 0,
    morningDoseAt: null,
    morningPenaltyApplied: false,
    complianceDoseAt: null,
    compliancePenaltyApplied: false,
    sustenanceWarned: false,
    quotasAwarded: 0,
    awards: freshAwards(),
  };
}

function awardsFromBitflags(flags) {
  const f = flags || 0;
  return {
    hydrate: Boolean(f & QUOTA_FLAGS.FLUID),
    activity: Boolean(f & QUOTA_FLAGS.ACTIVITY),
    amInjection: Boolean(f & QUOTA_FLAGS.MORNING_DOSE),
    pmInjection: Boolean(f & QUOTA_FLAGS.AFTERNOON_DOSE),
    sustenance: Boolean(f & QUOTA_FLAGS.SUSTENANCE),
    fullDay: Boolean(f & QUOTA_FLAGS.FULL_DAY),
  };
}

function bitflagsFromAwards(awards) {
  let f = 0;
  if (awards.hydrate) f |= QUOTA_FLAGS.FLUID;
  if (awards.activity) f |= QUOTA_FLAGS.ACTIVITY;
  if (awards.amInjection) f |= QUOTA_FLAGS.MORNING_DOSE;
  if (awards.pmInjection) f |= QUOTA_FLAGS.AFTERNOON_DOSE;
  if (awards.sustenance) f |= QUOTA_FLAGS.SUSTENANCE;
  if (awards.fullDay) f |= QUOTA_FLAGS.FULL_DAY;
  return f;
}

function ensureAwards(log) {
  if (!log.awards || typeof log.awards !== 'object') {
    log.awards = awardsFromBitflags(log.quotasAwarded || 0);
  } else {
    log.awards = { ...EMPTY_AWARDS, ...log.awards };
  }
  log.quotasAwarded = bitflagsFromAwards(log.awards);
  return log.awards;
}

/**
 * Migrate persisted state to current shape (v3 campus).
 * App may still deep-merge defaults; this normalizes awards + campus + version.
 */
export function migrateState(raw, defaults = null) {
  if (!raw) {
    const base = defaults ? structuredClone(defaults) : null;
    if (base) {
      base.stateVersion = STATE_VERSION;
      base.dailyLog = { ...freshDailyLog(), ...base.dailyLog, awards: freshAwards() };
      if (!base.uiTips) base.uiTips = { a2hsDismissed: false, kioskTipDismissed: false };
      if (!base.campus) {
        base.campus = { room: 'mdr', corridorUnlocked: true, perpetuityUnlocked: false };
      }
      if (!base.departments) {
        base.departments = { mdr: 0, od: 0, wellness: 0, breakroom: 0 };
      }
      if (!base.sidequests) {
        base.sidequests = { active: null, completed: [], cooldowns: {} };
      }
    }
    return base;
  }
  if (raw.hydration !== undefined || raw.pet !== undefined) {
    return migrateState(null, defaults);
  }

  const s = defaults ? { ...structuredClone(defaults), ...raw } : { ...raw };
  // shallow-merge nested objects callers expect
  if (defaults) {
    s.subject = { ...defaults.subject, ...raw.subject };
    s.fileState = { ...defaults.fileState, ...raw.fileState };
    s.metrics = { ...defaults.metrics, ...raw.metrics };
    s.dailyLog = { ...defaults.dailyLog, ...raw.dailyLog };
    s.incentives = { ...defaults.incentives, ...raw.incentives };
    s.ambient = { ...defaults.ambient, ...raw.ambient };
    s.sync = { ...defaults.sync, ...raw.sync };
    s.campus = { ...defaults.campus, ...raw.campus };
    s.departments = { ...defaults.departments, ...raw.departments };
    s.sidequests = { ...defaults.sidequests, ...raw.sidequests };
  }

  if (s.metrics?.sustenanceLevel === undefined) s.metrics.sustenanceLevel = 100;
  if (s.dailyLog) {
    if (s.dailyLog.sustenanceUnits === undefined) s.dailyLog.sustenanceUnits = 0;
    if (s.dailyLog.sustenanceWarned === undefined) s.dailyLog.sustenanceWarned = false;
    if (s.dailyLog.morningDoseAt === undefined) s.dailyLog.morningDoseAt = null;
    if (s.dailyLog.morningPenaltyApplied === undefined) s.dailyLog.morningPenaltyApplied = false;
    if (s.dailyLog.complianceDoseAt === undefined) s.dailyLog.complianceDoseAt = null;
    if (s.dailyLog.compliancePenaltyApplied === undefined) s.dailyLog.compliancePenaltyApplied = false;

    const needsBitflagMigrate =
      raw.dailyLog?.awards === undefined ||
      raw.stateVersion === undefined ||
      raw.stateVersion < 2;
    if (needsBitflagMigrate && (raw.dailyLog?.quotasAwarded || raw.dailyLog?.awards === undefined)) {
      s.dailyLog.awards = awardsFromBitflags(raw.dailyLog?.quotasAwarded || 0);
    }
    ensureAwards(s.dailyLog);
  }
  if (!s.uiTips) s.uiTips = { a2hsDismissed: false, kioskTipDismissed: false };
  if (s.uiTips.a2hsDismissed === undefined) s.uiTips.a2hsDismissed = false;
  if (s.uiTips.kioskTipDismissed === undefined) s.uiTips.kioskTipDismissed = false;
  if (s.audioEnabled === undefined) s.audioEnabled = false;

  if (!s.campus) s.campus = { room: 'mdr', corridorUnlocked: true, perpetuityUnlocked: false };
  if (s.campus.corridorUnlocked === undefined) s.campus.corridorUnlocked = true;
  if (s.campus.perpetuityUnlocked === undefined) s.campus.perpetuityUnlocked = false;
  if (!s.campus.room) s.campus.room = 'mdr';

  if (!s.departments) s.departments = { mdr: 0, od: 0, wellness: 0, breakroom: 0 };
  for (const id of ['mdr', 'od', 'wellness', 'breakroom']) {
    if (typeof s.departments[id] !== 'number') s.departments[id] = 0;
  }

  if (!s.sidequests) s.sidequests = { active: null, completed: [], cooldowns: {} };
  if (!Array.isArray(s.sidequests.completed)) s.sidequests.completed = [];
  if (!s.sidequests.cooldowns || typeof s.sidequests.cooldowns !== 'object') {
    s.sidequests.cooldowns = {};
  }

  s.stateVersion = STATE_VERSION;
  return s;
}

/**
 * Decay metrics. Optional sustenanceMs overrides sustenance decay window
 * (ambient pause). When sustenanceMs === 0 and elapsedMs > 0, fluid/standing
 * still decay.
 */
export function applyElapsedTime(s, elapsedMs, at = new Date(), { sustenanceMs } = {}) {
  if (elapsedMs <= 0 && (sustenanceMs === undefined || sustenanceMs <= 0)) return s;

  const fluidMs = Math.max(0, elapsedMs);
  const sustMs = sustenanceMs === undefined ? fluidMs : Math.max(0, sustenanceMs);

  if (fluidMs > 0) {
    s.metrics.fluidEfficiency = clamp(
      s.metrics.fluidEfficiency * Math.pow(0.85, fluidMs / FOUR_HOURS_MS),
      0,
      100,
    );
    if (!isComplianceFrozen(s, at)) {
      const hours = fluidMs / (60 * 60 * 1000);
      if (s.metrics.fluidEfficiency < 30) {
        s.metrics.complianceStanding = clamp(s.metrics.complianceStanding - hours, 0, 100);
      }
    }
  }

  if (s.metrics.sustenanceLevel === undefined) s.metrics.sustenanceLevel = 100;
  if (sustMs > 0) {
    s.metrics.sustenanceLevel = clamp(
      s.metrics.sustenanceLevel * Math.pow(0.85, sustMs / SIX_HOURS_MS),
      0,
      100,
    );
  }
  return s;
}

/**
 * Apply window overdue penalties. Returns log lines for the view layer.
 */
export function applyWindowPenalties(s, at = new Date()) {
  const logs = [];
  const mins = at.getHours() * 60 + at.getMinutes();
  if (isComplianceFrozen(s, at)) return logs;

  if (!s.dailyLog.morningDoseAt && mins >= MORNING_CUTOFF_H * 60 && !s.dailyLog.morningPenaltyApplied) {
    s.metrics.complianceStanding = clamp(s.metrics.complianceStanding - 10, 0, 100);
    s.dailyLog.morningPenaltyApplied = true;
    logs.push('AM INJECTION MISSED — COMPLIANCE STANDING -10');
  }
  if (
    !s.dailyLog.complianceDoseAt &&
    mins >= AFTERNOON_CUTOFF_H * 60 &&
    !s.dailyLog.compliancePenaltyApplied
  ) {
    s.metrics.complianceStanding = clamp(s.metrics.complianceStanding - 20, 0, 100);
    s.dailyLog.compliancePenaltyApplied = true;
    logs.push('PM INJECTION MISSED — COMPLIANCE STANDING -20');
  }

  if (s.metrics.sustenanceLevel < 30) {
    if (!s.dailyLog.sustenanceWarned) {
      s.dailyLog.sustenanceWarned = true;
      logs.push('SUSTENANCE CRITICAL — TEMPERS SPIKING WOE/DREAD');
    }
  } else if (s.dailyLog.sustenanceWarned && s.metrics.sustenanceLevel >= 45) {
    s.dailyLog.sustenanceWarned = false;
  }
  return logs;
}

/**
 * Full tick: decay + penalties. Returns { logs }.
 * Pass sustenanceMs when ambient pause should freeze sustenance decay only.
 */
export function applyTick(s, elapsedMs, at = new Date(), opts = {}) {
  applyElapsedTime(s, elapsedMs, at, opts);
  const logs = applyWindowPenalties(s, at);
  return { logs };
}

/**
 * Idempotent quota evaluation against explicit awards map.
 * @returns {{ quota: number, credits: number }}
 */
export function evaluateQuotaAwards(state) {
  const log = state.dailyLog;
  const awards = ensureAwards(log);
  const out = { quota: 0, credits: 0 };

  const mDose = log.morningDoseAt ? new Date(log.morningDoseAt) : null;
  if (
    !awards.amInjection &&
    mDose &&
    dateKeyOf(mDose) === log.date &&
    mDose.getHours() < MORNING_CUTOFF_H
  ) {
    out.quota += 25;
    out.credits += 5;
    awards.amInjection = true;
  }
  if (!awards.hydrate && log.fluidIntakeMl >= FLUID_TARGET_ML) {
    out.quota += 25;
    out.credits += 5;
    awards.hydrate = true;
  }
  if (!awards.activity && log.activityUnits >= ACTIVITY_TARGET_U) {
    out.quota += 25;
    out.credits += 5;
    awards.activity = true;
  }
  const aDose = log.complianceDoseAt ? new Date(log.complianceDoseAt) : null;
  if (
    !awards.pmInjection &&
    aDose &&
    dateKeyOf(aDose) === log.date &&
    aDose.getHours() < AFTERNOON_CUTOFF_H
  ) {
    out.quota += 25;
    out.credits += 5;
    awards.pmInjection = true;
  }
  if (!awards.sustenance && log.sustenanceUnits >= SUSTENANCE_TARGET) {
    out.quota += 25;
    out.credits += 5;
    awards.sustenance = true;
  }

  const allFive =
    awards.amInjection &&
    awards.hydrate &&
    awards.activity &&
    awards.pmInjection &&
    awards.sustenance;
  if (!awards.fullDay && allFive) {
    out.quota += 25;
    out.credits += 5;
    awards.fullDay = true;
  }

  log.quotasAwarded = bitflagsFromAwards(awards);
  return out;
}

/** @deprecated Prefer evaluateQuotaAwards(state) */
export function evaluateQuotaTargets(log) {
  return evaluateQuotaAwards({ dailyLog: log });
}

export function deriveNodeState(s) {
  const { fluidEfficiency, quotaProgression, complianceStanding, sustenanceLevel } = s.metrics;
  const penalty = s.dailyLog.compliancePenaltyApplied || s.dailyLog.morningPenaltyApplied;
  if (complianceStanding < 25 || penalty) return 'noncompliant';
  if (fluidEfficiency < 30 || sustenanceLevel < 25) return 'depleted';
  if (quotaProgression < 30) return 'underutilized';
  if (
    fluidEfficiency >= 60 &&
    quotaProgression >= 60 &&
    complianceStanding >= 60 &&
    sustenanceLevel >= 50
  ) {
    return 'optimal';
  }
  return 'baseline';
}

function protocolProgress(log, protocol) {
  if (protocol.id === 'hydrate') {
    return {
      current: log.fluidIntakeMl || 0,
      target: FLUID_TARGET_ML,
      pct: clamp(((log.fluidIntakeMl || 0) / FLUID_TARGET_ML) * 100, 0, 100),
    };
  }
  if (protocol.id === 'activity') {
    return {
      current: log.activityUnits || 0,
      target: ACTIVITY_TARGET_U,
      pct: clamp(((log.activityUnits || 0) / ACTIVITY_TARGET_U) * 100, 0, 100),
    };
  }
  if (protocol.id === 'sustenance') {
    return {
      current: log.sustenanceUnits || 0,
      target: SUSTENANCE_TARGET,
      pct: clamp(((log.sustenanceUnits || 0) / SUSTENANCE_TARGET) * 100, 0, 100),
    };
  }
  if (protocol.id === 'am-injection') {
    return { current: log.morningDoseAt ? 1 : 0, target: 1, pct: log.morningDoseAt ? 100 : 0 };
  }
  if (protocol.id === 'pm-injection') {
    return {
      current: log.complianceDoseAt ? 1 : 0,
      target: 1,
      pct: log.complianceDoseAt ? 100 : 0,
    };
  }
  return { current: 0, target: 1, pct: 0 };
}

function windowStatus(done, advisoryH, cutoffH, mins) {
  if (done) return 'done';
  if (mins >= cutoffH * 60) return 'overdue';
  if (mins >= advisoryH * 60) return 'due';
  return 'pending';
}

function progressStatus(pct, mins) {
  if (pct >= 100) return 'done';
  if (mins >= PROGRESS_OVERDUE_H * 60) return 'overdue';
  if (mins >= PROGRESS_MIDDAY_H * 60) return 'due';
  return 'due';
}

function shortfallRatio(pct) {
  return clamp((100 - pct) / 100, 0, 1);
}

function binMicro(protocol, pct) {
  const s = shortfallRatio(pct);
  const w = protocol.temperWeights;
  return {
    wo: Math.round(clamp(s * w.wo * 100, 0, 100)),
    fc: Math.round(clamp((1 - s) * w.fc * 100, 0, 100)),
    dr: Math.round(clamp(s * w.dr * 100, 0, 100)),
    ma: Math.round(clamp(s * w.ma * 100, 0, 100)),
  };
}

function deriveBin(protocol, log, at) {
  const mins = at.getHours() * 60 + at.getMinutes();
  const prog = protocolProgress(log, protocol);
  let status;
  let detail;

  if (protocol.kind === 'window') {
    const done = prog.pct >= 100;
    status = windowStatus(done, protocol.advisoryH, protocol.cutoffH, mins);
    if (protocol.id === 'am-injection') {
      detail = done
        ? 'RECORDED'
        : mins >= MORNING_CUTOFF_H * 60
          ? 'OVERDUE AFTER 10:00'
          : 'BEFORE 10:00';
    } else {
      detail = done
        ? 'RECORDED'
        : mins >= AFTERNOON_CUTOFF_H * 60
          ? 'OVERDUE AFTER 14:00'
          : 'BEFORE 14:00';
    }
  } else {
    status = progressStatus(prog.pct, mins);
    if (protocol.id === 'hydrate') detail = `${prog.current}/${prog.target}ml`;
    else if (protocol.id === 'activity') detail = `${prog.current}/${prog.target}u`;
    else detail = `${prog.current}/${prog.target} COMP`;
  }

  return {
    id: protocol.id,
    bin: protocol.bin,
    label: protocol.label,
    kind: protocol.kind,
    status,
    progressPct: Math.round(prog.pct),
    detail,
    micro: binMicro(protocol, prog.pct),
  };
}

/**
 * Tempers: standing formulas + per-bin shortfall pressure.
 */
export function deriveTempers(s, at = new Date()) {
  const fl = s.metrics.fluidEfficiency;
  const q = s.metrics.quotaProgression;
  const co = s.metrics.complianceStanding;
  const su = s.metrics.sustenanceLevel ?? 100;
  const pen =
    (s.dailyLog.compliancePenaltyApplied ? 1 : 0) + (s.dailyLog.morningPenaltyApplied ? 1 : 0);
  const lowSust = su < 30 ? 30 - su : 0;

  let dread = ((100 - fl) + (100 - su)) / 2 + lowSust * 0.8;
  let woe = ((100 - co) + (100 - su)) / 2 + pen * 12 + lowSust * 0.6;
  let malice = (100 - co) * 0.7 + pen * 20;
  let frolic = (fl + q + co + su) / 4 - pen * 15 - lowSust;

  const bins = PROTOCOLS.map((p) => deriveBin(p, s.dailyLog, at));
  for (const bin of bins) {
    const sfall = shortfallRatio(bin.progressPct);
    const proto = PROTOCOLS.find((p) => p.id === bin.id);
    if (!proto) continue;
    const pressure = sfall * (bin.status === 'overdue' ? 18 : bin.status === 'due' ? 10 : 4);
    dread += pressure * proto.temperWeights.dr;
    woe += pressure * proto.temperWeights.wo;
    malice += pressure * proto.temperWeights.ma;
    frolic -= pressure * 0.35;
  }

  return {
    dread: clamp(dread, 0, 100),
    woe: clamp(woe, 0, 100),
    malice: clamp(malice, 0, 100),
    frolic: clamp(frolic, 0, 100),
  };
}

export function dominantTemper(tempers) {
  const entries = Object.entries(tempers);
  entries.sort((a, b) => b[1] - a[1] || (a[0] === 'frolic' ? -1 : 1));
  return entries[0][0];
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

/** Deterministic day seed for ambient scheduling. */
export function departmentalSeed(subjectNumber, dateKey) {
  let h = 2166136261;
  const str = `${subjectNumber}|${dateKey}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function deriveProtocolChecklist(log, at = new Date()) {
  return PROTOCOLS.map((p) => {
    const bin = deriveBin(p, log, at);
    return { id: bin.id, label: bin.label, status: bin.status, detail: bin.detail };
  });
}

export function protocolChecklistSummary(items) {
  const done = items.filter((i) => i.status === 'done').length;
  const overdue = items.filter((i) => i.status === 'overdue').length;
  const total = items.length;
  if (done === total) return `${done} / ${total} PROTOCOLS COMPLETE — THE BOARD ACKNOWLEDGES`;
  if (overdue > 0) return `${done} / ${total} PROTOCOLS · ${overdue} OVERDUE — PLEASE COMPLY`;
  return `${done} / ${total} PROTOCOLS COMPLETE — PLEASE COMPLY`;
}

export function deriveAdvisoryMessages(s, at = new Date()) {
  const messages = [];
  const mins = at.getHours() * 60 + at.getMinutes();
  if (!s.dailyLog.morningDoseAt) {
    if (mins >= MORNING_ADVISORY_H * 60 && mins < MORNING_CUTOFF_H * 60) {
      messages.push('✚ AM INJECTION REQUIRED — BEFORE 10:00 — PLEASE COMPLY');
    }
    if (mins >= MORNING_CUTOFF_H * 60) {
      messages.push('✚ AM INJECTION OVERDUE — YOU HAVE BEEN NOTED');
    }
  }
  if (!s.dailyLog.complianceDoseAt) {
    if (mins >= AFTERNOON_ADVISORY_H * 60 && mins < AFTERNOON_CUTOFF_H * 60) {
      messages.push('✚ PM INJECTION REQUIRED — BEFORE 14:00 — PLEASE COMPLY');
    }
    if (mins >= AFTERNOON_CUTOFF_H * 60) {
      messages.push('✚ PM INJECTION OVERDUE — STANDING REDUCED');
    }
  }
  if (s.metrics.sustenanceLevel < 30) {
    messages.push('◧ SUSTENANCE LOW — WOE / DREAD ELEVATED');
  }
  return messages;
}

/**
 * Frame UI contract — one snapshot for header, rails, bins.
 */
export function deriveTerminalSnapshot(s, at = new Date()) {
  const bins = PROTOCOLS.map((p) => deriveBin(p, s.dailyLog, at));
  const temperVector = deriveTempers(s, at);
  const dominant = dominantTemper(temperVector);
  const nodeState = deriveNodeState(s);
  const checklistSummary = protocolChecklistSummary(bins);
  const awards = ensureAwards(s.dailyLog);
  return {
    bins,
    temperVector,
    dominant,
    nodeState,
    checklistSummary,
    advisoryMessages: deriveAdvisoryMessages(s, at),
    vitals: {
      fluidEfficiency: s.metrics.fluidEfficiency,
      quotaProgression: s.metrics.quotaProgression,
      complianceStanding: s.metrics.complianceStanding,
      sustenanceLevel: s.metrics.sustenanceLevel ?? 100,
      fileQuota: s.fileState?.quota ?? 0,
    },
    awards: { ...awards },
  };
}

/**
 * Record a protocol action. Returns { ok, message, awards }.
 * @param {object} state
 * @param {ProtocolId} id
 * @param {object} [payload]
 * @param {Date} [at]
 */
export function recordProtocol(state, id, payload = {}, at = new Date()) {
  const log = state.dailyLog;
  ensureAwards(log);

  if (id === 'hydrate') {
    const amount = Number(payload.amount) || 0;
    if (amount <= 0) return { ok: false, message: 'INVALID FLUID AMOUNT', awards: { quota: 0, credits: 0 } };
    log.fluidIntakeMl += amount;
    state.metrics.fluidEfficiency = clamp(state.metrics.fluidEfficiency + amount / 50, 0, 100);
    const awards = evaluateQuotaAwards(state);
    return {
      ok: true,
      message: `FLUID LOGGED: ${amount} ML (TOTAL ${log.fluidIntakeMl})`,
      awards,
    };
  }

  if (id === 'activity') {
    const amount = Number(payload.amount) || 0;
    if (amount <= 0) return { ok: false, message: 'INVALID ACTIVITY AMOUNT', awards: { quota: 0, credits: 0 } };
    log.activityUnits += amount;
    state.metrics.quotaProgression = clamp(state.metrics.quotaProgression + amount / 200, 0, 100);
    const awards = evaluateQuotaAwards(state);
    return {
      ok: true,
      message: `ACTIVITY LOGGED: ${amount} UNITS (TOTAL ${log.activityUnits})`,
      awards,
    };
  }

  if (id === 'sustenance') {
    const boost = Number(payload.boost) || 34;
    log.sustenanceUnits += 1;
    state.metrics.sustenanceLevel = clamp(state.metrics.sustenanceLevel + boost, 0, 100);
    log.sustenanceWarned = false;
    const awards = evaluateQuotaAwards(state);
    return {
      ok: true,
      message: `SUSTENANCE LOGGED: COMPONENT ${log.sustenanceUnits} (+${boost})`,
      awards,
    };
  }

  if (id === 'am-injection') {
    if (log.morningDoseAt) {
      return { ok: false, message: 'AM INJECTION ALREADY RECORDED', awards: { quota: 0, credits: 0 } };
    }
    log.morningDoseAt = at.toISOString();
    state.metrics.complianceStanding = clamp(state.metrics.complianceStanding + 10, 0, 100);
    const awards = evaluateQuotaAwards(state);
    return {
      ok: true,
      message: `AM INJECTION ADMINISTERED`,
      awards,
      recordedAt: log.morningDoseAt,
    };
  }

  if (id === 'pm-injection') {
    if (log.complianceDoseAt) {
      return { ok: false, message: 'PM INJECTION ALREADY RECORDED', awards: { quota: 0, credits: 0 } };
    }
    log.complianceDoseAt = at.toISOString();
    state.metrics.complianceStanding = clamp(state.metrics.complianceStanding + 15, 0, 100);
    const mins = at.getHours() * 60 + at.getMinutes();
    if (mins >= AFTERNOON_CUTOFF_H * 60 && log.compliancePenaltyApplied) {
      state.metrics.complianceStanding = clamp(state.metrics.complianceStanding + 5, 0, 100);
    }
    const awards = evaluateQuotaAwards(state);
    return {
      ok: true,
      message: `PM INJECTION ADMINISTERED`,
      awards,
      recordedAt: log.complianceDoseAt,
    };
  }

  return { ok: false, message: 'UNKNOWN PROTOCOL', awards: { quota: 0, credits: 0 } };
}

/**
 * Day rollover. Caller applies returned awards to subject/file XP.
 * @returns {{ rolled: boolean, awards: { quota: number, credits: number }, message?: string }}
 */
export function rolloverDayIfNeeded(s, at = new Date()) {
  const today = dateKeyOf(at);
  if (!s.dailyLog.date) {
    s.dailyLog.date = today;
    ensureAwards(s.dailyLog);
    return { rolled: false, awards: { quota: 0, credits: 0 } };
  }
  if (s.dailyLog.date === today) {
    return { rolled: false, awards: { quota: 0, credits: 0 } };
  }
  const awards = evaluateQuotaAwards(s);
  s.dailyLog = freshDailyLog(today);
  return { rolled: true, awards, message: 'MIDNIGHT RESET — NEW SESSION' };
}
