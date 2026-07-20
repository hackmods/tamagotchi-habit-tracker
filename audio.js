/**
 * Optional Floor 7 desk audio — original Web Audio chiptune / hum.
 * Default silent. Not licensed show music (no Severance soundtrack samples).
 */

const REDUCED_MOTION =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Original 8-bit motif — mysterious corporate jazz energy, not a cover. */
const DEFIANT_NOTES = [
  { f: 196.0, d: 0.18 },
  { f: 233.08, d: 0.18 },
  { f: 293.66, d: 0.22 },
  { f: 349.23, d: 0.16 },
  { f: 293.66, d: 0.18 },
  { f: 261.63, d: 0.28 },
  { f: 0, d: 0.12 },
  { f: 220.0, d: 0.18 },
  { f: 261.63, d: 0.18 },
  { f: 329.63, d: 0.22 },
  { f: 392.0, d: 0.16 },
  { f: 329.63, d: 0.18 },
  { f: 293.66, d: 0.36 },
  { f: 0, d: 0.4 },
];

/** Sparse alternate motif — quieter fifths. */
const HALLWAY_NOTES = [
  { f: 146.83, d: 0.22 },
  { f: 220.0, d: 0.2 },
  { f: 293.66, d: 0.28 },
  { f: 0, d: 0.2 },
  { f: 174.61, d: 0.22 },
  { f: 261.63, d: 0.36 },
  { f: 0, d: 0.5 },
];

/** Brief wellness-adjacent motif. */
const WELLNESS_NOTES = [
  { f: 392.0, d: 0.14 },
  { f: 349.23, d: 0.14 },
  { f: 329.63, d: 0.18 },
  { f: 261.63, d: 0.28 },
  { f: 0, d: 0.35 },
];

const MOTIF_POOL = [DEFIANT_NOTES, HALLWAY_NOTES, WELLNESS_NOTES];
let motifIndex = 0;

let ctx = null;
let master = null;
let humNodes = null;
let motifTimer = null;
let enabled = false;
let deskActive = false;

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(ctx.destination);
  return ctx;
}

function setMasterGain(target, ramp = 0.4) {
  if (!master || !ctx) return;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(Math.max(0.0001, target), now + ramp);
}

function startHum() {
  if (!ctx || !master || humNodes) return;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 55;
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 4;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 180;
  filter.Q.value = 0.7;

  const gain = ctx.createGain();
  gain.gain.value = 0.045;

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  osc.start();
  lfo.start();
  humNodes = { osc, lfo, gain };
}

function stopHum() {
  if (!humNodes) return;
  try {
    humNodes.osc.stop();
    humNodes.lfo.stop();
  } catch {
    /* already stopped */
  }
  humNodes = null;
}

function beepSquare(freq, duration, when, vel = 0.08) {
  if (!ctx || !master || freq <= 0) return;
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  const t0 = when;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(vel, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function playMotifOnce() {
  if (!ctx || !deskActive || !enabled || REDUCED_MOTION) return;
  const notes = MOTIF_POOL[motifIndex % MOTIF_POOL.length];
  motifIndex += 1;
  let t = ctx.currentTime + 0.05;
  for (const note of notes) {
    if (note.f > 0) beepSquare(note.f, Math.min(note.d * 0.92, 0.28), t, 0.055);
    t += note.d;
  }
}

function scheduleMotifLoop() {
  clearTimeout(motifTimer);
  if (!enabled || !deskActive || REDUCED_MOTION) return;
  playMotifOnce();
  // Sparse: ~90–150s between motifs so coding sessions stay quiet
  const gap = 90_000 + Math.floor(Math.random() * 60_000);
  motifTimer = setTimeout(scheduleMotifLoop, gap);
}

function syncPlayback() {
  if (!enabled || !deskActive || document.hidden) {
    clearTimeout(motifTimer);
    motifTimer = null;
    stopHum();
    setMasterGain(0.0001, 0.3);
    return;
  }
  ensureCtx();
  if (!ctx) return;
  ctx.resume?.();
  startHum();
  setMasterGain(0.55, 0.6);
  if (!motifTimer) scheduleMotifLoop();
}

/**
 * @param {boolean} on
 * @returns {boolean}
 */
export function setAudioEnabled(on) {
  enabled = Boolean(on);
  if (enabled) {
    ensureCtx();
    ctx?.resume?.();
  }
  syncPlayback();
  return enabled;
}

export function isAudioEnabled() {
  return enabled;
}

/** Desk feed focused (not terminal, not hidden). */
export function setDeskAudioActive(active) {
  deskActive = Boolean(active);
  syncPlayback();
}

export function notifyAudioVisibility() {
  syncPlayback();
}

/** Soft intercom chirp for rare ambient (optional). */
export function playIntercomChirp() {
  if (!enabled || !deskActive || REDUCED_MOTION) return;
  ensureCtx();
  if (!ctx) return;
  ctx.resume?.();
  const t = ctx.currentTime + 0.02;
  beepSquare(880, 0.08, t, 0.04);
  beepSquare(660, 0.12, t + 0.1, 0.035);
}

/**
 * Short original cue keyed to ambient event id (default off via enabled flag).
 * @param {string} [eventId]
 */
export function playAmbientCue(eventId) {
  if (!enabled || !deskActive || REDUCED_MOTION || !eventId) return;
  ensureCtx();
  if (!ctx) return;
  ctx.resume?.();
  const t = ctx.currentTime + 0.02;
  if (eventId === 'intercom' || eventId === 'compliance-drill') {
    playIntercomChirp();
    return;
  }
  if (eventId === 'ballast-failure' || eventId === 'night-shift') {
    beepSquare(110, 0.15, t, 0.05);
    beepSquare(82.41, 0.2, t + 0.12, 0.04);
    return;
  }
  if (eventId === 'wellness-gaze' || eventId === 'mde-tease') {
    beepSquare(523.25, 0.1, t, 0.03);
    beepSquare(659.25, 0.14, t + 0.12, 0.028);
    return;
  }
  if (eventId === 'numbers-huddle' || eventId === 'eraser-pass') {
    beepSquare(440, 0.06, t, 0.03);
    beepSquare(494, 0.06, t + 0.07, 0.03);
    beepSquare(523, 0.08, t + 0.14, 0.03);
    return;
  }
  if (eventId === 'corridor-footfall' || eventId === 'od-cart-pass') {
    beepSquare(196, 0.08, t, 0.035);
    beepSquare(146.83, 0.12, t + 0.1, 0.03);
    return;
  }
  if (eventId === 'wellness-tone' || eventId === 'kier-whisper') {
    beepSquare(392, 0.12, t, 0.028);
    beepSquare(329.63, 0.16, t + 0.14, 0.025);
    return;
  }
  if (eventId === 'apology-loop') {
    beepSquare(164.81, 0.18, t, 0.04);
    beepSquare(130.81, 0.22, t + 0.16, 0.035);
    return;
  }
  beepSquare(330, 0.1, t, 0.03);
}
