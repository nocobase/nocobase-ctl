import { Args, Command } from '@oclif/core';
import { setCurrentServer } from '../../lib/auth-store.js';

export default class ServerUse extends Command {
  static summary = 'Switch the current server';

  static args = {
    name: Args.string({
      description: 'Configured server name',
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(ServerUse);
    await setCurrentServer(args.name);
    this.log(`Current server: ${args.name}`);
  }
}
