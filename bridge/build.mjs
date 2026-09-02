import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');
const outfile = path.join(root, 'public', 'bridge.js');
const workerOut = path.join(root, 'worker', 'public', 'bridge.js');

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [path.join(dir, 'src', 'index.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  outfile,
  legalComments: 'none',
  logLevel: 'info',
});

mkdirSync(path.dirname(workerOut), { recursive: true });
copyFileSync(outfile, workerOut);
console.log('copied → worker/public/bridge.js');
