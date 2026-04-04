import { Args, Command, Flags } from '@oclif/core';
import { getCurrentServerName, removeServer } from '../../lib/auth-store.js';
import { confirmAction, isInteractiveTerminal, printVerbose, setVerboseMode } from '../../lib/ui.js';

export default class ServerRemove extends Command {
  static id = 'server remove';
  static summary = 'Remove a configured server';

  static flags = {
    force: Flags.boolean({
      char: 'f',
      description: 'Remove without confirmation',
      default: false,
    }),
    verbose: Flags.boolean({
      description: 'Show detailed progress output',
      default: false,
    }),
  };

  static args = {
    name: Args.string({
      description: 'Configured server name',
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ServerRemove);
    setVerboseMode(flags.verbose);
    const currentServer = await getCurrentServerName();

    if (args.name === currentServer && !flags.force) {
      if (!isInteractiveTerminal()) {
        this.error('Refusing to remove the current server without confirmation. Re-run with `--force`.');
      }

      const confirmed = await confirmAction(`Remove current server "${args.name}"?`, { defaultValue: false });
      if (!confirmed) {
        this.log('Canceled.');
        return;
      }
    }

    printVerbose(`Removing server "${args.name}"`);
    const result = await removeServer(args.name);

    this.log(`Removed server "${result.removed}".`);

    if (result.hasServers) {
      this.log(`Current server: ${result.currentServer}`);
      return;
    }

    this.log('No servers configured.');
  }
}
