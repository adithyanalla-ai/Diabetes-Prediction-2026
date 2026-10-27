// Fails the build if the app's JS exceeds the budget (gzip).
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
const dir = new URL('../dist/assets/', import.meta.url);
const js = readdirSync(dir).filter((f) => f.endsWith('.js'));
const total = js.reduce((s, f) => s + gzipSync(readFileSync(new URL(f, dir))).length, 0);
const KB = (total / 1024).toFixed(1);
console.log(`JS gzip total: ${KB} KB`);
if (total > 60 * 1024) { console.error('JS budget (60 KB gzip) exceeded'); process.exit(1); }
