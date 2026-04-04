import { Command, Flags } from '@oclif/core';
import { upsertServer } from '../../lib/auth-store.js';
import { isInteractiveTerminal, printVerbose, setVerboseMode, promptText } from '../../lib/ui.js';

export default class ServerAdd extends Command {
  static summary = 'Add or update a NocoBase server';

  static flags = {
    verbose: Flags.boolean({
      description: 'Show detailed progress output',
      default: false,
    }),
    name: Flags.string({
      description: 'Server name',
      default: 'default',
    }),
    'base-url': Flags.string({
      description: 'NocoBase API base URL, for example http://localhost:13000/api',
    }),
    token: Flags.string({
      char: 't',
      description: 'Bearer token',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ServerAdd);
    setVerboseMode(flags.verbose);
    const name = flags.name || 'default';
    const baseUrl =
      flags['base-url'] ||
      (isInteractiveTerminal()
        ? await promptText('Base URL', { defaultValue: 'http://localhost:13000/api' })
        : '');
    const token =
      flags.token ||
      (isInteractiveTerminal() ? await promptText('Bearer token', { secret: true }) : '');

    if (!baseUrl) {
      this.error('Missing base URL. Pass `--base-url <url>` or run in a TTY to enter it interactively.');
    }

    if (!token) {
      this.error('Missing token. Pass `--token <token>` or run in a TTY to enter it interactively.');
    }

    printVerbose(`Saving server "${name}" with base URL ${baseUrl}`);
    await upsertServer(name, baseUrl, token);
    this.log(`Saved server "${name}" and set it as current.`);
  }
}
