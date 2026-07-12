export const FILE_TARGET = 1000;

export const AVATAR_STAGES = [
  { id: 'ghost', label: 'LATENT SIGNAL', minPct: 0 },
  { id: 'raw', label: 'RAW DATASET', minPct: 10 },
  { id: 'fenced', label: 'FENCED MATRIX', minPct: 25 },
  { id: 'singularity', label: 'COMPLIANT SINGULARITY', minPct: 75 },
  { id: 'caricature', label: 'CUSTOM CARICATURE', minPct: 100 },
];

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function fileProgressPct(quota, target = FILE_TARGET) {
  return clamp((quota / target) * 100, 0, 100);
}

export function deriveAvatarStage(fileState, target = FILE_TARGET) {
  const pct = fileProgressPct(fileState?.quota ?? 0, target);
  const hits = fileState?.milestonesHit ?? [];
  if (hits.includes('caricature') || pct >= 100) return AVATAR_STAGES[4];
  if (hits.includes('mde') || pct >= 75) return AVATAR_STAGES[3];
  if (hits.includes('finger-trap') || pct >= 25) return AVATAR_STAGES[2];
  if (hits.includes('eraser') || pct >= 10) return AVATAR_STAGES[1];
  return AVATAR_STAGES[0];
}

export function deriveAvatarUnlocks(fileState, incentives = {}) {
  const hits = fileState?.milestonesHit ?? [];
  const inv = incentives?.inventory ?? [];
  const unlocks = [];
  if (hits.includes('eraser')) unlocks.push('eraser');
  if (hits.includes('finger-trap')) unlocks.push('trap');
  if (hits.includes('mde')) unlocks.push('mde');
  if (hits.includes('caricature')) unlocks.push('caricature');
  if (inv.includes('laser-crystal')) unlocks.push('crystal');
  if (inv.includes('coffee-cozy')) unlocks.push('cozy');
  return unlocks.join(' ');
}

export function computeAvatarVisuals(quota, fileNumber, target = FILE_TARGET) {
  const pct = fileProgressPct(quota, target);
  const opacity = clamp(0.08 + (pct / 100) * 0.92, 0.08, 1);
  const scale = clamp(0.5 + (pct / 100) * 0.5, 0.5, 1);
  return {
    opacity,
    scale,
    variant: ((fileNumber ?? 1) - 1) % 4,
    visibilityPct: Math.round(opacity * 100),
  };
}

export function formatFileBadge(fileNumber) {
  return `F-${String(fileNumber).padStart(4, '0')}`;
}
