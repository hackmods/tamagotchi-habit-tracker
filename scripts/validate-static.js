import { existsSync, readFileSync } from 'node:fs';

const required = [
  'index.html',
  'styles.css',
  'app.js',
  'avatar.js',
  'ambient.js',
  'engine.js',
  'audio.js',
  'sync.js',
  'sw.js',
  'manifest.webmanifest',
  'fonts/fonts.css',
  'fonts/ibm-plex-mono-400.woff2',
  'fonts/silkscreen-400.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

for (const file of required) {
  if (!existsSync(file)) {
    console.error(`Missing required file: ${file}`);
    process.exit(1);
  }
}

const appJs = readFileSync('app.js', 'utf8');
if (!appJs.includes("from './avatar.js'")) {
  console.error('app.js must import avatar module');
  process.exit(1);
}
if (!appJs.includes("from './ambient.js'")) {
  console.error('app.js must import ambient module');
  process.exit(1);
}
if (!appJs.includes("from './engine.js'")) {
  console.error('app.js must import engine module');
  process.exit(1);
}
if (!appJs.includes("from './audio.js'")) {
  console.error('app.js must import audio module');
  process.exit(1);
}

const sw = readFileSync('sw.js');
if (sw[0] === 0xff && sw[1] === 0xfe) {
  console.error('sw.js must be UTF-8 (found UTF-16 BOM)');
  process.exit(1);
}
if (sw.includes(0) && sw.length > 100 && sw.filter((b) => b === 0).length > sw.length / 4) {
  console.error('sw.js appears to contain wide-char / binary null padding');
  process.exit(1);
}
const swText = sw.toString('utf8');
if (!swText.includes("CACHE_NAME = 'lumon-terminal-v12'")) {
  console.error('sw.js CACHE_NAME should be bumped when shell assets change (expected lumon-terminal-v12)');
  process.exit(1);
}
for (const asset of ['./avatar.js', './ambient.js', './engine.js', './audio.js', './fonts/fonts.css']) {
  if (!swText.includes(asset)) {
    console.error(`sw.js SHELL must precache ${asset}`);
    process.exit(1);
  }
}

const html = readFileSync('index.html', 'utf8');
for (const sel of [
  'id="terminal-frame"',
  'id="crt-monitor"',
  'class="wellness-svg"',
  'id="ambient-toast"',
  'id="kiosk-awake"',
  'id="cam-chyron"',
  'id="btn-kiosk-quick"',
  'crt-hit',
  'id="protocol-checklist"',
  'id="audio-enabled"',
]) {
  if (!html.includes(sel)) {
    console.error(`index.html missing required marker: ${sel}`);
    process.exit(1);
  }
}

console.log('Static asset validation passed.');
