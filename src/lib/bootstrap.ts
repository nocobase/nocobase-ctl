import { getCurrentServerName, getServer, setServerRuntime } from './auth-store.js';
import { generateRuntime } from './runtime-generator.js';
import { hasRuntimeSync, saveRuntime } from './runtime-store.js';
import { confirmAction, printInfo, printVerbose, printVerboseWarning, setVerboseMode, updateTask } from './ui.js';

const APP_RETRY_INTERVAL = 2000;
const APP_RETRY_TIMEOUT = 120000;

function readFlag(argv: string[], name: string) {
  const exact = `--${name}`;
  const prefix = `--${name}=`;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === exact) {
      return argv[index + 1];
    }
    if (value.startsWith(prefix)) {
      return value.slice(prefix.length);
    }
  }

  return undefined;
}

function hasBooleanFlag(argv: string[], name: string) {
  const exact = `--${name}`;
  const negated = `--no-${name}`;
  const prefix = `--${name}=`;

  for (const value of argv) {
    if (value === exact) {
      return true;
    }

    if (value === negated) {
      return false;
    }

    if (value.startsWith(prefix)) {
      return value.slice(prefix.length) !== 'false';
    }
  }

  return false;
}

function getCommandToken(argv: string[]) {
  for (const token of argv) {
    if (!token || token.startsWith('-')) {
      continue;
    }
    return token;
  }

  return undefined;
}

function hasHelpFlag(argv: string[]) {
  return argv.includes('--help') || argv.includes('-h');
}

function hasVersionFlag(argv: string[]) {
  return argv.includes('--version') || argv.includes('-v');
}

function isRootHelp(argv: string[]) {
  const commandToken = getCommandToken(argv);
  return !commandToken && hasHelpFlag(argv);
}

function isBuiltinCommand(argv: string[]) {
  const commandToken = getCommandToken(argv);
  return commandToken === 'server' || commandToken === 'resource';
}

async function requestJson(url: string, options: { method?: string; token?: string }) {
  const headers = new Headers();
  if (options.token) {
    headers.set('authorization', `Bearer ${options.token}`);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
    });
  } catch (error: any) {
    return {
      status: 0,
      ok: false,
      data: {
        error: {
          message: error?.message ?? 'fetch failed',
        },
      },
    };
  }

  const text = await response.text();
  let data: any = undefined;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = text;
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    data,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAppRestarting(response: { status: number; data: any }) {
  return response.status === 503 && response.data?.error?.code === 'APP_COMMANDING';
}

function shouldRetryAppAvailability(response: { status: number; data: any }) {
  return isAppRestarting(response) || response.status === 0;
}

function getSwaggerUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, '')}/swagger:get`;
}

function getHealthCheckUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, '')}/__health_check`;
}

async function waitForServiceReady(baseUrl: string, token?: string) {
  const healthCheckUrl = getHealthCheckUrl(baseUrl);
  const startedAt = Date.now();
  let notified = false;

  while (Date.now() - startedAt < APP_RETRY_TIMEOUT) {
    const response = await fetch(healthCheckUrl, {
      method: 'GET',
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    }).catch((error: any) => {
      return {
        ok: false,
        status: 0,
        text: async () => error?.message ?? 'fetch failed',
      } as Response;
    });

    const text = await response.text();
    if (response.ok && text.trim().toLowerCase() === 'ok') {
      return;
    }

    if (!notified) {
      printVerbose(`Waiting for health check: ${healthCheckUrl}`);
      updateTask(`Waiting for application readiness (${healthCheckUrl})`);
      notified = true;
    }

    await sleep(APP_RETRY_INTERVAL);
  }

  throw new Error(`The application did not become ready in time. Expected \`${healthCheckUrl}\` to respond with \`ok\`.`);
}

async function waitForSwaggerSchema(baseUrl: string, token?: string) {
  const swaggerUrl = getSwaggerUrl(baseUrl);
  const startedAt = Date.now();

  printVerbose(`Checking swagger schema: ${swaggerUrl}`);

  while (Date.now() - startedAt < APP_RETRY_TIMEOUT) {
    const response = await requestJson(swaggerUrl, { token });
    if (response.ok) {
      return response;
    }

    if (!shouldRetryAppAvailability(response)) {
      return response;
    }

    await waitForServiceReady(baseUrl, token);
  }

  return await requestJson(swaggerUrl, { token });
}

async function confirmEnableApiDoc() {
  return confirmAction('Enable the API documentation plugin now?', { defaultValue: false });
}

async function fetchSwaggerSchema(baseUrl: string, token?: string) {
  let response = await waitForSwaggerSchema(baseUrl, token);

  if (response.status === 404) {
    printInfo('The API documentation plugin is not enabled.');
    const shouldEnable = await confirmEnableApiDoc();
    if (!shouldEnable) {
      throw new Error('`swagger:get` returned 404. Enable the `API documentation plugin` first.');
    }

    const enableUrl = `${baseUrl.replace(/\/+$/, '')}/pm:enable?filterByTk=api-doc`;
    printVerbose(`Enabling API documentation plugin via ${enableUrl}`);
    const enableResponse = await requestJson(enableUrl, { method: 'POST', token });
    if (!enableResponse.ok) {
      throw new Error(
        `Failed to enable the \`API documentation plugin\` via \`pm:enable\`.\n${JSON.stringify(enableResponse.data, null, 2)}`,
      );
    }

    updateTask('Enabled the API documentation plugin. Waiting for application readiness...');
    await waitForServiceReady(baseUrl, token);
    response = await waitForSwaggerSchema(baseUrl, token);
  }

  if (!response.ok) {
    throw new Error(`Failed to load swagger schema from \`swagger:get\`.\n${JSON.stringify(response.data, null, 2)}`);
  }

  return (response.data?.data ?? response.data) as any;
}

export async function ensureRuntimeFromArgv(argv: string[], options: { configFile: string }) {
  const commandToken = getCommandToken(argv);
  setVerboseMode(hasBooleanFlag(argv, 'verbose'));

  if (hasVersionFlag(argv) || isBuiltinCommand(argv)) {
    return;
  }

  const serverName = readFlag(argv, 'server') ?? (await getCurrentServerName());
  const server = await getServer(serverName);
  const baseUrl = readFlag(argv, 'base-url') ?? server?.baseUrl;
  const token = readFlag(argv, 'token') ?? server?.auth?.accessToken;
  const runtimeVersion = server?.runtime?.version;

  if (!commandToken || isRootHelp(argv)) {
    if (!baseUrl) {
      return;
    }
  }

  if (runtimeVersion && hasRuntimeSync(runtimeVersion)) {
    return;
  }

  if (!baseUrl) {
    throw new Error(
      [
        'No server is configured for runtime commands.',
        'Run `nocobase-api server add --name <name> --base-url <url> --token <token>` first.',
        'If you configure multiple servers later, switch with `nocobase-api server use <name>`.',
      ].join('\n'),
    );
  }

  updateTask('Loading command runtime...');
  printVerbose(`Runtime source: ${baseUrl}`);
  const document = await fetchSwaggerSchema(baseUrl, token);
  const runtime = await generateRuntime(document, options.configFile, baseUrl);
  await saveRuntime(runtime);
  await setServerRuntime(serverName, {
    version: runtime.version,
    schemaHash: runtime.schemaHash,
    generatedAt: runtime.generatedAt,
  });
}

export async function updateServerRuntime(options: {
  serverName?: string;
  baseUrl?: string;
  token?: string;
  configFile: string;
  verbose?: boolean;
}) {
  setVerboseMode(Boolean(options.verbose));
  const serverName = options.serverName ?? (await getCurrentServerName());
  const server = await getServer(serverName);
  const baseUrl = options.baseUrl ?? server?.baseUrl;
  const token = options.token ?? server?.auth?.accessToken;

  if (!baseUrl) {
    throw new Error(
      [
        `Server "${serverName}" is missing a base URL.`,
        'Update it with `nocobase-api server add --name <name> --base-url <url>` first.',
      ].join('\n'),
    );
  }

  updateTask('Loading command runtime...');
  printVerbose(`Runtime source: ${baseUrl}`);
  const document = await fetchSwaggerSchema(baseUrl, token);
  const runtime = await generateRuntime(document, options.configFile, baseUrl);
  await saveRuntime(runtime);
  await setServerRuntime(serverName, {
    version: runtime.version,
    schemaHash: runtime.schemaHash,
    generatedAt: runtime.generatedAt,
  });
  return runtime;
}
