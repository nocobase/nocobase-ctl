import { Command } from '@oclif/core';
import { getCurrentServerName, getServer } from '../../lib/auth-store.js';
import { renderTable } from '../../lib/ui.js';

export default class Server extends Command {
  static summary = 'Show the current server';

  async run(): Promise<void> {
    const serverName = await getCurrentServerName();
    const server = await getServer(serverName);

     if (!server?.baseUrl) {
      this.log('No current server is configured.');
      this.log('Run `nocobase server add --name <name> --base-url <url> --token <token>` to add one.');
      return;
    }

    this.log(
      renderTable(['Name', 'Base URL', 'Runtime'], [[serverName, server?.baseUrl ?? '', server?.runtime?.version ?? '']]),
    );
  }
}
