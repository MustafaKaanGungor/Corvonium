import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildServer } from './app';
import { loadConfig } from './config';
import { openStore } from './db';

/**
 * Starts the sync server.
 *
 * Everything it keeps lives in one folder — `apps/server/data/` by default, or
 * `CORVONIUM_DATA_DIR` — holding the database and `config.json`. Backing up the
 * server, or moving it to the home server, is copying that folder.
 */
const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(process.env.CORVONIUM_DATA_DIR ?? join(here, '..', 'data'));

const { config, created } = loadConfig(dataDir);

if (process.argv.includes('--print-token')) {
  console.log(config.token);
  process.exit(0);
}

const store = openStore(join(dataDir, 'corvonium.db'));
const app = await buildServer({
  store,
  token: config.token,
  origins: config.origins,
  logger: true,
});

async function shutdown() {
  await app.close();
  store.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await app.listen({ host: config.host, port: config.port });

console.log(`\nCorvonium sync server — data in ${dataDir}`);
if (created) {
  console.log('\nA new token was generated. Paste it into Settings → Sync on each device:');
  console.log(`\n  ${config.token}\n`);
  console.log(
    'It is saved in config.json. Show it again any time with: pnpm --filter @corvonium/server token\n',
  );
}
