/**
 * Lumon Archival Transmission — optional cross-device sync
 */

const CODE_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function isValidSyncCode(code) {
  return CODE_PATTERN.test(code);
}

export async function generateSyncCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const view = new DataView(digest);
  let value = 0n;
  for (let i = 0; i < 8; i++) {
    value = (value << 8n) | BigInt(view.getUint8(i));
  }
  let encoded = '';
  for (let i = 0; i < 12; i++) {
    encoded += BASE32[Number(value & 31n)];
    value >>= 5n;
  }
  return `${encoded.slice(0, 4)}-${encoded.slice(4, 8)}-${encoded.slice(8, 12)}`;
}

function sortKeys(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return obj;
  }
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }
  return sorted;
}

export async function hashState(state) {
  const canonical = JSON.stringify(sortKeys(state));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function deriveKey(syncCode, passphrase = '') {
  const material = new TextEncoder().encode(`${syncCode}:${passphrase}`);
  const hash = await crypto.subtle.digest('SHA-256', material);
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptState(state, syncCode, passphrase = '') {
  const key = await deriveKey(syncCode, passphrase);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(state));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

export async function decryptState(payload, syncCode, passphrase = '') {
  const key = await deriveKey(syncCode, passphrase);
  const iv = Uint8Array.from(atob(payload.iv), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(payload.ciphertext), (c) => c.charCodeAt(0));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

function apiUrl(apiBase, code) {
  const base = apiBase.replace(/\/$/, '');
  return `${base}/sync/${encodeURIComponent(code)}`;
}

export async function pushState(state, passphrase = '') {
  const { sync } = state;
  if (!sync?.enabled || !sync.code || !sync.apiBase) {
    return { ok: false, reason: 'Archival protocol not configured' };
  }

  const contentHash = await hashState(state);
  const { ciphertext, iv } = await encryptState(state, sync.code, passphrase);
  const body = {
    ciphertext,
    iv,
    contentHash,
    updatedAt: new Date().toISOString(),
  };

  const res = await fetch(apiUrl(sync.apiBase, sync.code), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Transmit failed: ${res.status}`);
  }

  sync.contentHash = contentHash;
  sync.lastPushedAt = body.updatedAt;
  return { ok: true, contentHash };
}

export async function pullState(state, passphrase = '') {
  const { sync } = state;
  if (!sync?.enabled || !sync.code || !sync.apiBase) {
    return { ok: false, reason: 'Archival protocol not configured' };
  }

  const res = await fetch(apiUrl(sync.apiBase, sync.code));
  if (res.status === 404) {
    return { ok: false, notFound: true };
  }
  if (!res.ok) {
    throw new Error(`Pull failed: ${res.status}`);
  }

  const remote = await res.json();
  let remoteState;
  try {
    remoteState = await decryptState(remote, sync.code, passphrase);
  } catch {
    throw new Error('Decryption failed — verify passphrase');
  }

  sync.lastPulledAt = new Date().toISOString();
  return {
    ok: true,
    state: remoteState,
    contentHash: remote.contentHash,
    updatedAt: remote.updatedAt,
  };
}

export function mergeStates(local, remote) {
  const merged = structuredClone(local);
  merged.subject.cumulativeQuota = Math.max(
    local.subject.cumulativeQuota,
    remote.subject.cumulativeQuota
  );
  merged.subject.allocationCredits = Math.max(
    local.subject.allocationCredits,
    remote.subject.allocationCredits
  );
  merged.metrics.fluidEfficiency = Math.max(
    local.metrics.fluidEfficiency,
    remote.metrics.fluidEfficiency
  );
  merged.metrics.quotaProgression = Math.max(
    local.metrics.quotaProgression,
    remote.metrics.quotaProgression
  );
  merged.metrics.complianceStanding = Math.max(
    local.metrics.complianceStanding,
    remote.metrics.complianceStanding
  );
  merged.unlockedPalettes = [
    ...new Set([...(local.unlockedPalettes || []), ...(remote.unlockedPalettes || [])]),
  ];
  merged.unlockedGeometries = [
    ...new Set([...(local.unlockedGeometries || []), ...(remote.unlockedGeometries || [])]),
  ];
  if (remote.dailyLog?.date && (!local.dailyLog?.date || remote.dailyLog.date > local.dailyLog.date)) {
    merged.dailyLog = { ...remote.dailyLog };
  }
  merged.subject.refinementTier = Math.max(
    local.subject.refinementTier,
    remote.subject.refinementTier
  );
  return merged;
}

export async function syncNow(state, passphrase = '', onConflict) {
  const localHash = await hashState(state);
  const pull = await pullState(state, passphrase);

  if (pull.notFound) {
    await pushState(state, passphrase);
    return { action: 'pushed' };
  }

  if (!pull.ok) {
    return pull;
  }

  if (pull.contentHash === localHash) {
    return { action: 'unchanged' };
  }

  const localUpdated = new Date(state.lastSavedAt).getTime();
  const remoteUpdated = new Date(pull.updatedAt).getTime();
  const localPulled = state.sync.lastPulledAt
    ? new Date(state.sync.lastPulledAt).getTime()
    : 0;

  if (remoteUpdated > localPulled && localUpdated <= localPulled) {
    return { action: 'applied', state: pull.state };
  }

  if (onConflict) {
    const resolution = await onConflict(local, pull.state);
    if (resolution === 'remote') {
      return { action: 'applied', state: pull.state };
    }
    if (resolution === 'merge') {
      return { action: 'applied', state: mergeStates(local, pull.state) };
    }
    await pushState(state, passphrase);
    return { action: 'pushed' };
  }

  await pushState(state, passphrase);
  return { action: 'pushed' };
}
