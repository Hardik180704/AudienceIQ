import { defaultDatabasePath, migrate, openDatabase } from './database.js';
import { seedEvents } from './seed.js';

/**
 * CLI helper: creates the schema and (re)seeds deterministic data.
 * Run with `npm run db:setup` from the backend directory.
 */
const db = openDatabase();
migrate(db);
const inserted = seedEvents(db, { force: true });

const { count } = db.prepare('SELECT COUNT(*) AS count FROM events').get() as { count: number };
console.log(`Seeded ${count} synthetic events into ${defaultDatabasePath()} (inserted=${inserted}).`);
db.close();
