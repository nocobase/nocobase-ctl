#!/usr/bin/env node

import { ensureRuntimeFromArgv } from '../dist/lib/bootstrap.js';
import { flush, run } from '@oclif/core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getCommandToken(argv) {
  for (const token of argv) {
    if (!token || token.startsWith('-')) {
      continue;
    }

    return token;
  }

  return undefined;
}

function formatCliEntryError(error, argv) {
  const message = error instanceof Error ? error.message : String(error);
  const missingCommandMatch = message.match(/^Command (.+) not found\.$/);
  if (missingCommandMatch) {
    const commandToken = getCommandToken(argv) ?? missingCommandMatch[1];
    return [
      `Unknown command: \`${commandToken}\`.`,
      'If this is a built-in command or a typo, run `nocobase-ctl --help` to inspect available commands.',
      `If \`${commandToken}\` should be a runtime command from your NocoBase app, run \`nocobase-ctl env update\` and try again.`,
    ].join('\n');
  }

  return message;
}

try {
  const argv = process.argv.slice(2);
  await ensureRuntimeFromArgv(argv, {
    configFile: path.join(path.dirname(__dirname), 'nocobase-ctl.config.json'),
  });

  await run(argv, import.meta.url);
  flush();
} catch (error) {
  const message = formatCliEntryError(error, process.argv.slice(2));
  console.error(message);
  process.exitCode = 1;
}
