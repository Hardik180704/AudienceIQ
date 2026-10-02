# AudienceIQ — design notes

## Data model

A single `events` table:

| column       | type    | notes                                             |
| ------------ | ------- | ------------------------------------------------- |
| `id`         | integer | primary key                                       |
| `anonymous_id` | text  | opaque, non-personal identifier                   |
| `event_type` | text    | CHECK-constrained to the five supported types     |
| `occurred_at` | integer | Unix milliseconds (UTC)                          |

`occurred_at` is stored as integer epoch milliseconds: comparisons become plain integer
range checks with millisecond precision, immune to string-format drift. The single index
`idx_events_occurred_at` serves the query the preview actually performs (a range scan on
time). There is no users table — "users" are spatial aggregates of `anonymous_id`s found in
`events`, which matches the anonymous-events framing of the assignment.

Seeding (`src/db/seed.ts`) is fully deterministic: ten hand-written users encode every
behavioral case the evaluator must distinguish (positive matches, insufficient counts,
too-many counts for `exactly`, events one minute outside the window, events exactly at the
window edges, purchases at exactly `asOf`, future-only events, mixed event types), plus a
40-user background population from a seeded mulberry32 PRNG (fixed seed 20260929).

## Audience evaluation approach

The evaluator (`src/audiences/evaluator.ts`) is a pure function:
`evaluateAudience(asOfMs, conditions, events) → members`. The service layer
(`src/audiences/service.ts`) resolves the widest condition window, runs one parameterized
range query (`occurred_at BETWEEN ? AND ?`), then hands rows to the evaluator. The evaluator
groups events by user per event type, counts each condition's type inside the condition's
own window, verifies the operator (`at_least`: `observed >= expected`, `exactly: ===`), ANDs
conditions per user, and emits one evidence object per condition (`observedCount`,
operator, expected count, window, `passed`). Output is sorted by `anonymousId`, so identical
requests produce byte-identical responses.

Candidates are users with **at least one event of any type inside the widest window**. This
deliberate choice makes "exactly 0 purchases within 7 days" match users who browsed without
purchasing, while still requiring activity in the analyzed period; a user with no events in
the window cannot be meaningfully evaluated.

## Time-window semantics

For `withinDays = N` and reference instant `asOf`, the window is the **closed interval**
`[asOf − N days, asOf]`, inclusive at both ends, computed in UTC milliseconds. Rationale:
invisible-microsecond boundaries are the worst kind of bug; explicit inclusivity is easy to
state, easy to test (tests assert ±1 ms behavior), and consistent across conditions.
`asOf` comes from the request — never `Date.now()` — so the same request against the same
seeded database always returns the same audience. Events after `asOf` are ignored.

## API design

`POST /v1/audiences/preview` validates at the HTTP boundary with zod: `name`
(1–120 chars), `asOf` (ISO 8601), 1–10 conditions with the five event types, `at_least` /
`exactly`, integer `count ≥ 0`, integer `withinDays` 1–365. Validation failures return
`400` with `{ error: { code: "VALIDATION_ERROR", message, details } }`; malformed JSON and
unknown routes map into the same error contract; no stack traces leak, and server errors are
logged server-side only. Logs carry request IDs, status codes and coarse counters but not
event payloads. `GET /health` is a constant `{ "status": "ok" }` with no database work.

## Correctness decisions

- SQL is exclusively parameterized; the CHECK constraint plus zod give two independent
  layers against invalid event data.
- Evidence reflects exactly the conditions evaluated, so "why did this user match?" is
  always answerable from the payload.
- A separate preview service keeps HTTP, validation, persistence and evaluation decoupled,
  which is also what made evaluator tests DB-free.

## Scaling trade-off

The current evaluator loads all events in the widest window into memory — fine at
assignment scale (~10⁵ events), and it makes evidence generation trivial. The first
realistic next step would be to push aggregation into SQL: one GROUP BY per condition using
a `(event_type, occurred_at)` index, joining per-user counts, or maintaining per-user daily
counters for sub-second previews at 10⁸ events. Member pagination is the second gap:
previews return all matched users today, which is honest for a preview but needs cursors
once audiences reach tens of thousands. SQLite itself stays defensible in a local,
single-writer tool (embedded, WAL mode, one-file backups); Postgres becomes the right call
only when preview concurrency or cross-process writes justify running a database server.
