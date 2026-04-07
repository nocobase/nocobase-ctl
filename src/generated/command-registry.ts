import { Command } from '@oclif/core';
import Server from '../commands/server/index.js';
import ServerAdd from '../commands/server/add.js';
import ServerList from '../commands/server/list.js';
import ServerRemove from '../commands/server/remove.js';
import ServerUpdate from '../commands/server/update.js';
import ServerUse from '../commands/server/use.js';
import Resource from '../commands/resource/index.js';
import ResourceCreate from '../commands/resource/create.js';
import ResourceDestroy from '../commands/resource/destroy.js';
import ResourceGet from '../commands/resource/get.js';
import ResourceList from '../commands/resource/list.js';
import ResourceQuery from '../commands/resource/query.js';
import ResourceUpdate from '../commands/resource/update.js';
import { createGeneratedFlags, GeneratedApiCommand } from '../lib/generated-command.js';
import { getCurrentServerName, getServer } from '../lib/auth-store.js';
import { toKebabCase } from '../lib/naming.js';
import { loadRuntimeSync } from '../lib/runtime-store.js';

function readServerName(argv: string[]) {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--server') {
      return argv[index + 1];
    }
    if (token.startsWith('--server=')) {
      return token.slice('--server='.length);
    }
  }

  return undefined;
}

function createRuntimeCommand(operation: any) {
  return class RuntimeCommand extends GeneratedApiCommand {
    static summary = operation.summary;
    static description = operation.description;
    static examples = operation.examples as any;
    static flags = createGeneratedFlags(operation);
    static operation = operation;
  };
}

function createRuntimeIndexCommand(commandId: string, operation: any) {
  return class RuntimeIndexCommand extends Command {
    static summary = operation.resourceDescription || operation.resourceDisplayName || `Work with ${commandId}`;
    static description = operation.resourceDescription;

    async run(): Promise<void> {
      this.log(`Use \`nocobase-api ${commandId} --help\` to view available subcommands.`);
    }
  };
}

const registry: Record<string, any> = {
  server: Server,
  'server:add': ServerAdd,
  'server:list': ServerList,
  'server:remove': ServerRemove,
  'server:update': ServerUpdate,
  'server:use': ServerUse,
  resource: Resource,
  'resource:create': ResourceCreate,
  'resource:destroy': ResourceDestroy,
  'resource:get': ResourceGet,
  'resource:list': ResourceList,
  'resource:query': ResourceQuery,
  'resource:update': ResourceUpdate,
};

const serverName = readServerName(process.argv.slice(2)) ?? (await getCurrentServerName());
const server = await getServer(serverName);
const runtime = loadRuntimeSync(server?.runtime?.version);

for (const operation of runtime?.commands ?? []) {
  const commandSegments = operation.commandId.split(' ');
  const commandKey = commandSegments.join(':');
  registry[commandKey] = createRuntimeCommand(operation);

  const topLevelCommandId = commandSegments[0];
  const modulePrefix = toKebabCase(operation.moduleDisplayName || operation.moduleName || '');
  const isTopLevelResource = Boolean(topLevelCommandId && modulePrefix && topLevelCommandId !== modulePrefix);

  if (isTopLevelResource && !registry[topLevelCommandId]) {
    registry[topLevelCommandId] = createRuntimeIndexCommand(topLevelCommandId, operation);
  }
}

export default registry;
