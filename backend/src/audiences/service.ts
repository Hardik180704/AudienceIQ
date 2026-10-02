import type { PreviewRequest } from '../api/schemas.js';
import type { Db } from '../db/database.js';
import { MS_PER_DAY, evaluateAudience } from './evaluator.js';
import type { AudiencePreviewResponse } from '../types.js';

interface RawEventRow {
  anonymous_id: string;
  event_type: string;
  occurred_at: number;
}

/**
 * Fetches all events inside the widest condition window (the candidate set)
 * and delegates counting + evaluation to the pure evaluator. One range scan
 * over `occurred_at` is enough for any number of conditions >= the widest one.
 */
export function previewAudience(db: Db, request: PreviewRequest): AudiencePreviewResponse {
  const asOfMs = Date.parse(request.asOf);
  const widestWindowDays = Math.max(...request.conditions.map((c) => c.withinDays));
  const startMs = asOfMs - widestWindowDays * MS_PER_DAY;

  const rows = db
    .prepare(
      `SELECT anonymous_id, event_type, occurred_at
         FROM events
        WHERE occurred_at >= ? AND occurred_at <= ?`,
    )
    .all(startMs, asOfMs) as RawEventRow[];

  const events = rows.map((row) => ({
    anonymousId: row.anonymous_id,
    eventType: row.event_type,
    occurredAtMs: row.occurred_at,
  }));

  const members = evaluateAudience(asOfMs, request.conditions, events);

  return {
    name: request.name,
    asOf: request.asOf,
    total: members.length,
    members,
  };
}
