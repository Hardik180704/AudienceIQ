import type { Condition, ConditionEvidence, Member, Operator } from '../types.js';

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface EvaluatorEvent {
  anonymousId: string;
  eventType: string;
  occurredAtMs: number;
}

/**
 * Time-window semantics (documented in docs/DESIGN.md):
 * the window is the closed interval [asOf - withinDays days, asOf], inclusive
 * on both ends. `asOf` is always the reference point; the server clock is
 * never used for evaluation.
 */
export function computeConditionWindow(
  condition: Pick<Condition, 'withinDays'>,
  asOfMs: number,
): { startMs: number; endMs: number } {
  return { startMs: asOfMs - condition.withinDays * MS_PER_DAY, endMs: asOfMs };
}

export function countInWindow(timestamps: number[], startMs: number, endMs: number): number {
  let count = 0;
  for (const atMs of timestamps) {
    if (atMs >= startMs && atMs <= endMs) {
      count += 1;
    }
  }
  return count;
}

export function conditionPasses(operator: Operator, observed: number, expected: number): boolean {
  return operator === 'at_least' ? observed >= expected : observed === expected;
}

/**
 * Pure audience evaluation. Candidates are every anonymous user that has at
 * least one event inside the widest condition window (see docs/DESIGN.md).
 * Each condition counts that condition's event type inside its own window;
 * all conditions must pass (AND) for a user to be a member.
 */
export function evaluateAudience(
  asOfMs: number,
  conditions: Condition[],
  events: EvaluatorEvent[],
): Member[] {
  const windows = conditions.map((condition) => ({
    condition,
    ...computeConditionWindow(condition, asOfMs),
  }));

  const byUser = new Map<string, Map<string, number[]>>();
  for (const event of events) {
    let perType = byUser.get(event.anonymousId);
    if (!perType) {
      perType = new Map<string, number[]>();
      byUser.set(event.anonymousId, perType);
    }
    const timestamps = perType.get(event.eventType) ?? [];
    timestamps.push(event.occurredAtMs);
    perType.set(event.eventType, timestamps);
  }

  const members: Member[] = [];
  for (const [anonymousId, perType] of byUser) {
    const evidence: ConditionEvidence[] = [];
    let allPassed = true;

    for (const { condition, startMs, endMs } of windows) {
      const observedCount = countInWindow(perType.get(condition.eventType) ?? [], startMs, endMs);
      const passed = conditionPasses(condition.operator, observedCount, condition.count);
      if (!passed) {
        allPassed = false;
      }
      evidence.push({
        eventType: condition.eventType,
        observedCount,
        operator: condition.operator,
        expectedCount: condition.count,
        withinDays: condition.withinDays,
        passed,
      });
    }

    if (allPassed) {
      members.push({ anonymousId, evidence });
    }
  }

  members.sort((a, b) => a.anonymousId.localeCompare(b.anonymousId));
  return members;
}
