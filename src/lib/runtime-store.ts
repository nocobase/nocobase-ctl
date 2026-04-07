import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import type { GeneratedOperation } from './generated-command.js';

export interface StoredRuntime {
  version: string;
  schemaHash?: string;
  generatedAt: string;
  baseUrl?: string;
  commands: GeneratedOperation[];
}

function getHomeDir() {
  return path.join(os.homedir(), '.nocobase-api-cli');
}

export function getVersionsDir() {
  return path.join(getHomeDir(), 'versions');
}

export function getVersionDir(version: string) {
  return path.join(getVersionsDir(), version);
}

function getRuntimeFile(version: string) {
  return path.join(getVersionDir(version), 'commands.json');
}

export async function saveRuntime(runtime: StoredRuntime) {
  const versionDir = getVersionDir(runtime.version);
  await fsp.mkdir(versionDir, { recursive: true });
  await fsp.writeFile(getRuntimeFile(runtime.version), JSON.stringify(runtime, null, 2));
}

export async function loadRuntime(version: string) {
  try {
    const content = await fsp.readFile(getRuntimeFile(version), 'utf8');
    return JSON.parse(content) as StoredRuntime;
  } catch (error) {
    return undefined;
  }
}

export function loadRuntimeSync(version?: string) {
  if (!version) {
    return undefined;
  }

  try {
    const content = fs.readFileSync(getRuntimeFile(version), 'utf8');
    return JSON.parse(content) as StoredRuntime;
  } catch (error) {
    return undefined;
  }
}

export async function listRuntimes() {
  try {
    const entries = await fsp.readdir(getVersionsDir(), { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch (error) {
    return [];
  }
}

export async function deleteRuntime(version: string) {
  await fsp.rm(getVersionDir(version), { recursive: true, force: true });
}

export function hasRuntimeSync(version?: string) {
  return version ? fs.existsSync(getRuntimeFile(version)) : false;
}
