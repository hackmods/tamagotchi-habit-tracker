import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';

const required = [
  'index.html',
  'styles.css',
  'app.js',
  'avatar.js',
  'sync.js',
  'sw.js',
  'manifest.webmanifest',
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

console.log('Static asset validation passed.');
