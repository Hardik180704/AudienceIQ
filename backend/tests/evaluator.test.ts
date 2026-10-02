import { describe, expect, it } from 'vitest';
import {
  MS_PER_DAY,
  computeConditionWindow,
  conditionPasses,
  countInWindow,
  evaluateAudience,
  type EvaluatorEvent,
} from '../src/audiences/evaluator.js';
import type { Condition } from '../src/types.js';

const AS_OF = Date.parse('2026-09-29T00:00:00.000Z');

function at(daysBefore: number, extraDays = 0): number {
  return AS_OF - daysBefore * MS_PER_DAY + extraDays * MS_PER_DAY;
}

function event(anonymousId: string, eventType: string, atMs: number): EvaluatorEvent {
  return { anonymousId, eventType, occurredAtMs: atMs };
}

function viewAtLeast2(withinDays = 7): Condition {
  return { eventType: 'product_view', operator: 'at_least', count: 2, withinDays };
}

function purchaseExactly0(withinDays = 7): Condition {
  return { eventType: 'purchase', operator: 'exactly', count: 0, withinDays };
}

describe('time window computation', () => {
  it('spans the closed interval [asOf - withinDays, asOf]', () => {
    const { startMs, endMs } = computeConditionWindow({ withinDays: 7 }, AS_OF);
    expect(startMs).toBe(AS_OF - 7 * MS_PER_DAY);
    expect(endMs).toBe(AS_OF);
  });

  it('counts events exactly at both inclusive boundaries (ms precision)', () => {
    const { startMs, endMs } = computeConditionWindow({ withinDays: 7 }, AS_OF);
    expect(countInWindow([startMs], startMs, endMs)).toBe(1);
    expect(countInWindow([endMs], startMs, endMs)).toBe(1);
    expect(countInWindow([startMs - 1], startMs, endMs)).toBe(0);
    expect(countInWindow([endMs + 1], startMs, endMs)).toBe(0);
  });
});

describe('operators', () => {
  it('at_least passes when observed >= expected', () => {
    expect(conditionPasses('at_least', 2, 2)).toBe(true);
    expect(conditionPasses('at_least', 4, 2)).toBe(true);
    expect(conditionPasses('at_least', 1, 2)).toBe(false);
  });

  it('exactly passes only on the exact count', () => {
    expect(conditionPasses('exactly', 3, 3)).toBe(true);
    expect(conditionPasses('exactly', 4, 3)).toBe(false);
    expect(conditionPasses('exactly', 2, 3)).toBe(false);
  });
});

describe('evaluateAudience', () => {
  it('matches a positive case and exposes evidence', () => {
    const members = evaluateAudience(AS_OF, [viewAtLeast2(), purchaseExactly0()], [
      event('a', 'product_view', at(6)),
      event('a', 'product_view', at(3)),
    ]);
    expect(members).toHaveLength(1);
    expect(members[0].anonymousId).toBe('a');
    expect(members[0].evidence).toEqual([
      {
        eventType: 'product_view',
        observedCount: 2,
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

  it('fails at_least when the event count is insufficient', () => {
    const members = evaluateAudience(AS_OF, [viewAtLeast2()], [
      event('a', 'product_view', at(1)),
    ]);
    expect(members).toEqual([]);
  });

  it('exactly fails when the observed count is too high', () => {
    const members = evaluateAudience(AS_OF, [purchaseExactly0()], [
      event('a', 'product_view', at(1)),
      event('a', 'purchase', at(2)),
      event('a', 'purchase', at(5)),
    ]);
    expect(members).toEqual([]);
  });

  it('exactly 0 matches users that have other activity but no purchase events', () => {
    const members = evaluateAudience(AS_OF, [purchaseExactly0()], [
      event('a', 'page_view', at(1)),
      event('a', 'product_view', at(1)),
    ]);
    expect(members).toHaveLength(1);
    expect(members[0].evidence).toEqual([
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

  it('ignores events outside the window (older and future)', () => {
    const members = evaluateAudience(AS_OF, [viewAtLeast2()], [
      event('a', 'product_view', at(8)),
      event('a', 'product_view', at(30)),
      event('a', 'product_view', at(0) + 1),
    ]);
    expect(members).toEqual([]);
  });

  it('includes events exactly at the window start and at asOf', () => {
    const members = evaluateAudience(AS_OF, [viewAtLeast2()], [
      event('a', 'product_view', at(7)),
      event('a', 'product_view', at(0)),
    ]);
    expect(members).toHaveLength(1);
    expect(members[0].evidence[0].observedCount).toBe(2);
  });

  it('ANDs multiple conditions and reports per-condition pass flags', () => {
    const members = evaluateAudience(AS_OF, [viewAtLeast2(), purchaseExactly0()], [
      event('a', 'product_view', at(1)),
      event('a', 'product_view', at(2)),
      event('a', 'purchase', at(3)),
    ]);
    expect(members).toEqual([]);
  });

  it('mixes event types without letting them interfere', () => {
    const members = evaluateAudience(AS_OF, [viewAtLeast2(), purchaseExactly0()], [
      event('a', 'product_view', at(1)),
      event('a', 'product_view', at(2)),
      event('a', 'add_to_cart', at(1)),
      event('a', 'page_view', at(2)),
    ]);
    expect(members).toHaveLength(1);
    expect(members[0].evidence.map((e) => e.eventType)).toEqual(['product_view', 'purchase']);
  });

  it('evaluates multiple users independently and sorts them deterministically', () => {
    const events = [
      event('anon_9', 'product_view', at(1)),
      event('anon_9', 'product_view', at(2)),
      event('anon_2', 'product_view', at(2)),
      event('anon_1', 'product_view', at(3)),
      event('anon_1', 'product_view', at(4)),
      event('anon_2', 'product_view', at(30)),
    ];
    const members = evaluateAudience(AS_OF, [viewAtLeast2()], events);
    expect(members.map((m) => m.anonymousId)).toEqual(['anon_1', 'anon_9']);
  });

  it('never matches users that have no events at all', () => {
    const members = evaluateAudience(AS_OF, [purchaseExactly0()], []);
    expect(members).toEqual([]);
  });
});
