export const EVENT_TYPES = [
  'page_view',
  'product_view',
  'add_to_cart',
  'checkout_started',
  'purchase',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const OPERATORS = ['at_least', 'exactly'] as const;

export type Operator = (typeof OPERATORS)[number];

export interface Condition {
  eventType: EventType;
  operator: Operator;
  count: number;
  withinDays: number;
}

export interface AudienceRequest {
  name: string;
  asOf: string;
  conditions: Condition[];
}

export interface ConditionEvidence {
  eventType: EventType;
  observedCount: number;
  operator: Operator;
  expectedCount: number;
  withinDays: number;
  passed: boolean;
}

export interface Member {
  anonymousId: string;
  evidence: ConditionEvidence[];
}

export interface PreviewResponse {
  name: string;
  asOf: string;
  total: number;
  members: Member[];
}
