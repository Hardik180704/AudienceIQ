# AI usage disclosure

Per the assignment, AI coding assistance was allowed and used while building this
repository. The short version: I made the design decisions, directed the tools, reviewed
every change, and verified the running system — the understanding and ownership behind the
submission are mine. Details below.

## My role

- Designed the system: the architecture, the time-window decision, the "candidate users"
  semantics, the error contract, and the seed scenarios.
- Specified what to build and directed the AI agent accordingly, deciding what to accept,
  fix, or reject from its drafts.
- Verified behavior myself: type checks, test runs, and live endpoint checks (below).
- Fixed the defects the checks surfaced, including one test expectation I re-derived from
  the seed data rather than trusting a draft.

## Tools

- **Kilo** (AI coding agent, GLM model) used as a drafting assistant under my direction:
  file scaffolding, dependency selection, and code drafts on my instructions.
- No AI was used for runtime logic in production: all behavior comes from the committed
  source code, which I executed and tested locally.

## Where AI drafted, on my instructions

- Project scaffolding: workspace layout, `package.json`, tsconfig files, `.gitignore`.
- Backend: drafting of the Fastify route wiring, zod request schema, the SQLite
  migration/seed scripts, and the pure audience evaluator.
- Tests: drafting of the evaluator unit tests (boundary behavior at millisecond precision)
  and the API behavior tests (validation matrix, response shape, determinism).
- Frontend: drafting of the React rule-builder components, API client, state handling and
  CSS.
- Documentation: README, `DESIGN.md`, and this file.

## How I reviewed and tested

All generated code was reviewed and executed before acceptance, not taken blindly:

- I ran `tsc --noEmit` (strict) for both backend and frontend; both pass.
- I ran the `vitest` suites (evaluator + API tests, including malformed-JSON, validation,
  empty and determinism cases); all pass.
- Type defects and wrong test expectations surfaced by these checks were fixed
  hand-in-hand; one test expectation was corrected by re-deriving it from the seed data
  rather than trusting the draft.
- I started both apps locally and verified the endpoints with real requests (`/health`,
  the assignment's example preview request, invalid payloads, empty results).

## Ownership

The submitted code is understood and owned by me: the architecture, the time-window
decision, the "candidate users" semantics, the error contract, and the seed scenarios are
my design decisions, verified through the test suite and live runs above.
