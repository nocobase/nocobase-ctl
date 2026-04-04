import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

export interface ServerConfigEntry {
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
  currentServer?: string;
  servers: Record<string, ServerConfigEntry>;
}

const DEFAULT_CONFIG: AuthConfig = {
  currentServer: 'default',
  servers: {},
};

function getConfigFile() {
  return path.join(os.homedir(), '.nocobase-cli', 'config.json');
}

export async function loadAuthConfig(): Promise<AuthConfig> {
  try {
    const content = await fs.readFile(getConfigFile(), 'utf8');
    const parsed = JSON.parse(content) as AuthConfig;
    return {
      currentServer: parsed.currentServer || 'default',
      servers: parsed.servers || {},
    };
  } catch (error) {
    return DEFAULT_CONFIG;
  }
}

export async function saveAuthConfig(config: AuthConfig) {
  const filePath = getConfigFile();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2));
}

export async function listServers() {
  const config = await loadAuthConfig();
  return {
    currentServer: config.currentServer || 'default',
    servers: config.servers,
  };
}

export async function getCurrentServerName() {
  const config = await loadAuthConfig();
  return config.currentServer || 'default';
}

export async function setCurrentServer(serverName: string) {
  const config = await loadAuthConfig();
  if (!config.servers[serverName]) {
    throw new Error(`Server "${serverName}" is not configured`);
  }
  config.currentServer = serverName;
  await saveAuthConfig(config);
}

export async function getServer(serverName?: string) {
  const config = await loadAuthConfig();
  const resolved = serverName || config.currentServer || 'default';
  return config.servers[resolved];
}

export async function upsertServer(serverName: string, baseUrl: string, accessToken: string) {
  const config = await loadAuthConfig();
  config.servers[serverName] = {
    ...(config.servers[serverName] ?? {}),
    baseUrl,
    auth: {
      type: 'token',
      accessToken,
    },
  };
  config.currentServer = serverName;
  await saveAuthConfig(config);
}

export async function setServerRuntime(serverName: string, runtime: ServerConfigEntry['runtime']) {
  const config = await loadAuthConfig();
  const current = config.servers[serverName] ?? {};
  config.servers[serverName] = {
    ...current,
    runtime,
  };
  config.currentServer = serverName;
  await saveAuthConfig(config);
}

export async function removeServer(serverName: string) {
  const config = await loadAuthConfig();

  if (!config.servers[serverName]) {
    throw new Error(`Server "${serverName}" is not configured`);
  }

  delete config.servers[serverName];

  if (config.currentServer === serverName) {
    const nextServer = Object.keys(config.servers).sort()[0];
    config.currentServer = nextServer ?? 'default';
  }

  await saveAuthConfig(config);

  return {
    removed: serverName,
    currentServer: config.currentServer || 'default',
    hasServers: Object.keys(config.servers).length > 0,
  };
}
