# Testing

Vitest + Testcontainers (real PostgreSQL). Service-layer tests are integration tests against the container; routes and actions get smoke tests for auth and error mapping only.

- `tests/setup.ts` — starts the container in `beforeAll`, migrates, truncates all tables in `afterEach`, stops in `afterAll`. Exports `getTestPrisma()` and `mockPrisma()`.
- `tests/helpers.ts` — `mockSession(overrides)` / `mockNoSession()` replace `@/lib/session` for route tests. `mockAuthApi(getSession)` mocks `next/headers` and `@/lib/auth` *underneath* it instead, so action and session tests run the real helpers and genuinely exercise the role predicates. `mockWebsiteOrchestrators()` and `mockGoogleGroupOrchestrators()` stub the external fan-out and return their mocks, so a test can fail one call and assert on it. Each factory is annotated with the module it replaces, because `vi.doMock` swaps one wholesale: an orchestrator a factory leaves out is `undefined` at the call site, and the annotation turns that into a typecheck failure in the helper.
- Route tests use `vi.resetModules()` + `vi.doMock()` + dynamic `import()` to swap in the test database and session before each test.

Coverage includes `app/**/*.ts`, `lib/**/*.ts`, `types/**/*.ts` and, named one by one because a root glob would pull in every config file, `proxy.ts` and `instrumentation.ts` — route protection and the Sentry bootstrap are not wiring. It excludes `app/generated/**`, `app/api/auth/**`, and the config/wiring files `lib/auth.ts`, `lib/auth-client.ts`, `lib/prisma.ts`, `lib/utils.ts`. The 100% figure is enforced, not just documented: `coverage.thresholds` in `vitest.config.ts` fails `pnpm test:coverage` — and so CI — on a drop.
