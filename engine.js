/** Pure compliance / temper / quota helpers (unit-testable, no DOM). */

export const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
export const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
export const SUSTENANCE_TARGET = 3;
export const QUOTA_FLAGS = {
  FLUID: 1,
  ACTIVITY: 2,
  AFTERNOON_DOSE: 4,
  FULL_DAY: 8,
  MORNING_DOSE: 16,
  SUSTENANCE: 32,
};
export const TIER_THRESHOLDS = [0, 100, 300, 600];
export const MORNING_CUTOFF_H = 10;
export const AFTERNOON_CUTOFF_H = 14;

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

export function applyElapsedTime(s, elapsedMs, at = new Date()) {
  if (elapsedMs <= 0) return s;
  s.metrics.fluidEfficiency = clamp(
    s.metrics.fluidEfficiency * Math.pow(0.85, elapsedMs / FOUR_HOURS_MS),
    0,
    100,
  );
  if (s.metrics.sustenanceLevel === undefined) s.metrics.sustenanceLevel = 100;
  s.metrics.sustenanceLevel = clamp(
    s.metrics.sustenanceLevel * Math.pow(0.85, elapsedMs / SIX_HOURS_MS),
    0,
    100,
  );
  if (!isComplianceFrozen(s, at)) {
    const hours = elapsedMs / (60 * 60 * 1000);
    if (s.metrics.fluidEfficiency < 30) {
      s.metrics.complianceStanding = clamp(s.metrics.complianceStanding - hours, 0, 100);
    }
  }
  return s;
}

export function evaluateQuotaTargets(log) {
  const awards = { quota: 0, credits: 0 };
  const flags = log.quotasAwarded || 0;
  let nf = flags;

  const mDose = log.morningDoseAt ? new Date(log.morningDoseAt) : null;
  if (
    !(flags & QUOTA_FLAGS.MORNING_DOSE) &&
    mDose &&
    dateKeyOf(mDose) === log.date &&
    mDose.getHours() < MORNING_CUTOFF_H
  ) {
    awards.quota += 25;
    awards.credits += 5;
    nf |= QUOTA_FLAGS.MORNING_DOSE;
  }
  if (!(flags & QUOTA_FLAGS.FLUID) && log.fluidIntakeMl >= 2000) {
    awards.quota += 25;
    awards.credits += 5;
    nf |= QUOTA_FLAGS.FLUID;
  }
  if (!(flags & QUOTA_FLAGS.ACTIVITY) && log.activityUnits >= 8000) {
    awards.quota += 25;
    awards.credits += 5;
    nf |= QUOTA_FLAGS.ACTIVITY;
  }
  const aDose = log.complianceDoseAt ? new Date(log.complianceDoseAt) : null;
  if (
    !(flags & QUOTA_FLAGS.AFTERNOON_DOSE) &&
    aDose &&
    dateKeyOf(aDose) === log.date &&
    aDose.getHours() < AFTERNOON_CUTOFF_H
  ) {
    awards.quota += 25;
    awards.credits += 5;
    nf |= QUOTA_FLAGS.AFTERNOON_DOSE;
  }
  if (!(flags & QUOTA_FLAGS.SUSTENANCE) && log.sustenanceUnits >= SUSTENANCE_TARGET) {
    awards.quota += 25;
    awards.credits += 5;
    nf |= QUOTA_FLAGS.SUSTENANCE;
  }

  const allFive =
    (nf & QUOTA_FLAGS.MORNING_DOSE) &&
    (nf & QUOTA_FLAGS.FLUID) &&
    (nf & QUOTA_FLAGS.ACTIVITY) &&
    (nf & QUOTA_FLAGS.AFTERNOON_DOSE) &&
    (nf & QUOTA_FLAGS.SUSTENANCE);
  if (!(flags & QUOTA_FLAGS.FULL_DAY) && allFive) {
    awards.quota += 25;
    awards.credits += 5;
    nf |= QUOTA_FLAGS.FULL_DAY;
  }

  log.quotasAwarded = nf;
  return awards;
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

export function deriveTempers(s) {
  const fl = s.metrics.fluidEfficiency;
  const q = s.metrics.quotaProgression;
  const co = s.metrics.complianceStanding;
  const su = s.metrics.sustenanceLevel;
  const pen =
    (s.dailyLog.compliancePenaltyApplied ? 1 : 0) + (s.dailyLog.morningPenaltyApplied ? 1 : 0);
  const lowSust = su < 30 ? 30 - su : 0;
  return {
    dread: clamp(((100 - fl) + (100 - su)) / 2 + lowSust * 0.8, 0, 100),
    woe: clamp(((100 - co) + (100 - su)) / 2 + pen * 12 + lowSust * 0.6, 0, 100),
    malice: clamp((100 - co) * 0.7 + pen * 20, 0, 100),
    frolic: clamp((fl + q + co + su) / 4 - pen * 15 - lowSust, 0, 100),
  };
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
