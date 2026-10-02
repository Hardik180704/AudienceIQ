# AudienceIQ

A lightweight audience builder that evaluates anonymous product events against configurable
behavioral rules and previews the matching audience with per-user evidence.

Implemented for the Mable Audience Builder assignment: one backend that evaluates audience
rules against synthetic event data, and one operator-facing frontend. The frontend never
calculates audience membership itself — it sends the rule set to the backend API and renders
the response.

## Architecture

```text
frontend/ React + TypeScript (Vite)
    │   operator defines rule (name, asOf, AND-combined conditions)
    │   POST /v1/audiences/preview
    ▼
backend/ TypeScript (Fastify)
    │   request validation (zod) ── evaluation service ── pure audience evaluator
    ▼
SQLite (better-sqlite3, parameterized queries)
    event rows: anonymous_id, event_type, occurred_at (Unix ms)
```

## Tech stack

| Layer    | Choice                                       | Why                                            |
| -------- | -------------------------------------------- | ---------------------------------------------- |
| Backend  | TypeScript, Fastify 5, zod, better-sqlite3   | small, explicit, typed HTTP layer + safe SQL   |
| CORS     | @fastify/cors                                | the Vite frontend (:5173) consumes the API cross-origin, so preflights and responses carry proper `Access-Control-*` headers |
| Runtime  | tsx (dev and start)                          | no build artifacts required, strict typecheck  |
| Tests    | vitest                                       | fast unit + API-level tests via `app.inject`   |
| Frontend | React 19 + TypeScript + Vite                 | one screen, minimal deps                       |
| Database | SQLite (WAL mode)                            | zero-config persistence for a local tool       |

## Prerequisites

- Node.js >= 20 (developed on Node 22)
- npm

No database server is needed — SQLite is file-based.

## Setup and run

**Backend** (from `backend/`):

```bash
npm install
npm run db:setup   # recreate schema + seed deterministic synthetic events
npm run dev        # starts on http://localhost:4000
```

The backend also seeds automatically on startup if the database is empty.
`DATABASE_PATH` (default `data/events.db`) and `PORT` (default `4000`) are optional env vars.

**Frontend** (from `frontend/`, in a second terminal):

```bash
npm install
cp .env.example .env   # optional, defaults already point at http://localhost:4000
npm run dev            # opens the operator screen on http://localhost:5173
```

`VITE_API_BASE_URL` is the only frontend configuration knob; the frontend never hardcodes
a deployment URL in code.

## Run tests

```bash
cd backend
npm test         # vitest: evaluator unit tests + API behavior tests
npm run typecheck

cd ../frontend
npm run build    # includes tsc --noEmit (strict)
npm run typecheck
```

## Example API request

```bash
curl -X POST http://localhost:4000/v1/audiences/preview \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Viewed but not purchased",
    "asOf": "2026-09-29T00:00:00.000Z",
    "conditions": [
      { "eventType": "product_view", "operator": "at_least", "count": 2, "withinDays": 7 },
      { "eventType": "purchase", "operator": "exactly", "count": 0, "withinDays": 7 }
    ]
  }'
```

Response (abridged):

```json
{
  "name": "Viewed but not purchased",
  "asOf": "2026-09-29T00:00:00.000Z",
  "total": 4,
  "members": [
    {
      "anonymousId": "anon_001",
      "evidence": [
        { "eventType": "product_view", "observedCount": 3, "operator": "at_least", "expectedCount": 2, "withinDays": 7, "passed": true },
        { "eventType": "purchase", "observedCount": 0, "operator": "exactly", "expectedCount": 0, "withinDays": 7, "passed": true }
      ]
    }
  ]
}
```

`GET http://localhost:4000/health` returns `{ "status": "ok" }`.

## How to preview an audience (operator flow)

1. Open `http://localhost:5173`.
2. Enter an audience name and pick a reference time. The picker resolves to an exact UTC
   instant (ISO 8601, shown under the field) — evaluation is relative to that instant, never
   the server clock, so previews are reproducible.
3. Add, edit, or remove conditions. Each condition picks an event type, an operator
   (`at_least` / `exactly`), a count, and a time window in days. Conditions combine with AND.
4. Choose **Preview audience**. Results list the audience size and every matching anonymous
   user with the observed counts for each condition ("evidence").
5. States handled: initial guidance, loading, empty result, validation feedback, and API
   errors with a visible retry path.

With the seeded data and the example request above, `anon_001`, `anon_002`, `anon_004` and
`anon_010` match; non-matches such as `anon_003` (too few views), `anon_005` (events outside
the window), `anon_006` (purchased exactly at `asOf`) are excluded.

## Project structure

```text
AudienceIQ/
├── backend/
│   ├── src/
│   │   ├── api/            # HTTP route, zod schemas, error mapping, app wiring
│   │   ├── audiences/      # pure evaluator + preview service (DB + evaluation)
│   │   ├── db/             # SQLite schema/migrations, deterministic seed, CLI setup
│   │   ├── types.ts        # domain types shared with the API layer
│   │   └── index.ts        # server entry point
│   └── tests/              # evaluator tests + API tests (vitest)
├── frontend/
│   └── src/                # App (rule builder + states), ConditionRow, API client
├── docs/
│   ├── DESIGN.md           # data model, evaluation, time windows, trade-offs
│   └── AI_USAGE.md         # AI assistance disclosure
└── README.md
```

## Implementation decisions

- **Time windows** are the closed interval `[asOf − withinDays days, asOf]`, both endpoints
  inclusive, with millisecond precision. Boundary behavior is unit-tested at ±1 ms.
- **Candidates** are every anonymous user with at least one event in the widest condition
  window — this lets "exactly 0 purchases" match users who browsed but never purchased.
- **Evaluation is pure** (`src/audiences/evaluator.ts`): grouping, counting, and AND-combining
  do not touch the database, which keeps it independently testable. The service loads one
  range scan of relevant rows, then everything is computed in memory.
- **Deterministic seeds** (`src/db/seed.ts`): hand-written boundary scenarios plus a seeded
  PRNG background population, aligned with `2026-09-29T00:00:00.000Z`.
- **Safe queries**: all SQL is parameterized; the event `event_type` column additionally has
  a CHECK constraint, and requests are validated with zod at the HTTP boundary.
- **No PII**: only anonymous IDs and event metadata are stored; no credentials or payment
  details exist anywhere in the system.
- **Consistent errors**: every failure returns `{ "error": { "code", "message", "details?" } }`
  without stack traces; server-side logging keeps payload exposure minimal.

See `docs/DESIGN.md` for the full rationale and scaling trade-offs.
