import { buildApp } from './api/app.js';
import { openDatabase, migrate } from './db/database.js';
import { ensureSeeded } from './db/seed.js';

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST || '127.0.0.1';

const db = openDatabase();
migrate(db);
ensureSeeded(db);

const app = buildApp({ db });

app.listen({ port, host }).catch((error) => {
  app.log.error(error, 'failed to start server');
  process.exit(1);
});
