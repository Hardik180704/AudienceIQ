import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/api/app.js';
import { migrate, openDatabase } from '../src/db/database.js';
import { seedEvents } from '../src/db/seed.js';

const db = openDatabase(':memory:');
migrate(db);
seedEvents(db);
const app = buildApp({ db });

type InjectResponse = Awaited<ReturnType<typeof app.inject>>;

const ASSIGNMENT_REQUEST = {
  name: 'Viewed but not purchased',
  asOf: '2026-09-29T00:00:00.000Z',
  conditions: [
    { eventType: 'product_view', operator: 'at_least', count: 2, withinDays: 7 },
    { eventType: 'purchase', operator: 'exactly', count: 0, withinDays: 7 },
  ],
};

afterAll(async () => {
  await app.close();
  db.close();
});

async function postPreview(body: unknown): Promise<InjectResponse> {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  return app.inject({
    method: 'POST',
    url: '/v1/audiences/preview',
    payload,
    headers: { 'content-type': 'application/json' },
  });
}

function jsonOf(res: InjectResponse): any {
  return JSON.parse(res.body);
}

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(jsonOf(res)).toEqual({ status: 'ok' });
  });
});

describe('POST /v1/audiences/preview', () => {
  it('returns the audience with members and evidence for the assignment example', async () => {
    const res = await postPreview(ASSIGNMENT_REQUEST);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');

    const body = jsonOf(res);
    expect(body.name).toBe('Viewed but not purchased');
    expect(body.asOf).toBe('2026-09-29T00:00:00.000Z');
    expect(typeof body.total).toBe('number');
    expect(Array.isArray(body.members)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(4);

    const ids = body.members.map((m: { anonymousId: string }) => m.anonymousId);
    expect(ids).toContain('anon_001');
    expect(ids).toContain('anon_002');
    expect(ids).toContain('anon_010');

    const anon001 = body.members.find(
      (m: { anonymousId: string }) => m.anonymousId === 'anon_001',
    );
    expect(anon001.evidence).toEqual([
      {
        eventType: 'product_view',
        observedCount: 3,
        operator: 'at_least',
        expectedCount: 2,
        withinDays: 7,
        passed: true,
      },
      {
        eventType: 'purchase',
        observedCount: 0,
        operator: 'exactly',
        expectedCount: 0,
        withinDays: 7,
        passed: true,
      },
    ]);
  });

  it('excludes known non-matching users', async () => {
    const res = await postPreview(ASSIGNMENT_REQUEST);
    const ids = jsonOf(res).members.map((m: { anonymousId: string }) => m.anonymousId);
    for (const id of ['anon_003', 'anon_005', 'anon_006', 'anon_007', 'anon_008', 'anon_009']) {
      expect(ids).not.toContain(id);
    }
  });

  it('returns an empty audience when no users match', async () => {
    const res = await postPreview({
      name: 'Nothing',
      asOf: '2019-01-01T00:00:00.000Z',
      conditions: [{ eventType: 'purchase', operator: 'at_least', count: 1, withinDays: 7 }],
    });
    const body = jsonOf(res);
    expect(res.statusCode).toBe(200);
    expect(body.total).toBe(0);
    expect(body.members).toEqual([]);
  });

  it('adapts to a different window: users 8 days back are excluded at 7 days but included at 10', async () => {
    const within7 = await postPreview({
      name: 'At least one view, 7 days',
      asOf: '2026-09-29T00:00:00.000Z',
      conditions: [{ eventType: 'product_view', operator: 'at_least', count: 1, withinDays: 7 }],
    });
    const within10 = await postPreview({
      name: 'At least one view, 10 days',
      asOf: '2026-09-29T00:00:00.000Z',
      conditions: [{ eventType: 'product_view', operator: 'at_least', count: 1, withinDays: 10 }],
    });
    expect(jsonOf(within10).total).toBeGreaterThan(jsonOf(within7).total);
  });

  it('is deterministic: the same request produces the same result', async () => {
    const first = await postPreview(ASSIGNMENT_REQUEST);
    const second = await postPreview(ASSIGNMENT_REQUEST);
    expect(jsonOf(first)).toEqual(jsonOf(second));
  });

  describe('validation errors', () => {
    it('rejects an unsupported event type', async () => {
      const res = await postPreview({
        ...ASSIGNMENT_REQUEST,
        conditions: [{ eventType: 'login', operator: 'at_least', count: 2, withinDays: 7 }],
      });
      expect(res.statusCode).toBe(400);
      const body = jsonOf(res);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(body.error.details)).toContain('conditions[0].eventType');
    });

    it('rejects an unsupported operator', async () => {
      const res = await postPreview({
        ...ASSIGNMENT_REQUEST,
        conditions: [{ eventType: 'purchase', operator: 'greater_than', count: 0, withinDays: 7 }],
      });
      expect(res.statusCode).toBe(400);
      expect(jsonOf(res).error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a negative and a non-integer count', async () => {
      for (const count of [-1, 1.5]) {
        const res = await postPreview({
          ...ASSIGNMENT_REQUEST,
          conditions: [{ eventType: 'purchase', operator: 'at_least', count, withinDays: 7 }],
        });
        expect(res.statusCode).toBe(400);
      }
    });

    it('rejects out-of-range withinDays', async () => {
      for (const withinDays of [0, 400]) {
        const res = await postPreview({
          ...ASSIGNMENT_REQUEST,
          conditions: [{ eventType: 'purchase', operator: 'at_least', count: 1, withinDays }],
        });
        expect(res.statusCode).toBe(400);
      }
    });

    it('rejects an invalid asOf', async () => {
      const res = await postPreview({ ...ASSIGNMENT_REQUEST, asOf: 'yesterday' });
      expect(res.statusCode).toBe(400);
      const body = jsonOf(res);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Invalid audience request');
    });

    it('rejects empty conditions', async () => {
      const res = await postPreview({ ...ASSIGNMENT_REQUEST, conditions: [] });
      expect(res.statusCode).toBe(400);
      expect(jsonOf(res).error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects a blank name', async () => {
      const res = await postPreview({ ...ASSIGNMENT_REQUEST, name: '   ' });
      expect(res.statusCode).toBe(400);
      expect(jsonOf(res).error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects malformed JSON bodies', async () => {
      const res = await postPreview('{not json');
      expect(res.statusCode).toBe(400);
      const body = jsonOf(res);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Request body must be valid JSON');
    });

    it('does not expose stack traces', async () => {
      const res = await postPreview('{not json');
      expect(res.body).not.toContain('stack');
      expect(res.body).not.toContain('at ');
    });
  });

  describe('other routes', () => {
    it('answers unknown routes with a JSON error', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/unknown' });
      expect(res.statusCode).toBe(404);
      const body = jsonOf(res);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});
