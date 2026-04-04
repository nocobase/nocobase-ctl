import { Command } from '@oclif/core';
import { listServers } from '../../lib/auth-store.js';
import { renderTable } from '../../lib/ui.js';

export default class ServerList extends Command {
  static summary = 'List configured servers';

  async run(): Promise<void> {
    const { currentServer, servers } = await listServers();
    const names = Object.keys(servers).sort();

    if (!names.length) {
      this.log('No servers configured');
      return;
    }

    const rows = names.map((name) => {
      const server = servers[name];
      return [name === currentServer ? '*' : '', name, server.baseUrl ?? '', server.runtime?.version ?? ''];
    });

    this.log(renderTable(['Current', 'Name', 'Base URL', 'Runtime'], rows));
  }
}
