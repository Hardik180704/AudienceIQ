import type { Db } from './database.js';
import { EVENT_TYPES, type EventType } from '../types.js';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Reference instant the seed data is aligned with. */
export const SEED_AS_OF_MS = Date.parse('2026-09-29T00:00:00.000Z');

/** Milliseconds before the seed reference instant. */
function before(days: number, hours = 0, minutes = 0): number {
  return SEED_AS_OF_MS - (days * DAY_MS + hours * 3_600_000 + minutes * 60_000);
}

/** Milliseconds after the seed reference instant. */
function after(days: number): number {
  return SEED_AS_OF_MS + days * DAY_MS;
}

interface SeedUser {
  anonymousId: string;
  events: { eventType: EventType; atMs: number }[];
}

/**
 * Hand-written scenarios that document the boundary behaviour of the evaluator:
 *
 * With asOf = 2026-09-29T00:00:00.000Z and the example rule
 * (>= 2 product_view within 7 days, exactly 0 purchase within 7 days):
 *
 * - anon_001  mid-window events, no purchase           -> matches
 * - anon_002  product views exactly at both boundaries -> matches
 * - anon_003  only 1 product view                      -> fails at_least
 * - anon_004  events 1 minute inside the boundaries    -> matches
 * - anon_005  view 1 minute outside the window start   -> fails (events outside window)
 * - anon_006  purchase exactly at asOf (inclusive)     -> fails exactly 0
 * - anon_007  only events after asOf                   -> fails at_least (future events ignored)
 * - anon_008  two purchases                            -> fails exactly 0 (too many)
 * - anon_009  one purchase                             -> fails the demo rule,
 *              but matches "purchase exactly 1"
 * - anon_010  several event types, no purchase         -> matches
 */
const curatedUsers: SeedUser[] = [
  {
    anonymousId: 'anon_001',
    events: [
      { eventType: 'product_view', atMs: before(5) },
      { eventType: 'product_view', atMs: before(4) },
      { eventType: 'product_view', atMs: before(2) },
    ],
  },
  {
    anonymousId: 'anon_002',
    events: [
      { eventType: 'product_view', atMs: before(7) },
      { eventType: 'product_view', atMs: before(0) },
    ],
  },
  {
    anonymousId: 'anon_003',
    events: [{ eventType: 'product_view', atMs: before(5) }],
  },
  {
    anonymousId: 'anon_004',
    events: [
      { eventType: 'product_view', atMs: before(6, 23, 59) },
      { eventType: 'product_view', atMs: before(0, 0, 30) },
      { eventType: 'add_to_cart', atMs: before(1, 10) },
    ],
  },
  {
    anonymousId: 'anon_005',
    events: [
      { eventType: 'product_view', atMs: before(7, 0, 1) },
      { eventType: 'product_view', atMs: before(8) },
      { eventType: 'product_view', atMs: after(3) },
    ],
  },
  {
    anonymousId: 'anon_006',
    events: [
      { eventType: 'product_view', atMs: before(1) },
      { eventType: 'product_view', atMs: before(3) },
      { eventType: 'purchase', atMs: before(0) },
    ],
  },
  {
    anonymousId: 'anon_007',
    events: [
      { eventType: 'product_view', atMs: after(1) },
      { eventType: 'product_view', atMs: after(2) },
      { eventType: 'purchase', atMs: after(2) },
    ],
  },
  {
    anonymousId: 'anon_008',
    events: [
      { eventType: 'product_view', atMs: before(1) },
      { eventType: 'product_view', atMs: before(2) },
      { eventType: 'purchase', atMs: before(3) },
      { eventType: 'purchase', atMs: before(5) },
    ],
  },
  {
    anonymousId: 'anon_009',
    events: [
      { eventType: 'product_view', atMs: before(1) },
      { eventType: 'product_view', atMs: before(2) },
      { eventType: 'purchase', atMs: before(4) },
    ],
  },
  {
    anonymousId: 'anon_010',
    events: [
      { eventType: 'page_view', atMs: before(2) },
      { eventType: 'page_view', atMs: before(1, 2) },
      { eventType: 'product_view', atMs: before(2, 5) },
      { eventType: 'product_view', atMs: before(1, 3) },
      { eventType: 'add_to_cart', atMs: before(1, 1) },
    ],
  },
];

/** Deterministic PRNG (mulberry32) so the generated background population is stable. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function backgroundUsers(count: number): SeedUser[] {
  const rand = mulberry32(20260929);
  const users: SeedUser[] = [];
  for (let i = 1; i <= count; i += 1) {
    const eventTypeCount = Math.floor(rand() * 7);
    const events = [];
    for (let j = 0; j < eventTypeCount; j += 1) {
      const eventType = EVENT_TYPES[Math.floor(rand() * EVENT_TYPES.length)];
      const atMs = SEED_AS_OF_MS + Math.floor(rand() * 30 * DAY_MS) - 20 * DAY_MS;
      events.push({ eventType, atMs });
    }
    users.push({ anonymousId: `anon_bg_${String(i).padStart(2, '0')}`, events });
  }
  return users;
}

interface EventRow {
  anonymousId: string;
  eventType: string;
  atMs: number;
}

export function seedEvents(db: Db, options: { force?: boolean } = {}): boolean {
  const row = db.prepare('SELECT COUNT(*) AS count FROM events').get() as { count: number };
  if (row.count > 0 && !options.force) {
    return false;
  }

  const users = [...curatedUsers, ...backgroundUsers(40)];
  const rows: EventRow[] = [];
  for (const user of users) {
    for (const event of user.events) {
      rows.push({ anonymousId: user.anonymousId, eventType: event.eventType, atMs: event.atMs });
    }
  }

  const insert = db.prepare(
    'INSERT INTO events (anonymous_id, event_type, occurred_at) VALUES (?, ?, ?)',
  );
  db.transaction(() => {
    for (const r of rows) {
      insert.run(r.anonymousId, r.eventType, r.atMs);
    }
  })();

  return true;
}

export function ensureSeeded(db: Db): boolean {
  return seedEvents(db);
}
