# AI usage disclosure

Per the assignment, AI coding assistance was allowed and used to build this repository.

## Tools

- **Kilo** (AI coding agent, GLM model) driving local edits: file scaffolding, dependency
  selection, and code drafting.
- No AI was used for runtime logic in production: all behavior comes from the committed
  source code, which was executed and tested locally.

## Where AI assisted

- Project scaffolding: workspace layout, `package.json`, tsconfig files, `.gitignore`.
- Backend: drafting of the Fastify route wiring, zod request schema, the SQLite
  migration/seed scripts, and the pure audience evaluator.
- Tests: drafting of the evaluator unit tests (boundary behavior at millisecond precision)
  and the API behavior tests (validation matrix, response shape, determinism).
- Frontend: drafting of the React rule-builder components, API client, state handling and
  CSS.
- Documentation: README, `DESIGN.md`, and this file.

## How the implementation was reviewed and tested

All generated code was reviewed and executed during development, not accepted blindly:

- `tsc --noEmit` (strict) passes for both backend and frontend.
- `vitest` suites pass (evaluator + API tests, including malformed-JSON, validation, empty
  and determinism cases).
- Type defects and wrong test expectations surfaced by these checks were fixed hand-in-hand;
  one test expectation was corrected by re-deriving it from the seed data rather than
  trusting the draft.
- Both apps were started locally and the endpoints verified with real requests
  (`/health`, the assignment's example preview request, invalid payloads, empty results).

## Ownership

The submitted code is understood and owned by the developer: the architecture, the
time-window decision, the "candidate users" semantics, the error contract, and the seed
scenarios are the developer's design decisions, verified through the test suite and live
runs described above.
