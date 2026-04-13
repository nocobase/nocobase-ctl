import { getCurrentEnvName, getEnv, setEnvRuntime } from './auth-store.ts';
import type { CliHomeScope } from './cli-home.ts';
import { generateRuntime } from './runtime-generator.ts';
import { hasRuntimeSync, saveRuntime } from './runtime-store.ts';
import { confirmAction, printInfo, printVerbose, printWarning, setVerboseMode, stopTask, updateTask } from './ui.ts';

const APP_RETRY_INTERVAL = 2000;
const APP_RETRY_TIMEOUT = 120000;

function readFlag(argv: string[], name: string) {
  const exact = `--${name}`;
  const prefix = `--${name}=`;
  const alias = name === 'env' ? '-e' : name === 'scope' ? '-s' : undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === exact) {
      return argv[index + 1];
    }
    if (alias && value === alias) {
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
  const alias = name === 'verbose' ? '-V' : undefined;

  for (const value of argv) {
    if (value === exact) {
      return true;
    }

    if (alias && value === alias) {
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

function isBuiltinCommand(argv: string[]) {
  const commandToken = getCommandToken(argv);
  return commandToken === 'env' || commandToken === 'resource';
}

export function shouldSkipRuntimeBootstrap(argv: string[]) {
  return hasVersionFlag(argv) || isBuiltinCommand(argv);
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

async function fetchSwaggerSchema(
  baseUrl: string,
  token?: string,
  context: {
    envName?: string;
    commandToken?: string;
  } = {},
  options: {
    allowEnableApiDoc?: boolean;
    retryAppAvailability?: boolean;
  } = {},
) {
  let response =
    options.retryAppAvailability === false ? await requestJson(getSwaggerUrl(baseUrl), { token }) : await waitForSwaggerSchema(baseUrl, token);

  if (response.status === 404) {
    if (options.allowEnableApiDoc === false) {
      throw new Error('`swagger:get` returned 404. Check the base URL and enable the `API documentation plugin` if needed.');
    }

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
    throw new Error(formatSwaggerSchemaError(response, { baseUrl, token, ...context }));
  }

  return (response.data?.data ?? response.data) as any;
}

function collectErrorEntries(data: any) {
  if (Array.isArray(data?.errors)) {
    return data.errors.filter(Boolean);
  }

  if (data?.error) {
    return [data.error];
  }

  return [];
}

function hasInvalidTokenError(data: any) {
  return collectErrorEntries(data).some((entry) => entry?.code === 'INVALID_TOKEN');
}

export function formatSwaggerSchemaError(
  response: { status: number; data: any },
  context: { baseUrl: string; token?: string; envName?: string; commandToken?: string },
) {
  if (hasInvalidTokenError(response.data)) {
    const entries = collectErrorEntries(response.data);
    const details = entries
      .map((entry) => {
        const code = entry?.code ? `[${entry.code}] ` : '';
        return `${code}${entry?.message ?? 'Authentication failed.'}`;
      })
      .join('\n');
    const envLabel = context.envName ? ` for env "${context.envName}"` : '';
    const commandHint = context.commandToken
      ? `If \`${context.commandToken}\` is a runtime command, refresh the runtime after updating the token with \`nocobase-ctl env update\`. If it is a typo, run \`nocobase-ctl --help\` to inspect available commands.`
      : 'Run `nocobase-ctl --help` to inspect built-in commands, then refresh runtime commands with `nocobase-ctl env update` after updating the token.';

    return [
      `Authentication failed while loading the command runtime from \`swagger:get\`${envLabel}.`,
      `Base URL: ${context.baseUrl}`,
      details,
      'Update the token with `nocobase-ctl env add --name <name> --base-url <url> --token <token>` or rerun the command with `--token <token>`.',
      commandHint,
    ].join('\n');
  }

  return `Failed to load swagger schema from \`swagger:get\`.\n${JSON.stringify(response.data, null, 2)}`;
}

export function formatMissingRuntimeEnvError(commandToken?: string) {
  if (!commandToken) {
    return [
      'No env is configured for runtime commands.',
      'Run `nocobase-ctl env add --name <name> --base-url <url> --token <token>` first.',
      'If you configure multiple environments later, switch with `nocobase-ctl env use <name>`.',
    ].join('\n');
  }

  return [
    `Unable to resolve runtime command \`${commandToken}\`.`,
    'No env is configured, so the CLI cannot load runtime commands from `swagger:get`.',
    'If this is a built-in command or a typo, run `nocobase-ctl --help` to inspect available commands.',
    'If this should be an application runtime command, run `nocobase-ctl env add --name <name> --base-url <url> --token <token>` and then `nocobase-ctl env update`.',
  ].join('\n');
}

export async function ensureRuntimeFromArgv(argv: string[], options: { configFile: string }) {
  const commandToken = getCommandToken(argv);
  const isRootInvocation = !commandToken;
  setVerboseMode(hasBooleanFlag(argv, 'verbose'));

  if (shouldSkipRuntimeBootstrap(argv)) {
    return;
  }

  const envName = readFlag(argv, 'env') ?? (await getCurrentEnvName());
  const env = await getEnv(envName);
  const baseUrl = readFlag(argv, 'base-url') ?? env?.baseUrl;
  const token = readFlag(argv, 'token') ?? env?.auth?.accessToken;
  const runtimeVersion = env?.runtime?.version;

  if (runtimeVersion && hasRuntimeSync(runtimeVersion)) {
    return;
  }

  if (!baseUrl) {
    if (isRootInvocation) {
      return;
    }
    throw new Error(formatMissingRuntimeEnvError(commandToken));
  }

  updateTask('Loading command runtime...');
  try {
    printVerbose(`Runtime source: ${baseUrl}`);
    const document = await fetchSwaggerSchema(
      baseUrl,
      token,
      { envName, commandToken },
      isRootInvocation
        ? {
            allowEnableApiDoc: false,
            retryAppAvailability: false,
          }
        : undefined,
    );
    const runtime = await generateRuntime(document, options.configFile, baseUrl);
    await saveRuntime(runtime);
    await setEnvRuntime(envName, {
      version: runtime.version,
      schemaHash: runtime.schemaHash,
      generatedAt: runtime.generatedAt,
    });
  } catch (error) {
    if (!isRootInvocation) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    printWarning(`${message}\nContinuing with built-in help because runtime commands could not be loaded.`);
  } finally {
    stopTask();
  }
}

export async function updateEnvRuntime(options: {
  envName?: string;
  baseUrl?: string;
  token?: string;
  configFile: string;
  verbose?: boolean;
  scope?: CliHomeScope;
}) {
  setVerboseMode(Boolean(options.verbose));
  const envName = options.envName ?? (await getCurrentEnvName({ scope: options.scope }));
  const env = await getEnv(envName, { scope: options.scope });
  const baseUrl = options.baseUrl ?? env?.baseUrl;
  const token = options.token ?? env?.auth?.accessToken;

  if (!baseUrl) {
    throw new Error(
      [
        `Env "${envName}" is missing a base URL.`,
        'Update it with `nocobase-ctl env add --name <name> --base-url <url>` first.',
      ].join('\n'),
    );
  }

  updateTask('Loading command runtime...');
  try {
    printVerbose(`Runtime source: ${baseUrl}`);
    const document = await fetchSwaggerSchema(baseUrl, token, { envName });
    const runtime = await generateRuntime(document, options.configFile, baseUrl);
    await saveRuntime(runtime, { scope: options.scope });
    await setEnvRuntime(envName, {
      version: runtime.version,
      schemaHash: runtime.schemaHash,
      generatedAt: runtime.generatedAt,
    }, { scope: options.scope });
    return runtime;
  } finally {
    stopTask();
  }
}
