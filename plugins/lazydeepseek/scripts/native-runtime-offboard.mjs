#!/usr/bin/env node
import { basename, resolve, isAbsolute } from 'node:path';
import { removeRuntimeArtifacts } from '../../../lib/index.mjs';
const [directory, confirmation] = process.argv.slice(2);
try {
  if (!directory || !isAbsolute(directory) || confirmation !== '--host-bundle-removed') throw new Error('usage: native-runtime-offboard.mjs <absolute-runtime-directory> --host-bundle-removed (only after selected host bundle removal and row/process absence are observed)');
  const root = resolve(directory);
  removeRuntimeArtifacts(root, basename(root), true);
  process.stdout.write(JSON.stringify({ runtime: 'removed', host_readiness: 'pending', directory: root }) + '\n');
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
