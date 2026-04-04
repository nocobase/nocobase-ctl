#!/usr/bin/env -S node --loader ts-node/esm --disable-warning=ExperimentalWarning

import { ensureRuntimeFromArgv } from '../src/lib/bootstrap.ts';
import { execute } from '@oclif/core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await ensureRuntimeFromArgv(process.argv.slice(2), {
  configFile: path.join(path.dirname(__dirname), 'nocobase-cli.config.json'),
});

await execute({ development: true, dir: import.meta.url });
