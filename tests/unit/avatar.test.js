import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  AVATAR_STAGES,
  computeAvatarVisuals,
  deriveAvatarStage,
  deriveAvatarUnlocks,
  fileProgressPct,
  formatFileBadge,
} from '../../avatar.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('fileProgressPct clamps quota contribution to 0–100', () => {
  assert.equal(fileProgressPct(0), 0);
  assert.equal(fileProgressPct(500), 50);
  assert.equal(fileProgressPct(1000), 100);
  assert.equal(fileProgressPct(2000), 100);
});

test('deriveAvatarStage advances with file progress and milestones', () => {
  assert.equal(deriveAvatarStage({ quota: 0, milestonesHit: [] }).id, 'ghost');
  assert.equal(deriveAvatarStage({ quota: 100, milestonesHit: [] }).id, 'raw');
  assert.equal(deriveAvatarStage({ quota: 250, milestonesHit: [] }).id, 'fenced');
  assert.equal(deriveAvatarStage({ quota: 750, milestonesHit: [] }).id, 'singularity');
  assert.equal(deriveAvatarStage({ quota: 1000, milestonesHit: [] }).id, 'caricature');
  assert.equal(deriveAvatarStage({ quota: 0, milestonesHit: ['eraser'] }).id, 'raw');
  assert.equal(deriveAvatarStage({ quota: 0, milestonesHit: ['mde'] }).id, 'singularity');
});

test('deriveAvatarUnlocks layers milestone and incentive cosmetics', () => {
  const unlocks = deriveAvatarUnlocks(
    { milestonesHit: ['eraser', 'finger-trap', 'mde', 'caricature'] },
    { inventory: ['laser-crystal', 'coffee-cozy'] },
  );
  assert.equal(unlocks, 'eraser trap mde caricature crystal cozy');
});

test('computeAvatarVisuals scales opacity and variant with progress', () => {
  const start = computeAvatarVisuals(0, 1);
  assert.equal(start.opacity, 0.08);
  assert.equal(start.scale, 0.5);
  assert.equal(start.variant, 0);
  assert.equal(start.visibilityPct, 8);

  const mid = computeAvatarVisuals(500, 3);
  assert.equal(mid.opacity, 0.54);
  assert.equal(mid.scale, 0.75);
  assert.equal(mid.variant, 2);
  assert.equal(mid.visibilityPct, 54);

  const done = computeAvatarVisuals(1000, 5);
  assert.equal(done.opacity, 1);
  assert.equal(done.scale, 1);
  assert.equal(done.variant, 0);
  assert.equal(done.visibilityPct, 100);
});

test('formatFileBadge zero-pads file numbers', () => {
  assert.equal(formatFileBadge(1), 'F-0001');
  assert.equal(formatFileBadge(42), 'F-0042');
});

test('avatar stages catalog matches UI stage ids', () => {
  const ids = AVATAR_STAGES.map((stage) => stage.id);
  assert.deepEqual(ids, ['ghost', 'raw', 'fenced', 'singularity', 'caricature']);
});

test('index.html embeds animated refinement subject SVG art', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.match(html, /id="mdr-avatar"/);
  assert.match(html, /class="mdr-avatar-svg"/);
  assert.match(html, /class="av-body"/);
  assert.match(html, /class="av-accessory av-eraser"/);
  assert.match(html, /class="av-accessory av-trap"/);
  assert.match(html, /class="av-accessory av-crystal"/);
});

test('styles.css defines GPU-safe avatar animation keyframes', () => {
  const css = readFileSync(join(root, 'styles.css'), 'utf8');
  assert.match(css, /@keyframes avatar-pulse/);
  assert.match(css, /@keyframes avatar-burst/);
  assert.match(css, /@keyframes mde-halo/);
  assert.match(css, /#mdr-data-node\.refining \.mdr-avatar/);
});
