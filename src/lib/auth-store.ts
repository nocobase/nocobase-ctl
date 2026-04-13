import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { CliHomeScope } from './cli-home.ts';
import { resolveCliHomeDir } from './cli-home.ts';

export interface EnvConfigEntry {
  baseUrl?: string;
  auth?: {
    type: 'token' | 'oauth';
    accessToken?: string;
    refreshToken?: string;
  };
  runtime?: {
    version?: string;
    schemaHash?: string;
    generatedAt?: string;
  };
}

export interface AuthConfig {
  currentEnv?: string;
  envs: Record<string, EnvConfigEntry>;
}

const DEFAULT_CONFIG: AuthConfig = {
  currentEnv: 'default',
  envs: {},
};

export interface AuthStoreOptions {
  scope?: CliHomeScope;
}

function getConfigFile(options: AuthStoreOptions = {}) {
  return path.join(resolveCliHomeDir(options.scope), 'config.json');
}

export async function loadAuthConfig(options: AuthStoreOptions = {}): Promise<AuthConfig> {
  try {
    const content = await fs.readFile(getConfigFile(options), 'utf8');
    const parsed = JSON.parse(content) as AuthConfig;
    return {
      currentEnv: parsed.currentEnv || 'default',
      envs: parsed.envs || {},
    };
  } catch (error) {
    return DEFAULT_CONFIG;
  }
}

export async function saveAuthConfig(config: AuthConfig, options: AuthStoreOptions = {}) {
  const filePath = getConfigFile(options);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2));
}

export async function listEnvs(options: AuthStoreOptions = {}) {
  const config = await loadAuthConfig(options);
  return {
    currentEnv: config.currentEnv || 'default',
    envs: config.envs,
  };
}

export async function getCurrentEnvName(options: AuthStoreOptions = {}) {
  const config = await loadAuthConfig(options);
  return config.currentEnv || 'default';
}

export async function setCurrentEnv(envName: string, options: AuthStoreOptions = {}) {
  const config = await loadAuthConfig(options);
  if (!config.envs[envName]) {
    throw new Error(`Env "${envName}" is not configured`);
  }
  config.currentEnv = envName;
  await saveAuthConfig(config, options);
}

export async function getEnv(envName?: string, options: AuthStoreOptions = {}) {
  const config = await loadAuthConfig(options);
  const resolved = envName || config.currentEnv || 'default';
  return config.envs[resolved];
}

export async function upsertEnv(envName: string, baseUrl: string, accessToken: string, options: AuthStoreOptions = {}) {
  const config = await loadAuthConfig(options);
  const previous = config.envs[envName];
  const baseUrlChanged = previous?.baseUrl !== baseUrl;
  const tokenChanged = previous?.auth?.accessToken !== accessToken;

  config.envs[envName] = {
    ...previous,
    baseUrl,
    auth: {
      type: 'token',
      accessToken,
    },
    runtime: baseUrlChanged || tokenChanged ? undefined : previous?.runtime,
  };
  config.currentEnv = envName;
  await saveAuthConfig(config, options);
}

export async function setEnvRuntime(
  envName: string,
  runtime: EnvConfigEntry['runtime'],
  options: AuthStoreOptions = {},
) {
  const config = await loadAuthConfig(options);
  const current = config.envs[envName] ?? {};
  config.envs[envName] = {
    ...current,
    runtime,
  };
  config.currentEnv = envName;
  await saveAuthConfig(config, options);
}

export async function removeEnv(envName: string, options: AuthStoreOptions = {}) {
  const config = await loadAuthConfig(options);

  if (!config.envs[envName]) {
    throw new Error(`Env "${envName}" is not configured`);
  }

  delete config.envs[envName];

  if (config.currentEnv === envName) {
    const nextEnv = Object.keys(config.envs).sort()[0];
    config.currentEnv = nextEnv ?? 'default';
  }

  await saveAuthConfig(config, options);

  return {
    removed: envName,
    currentEnv: config.currentEnv || 'default',
    hasEnvs: Object.keys(config.envs).length > 0,
  };
}
