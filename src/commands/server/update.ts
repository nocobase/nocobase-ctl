import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command, Flags } from '@oclif/core';
import { updateServerRuntime } from '../../lib/bootstrap.js';
import { failTask, startTask, succeedTask } from '../../lib/ui.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default class ServerUpdate extends Command {
  static summary = 'Update commands for a server from swagger:get';

  static flags = {
    verbose: Flags.boolean({
      description: 'Show detailed progress output',
      default: false,
    }),
    name: Flags.string({
      description: 'Server name',
    }),
    'base-url': Flags.string({
      description: 'NocoBase API base URL override',
    }),
    token: Flags.string({
      char: 't',
      description: 'Bearer token override',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ServerUpdate);
    const serverLabel = flags.name ?? 'current';

    startTask(`Updating server runtime: ${serverLabel}`);

    try {
      const runtime = await updateServerRuntime({
        serverName: flags.name,
        baseUrl: flags['base-url'],
        token: flags.token,
        configFile: path.join(path.dirname(path.dirname(path.dirname(__dirname))), 'nocobase-cli.config.json'),
        verbose: flags.verbose,
      });

      succeedTask(`Updated server "${serverLabel}" to runtime "${runtime.version}".`);
    } catch (error) {
      failTask(`Failed to update server "${serverLabel}".`);
      throw error;
    }
  }
}
