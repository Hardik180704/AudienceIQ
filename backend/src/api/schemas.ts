import { z } from 'zod';
import { EVENT_TYPES, OPERATORS } from '../types.js';

const eventTypesList = EVENT_TYPES.join(', ');
const operatorsList = OPERATORS.join(', ');

export const conditionSchema = z.object({
  eventType: z.enum(EVENT_TYPES, {
    message: `eventType must be one of: ${eventTypesList}`,
  }),
  operator: z.enum(OPERATORS, {
    message: `operator must be one of: ${operatorsList}`,
  }),
  count: z
    .number()
    .int('count must be an integer')
    .min(0, 'count must be at least 0')
    .max(1_000_000, 'count must be at most 1000000'),
  withinDays: z
    .number()
    .int('withinDays must be an integer')
    .min(1, 'withinDays must be at least 1')
    .max(365, 'withinDays must be at most 365'),
});

export const previewRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'name is required')
    .max(120, 'name must be at most 120 characters'),
  asOf: z
    .string()
    .datetime({
      offset: true,
      message: 'asOf must be an ISO 8601 timestamp such as 2026-09-29T00:00:00.000Z',
    }),
  conditions: z
    .array(conditionSchema)
    .min(1, 'at least one condition is required')
    .max(10, 'at most 10 conditions are allowed'),
});

export type PreviewRequest = z.infer<typeof previewRequestSchema>;
