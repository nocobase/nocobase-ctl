#!/usr/bin/env node

import { ensureRuntimeFromArgv } from '../dist/lib/bootstrap.js';
import { execute } from '@oclif/core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  await ensureRuntimeFromArgv(process.argv.slice(2), {
    configFile: path.join(path.dirname(__dirname), 'nocobase-cli.config.json'),
  });

  await execute({ dir: import.meta.url });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
