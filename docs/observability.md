# Observability

Sentry (`@sentry/nextjs`), errors only — no tracing, no session replay. There is no background worker and no alerting elsewhere, so this is the only thing that tells anyone a sync broke.

`tracesSampleRate` is deliberately **absent** rather than `0`. Sentry's `hasSpansEnabled()` treats `0` as "tracing on, sample nothing", which still builds spans and attaches `sentry-trace` / `baggage` headers to every outgoing call.

**Bootstrap.** `instrumentation.ts` `register()` imports `sentry.server.config.ts` or `sentry.edge.config.ts` depending on `NEXT_RUNTIME`; the browser gets `instrumentation-client.ts`. All three call `Sentry.init(sentryInitOptions())` from `lib/observability/sentry.ts`, so the three runtimes cannot drift. That module stays free of server-only imports — it ends up in the client bundle.

**Disabled without a DSN.** `NEXT_PUBLIC_SENTRY_DSN` unset ⇒ `enabled: false`, so dev machines and the test suite never phone home. It is a `NEXT_PUBLIC_` value, so `next build` freezes it into the bundle: the CI image build has to supply it, setting it on the running container is too late.

**What gets captured.**

| Source | Where |
| --- | --- |
| FAILED `SyncJob` | `captureSyncJobFailure` in `executeSyncJob` |
| Unhandled service errors behind a 500 | `captureServiceError` in `mapServiceError` |
| Server render errors and rethrowing Server Actions | `onRequestError` in `instrumentation.ts` |
| Client render errors | `app/global-error.tsx` |

`onRequestError` is server-side only, so a React render error in the browser reaches Sentry solely through `global-error.tsx`. That file replaces the root layout when it renders, so it carries its own `<html>`, stylesheet import and next-themes-compatible theme resolution.

A sync failure is tagged `sync.target`, `sync.operation`, `sync.job_id` and `member.id` — the alert names the member and the system without anyone opening `/admin/sync-jobs`. The job **payload is never attached**; it holds an email and a mobile number.

**Typed errors are not incidents.** `NotFoundError`, `ForbiddenError` and `ValidationError` are control flow. They are filtered in three places: `isExpectedError` (by `name`, not `instanceof`, so `lib/observability/sentry.ts` stays independent of `lib/errors.ts`, which imports `capture.ts`), and again in `beforeSend` by exception type as a backstop.

**PII scrubbing** (`lib/observability/scrub.ts`) runs on every outgoing event. Emails and phone numbers are redacted out of the message, exception values, `extra`, `contexts`, breadcrumbs and the request URL; sensitive keys (`email`, `mobile`, `password`, `token`, `payload`, …) are dropped wholesale; `user` is reduced to `id` + `username`; request headers, cookies and bodies are dropped entirely. Tags are deliberately **not** scrubbed — every tag value is written by our own code, and the phone matcher would otherwise eat identifiers that are long runs of digits.

**And nothing is collected that the scrubber would only have to drop.** The SDK collects every `dataCollection` category by default, so the restrictive baseline is spelled out rather than inherited — `scrub.ts` is the second line of defence, not the only one. `userInfo`, `cookies` and `httpHeaders` are off and `httpBodies` is none; `urlQueryParams` keeps the query string but denies any key containing `name`, which is how a member's own name arrives at `/api/usernames/suggest?firstName=…&lastName=…` — deny terms match as case-insensitive substrings, so the one term covers every spelling. `databaseQueryData` is pinned for a different reason: it reaches nothing while tracing is off, and the pin is what keeps enabling tracing from shipping the values Prisma binds. The remaining span-scoped categories (`queues`, `genAI`, `graphQL`) have no integration behind them at all and are left alone.

**Release tagging.** Every version string has to parse as semver in Sentry, or the release gets no ordering, no `release.version` filter and no regression detection. Release tags stay `vX.Y.Z`, but the version drops the `v`, which Sentry's parser refuses. A tag build is versioned `X.Y.Z`; every other image `0.0.0+<commit>`, with the commit's first seven characters, and creates no release, because production runs tagged releases only. The shared publish workflow passes the version in as `VERSION`, which the Dockerfile hands to `next build` as `NEXT_PUBLIC_APP_VERSION`; a build without it, such as a local `pnpm build`, reports `dev`.

The release name is `backstage@<version>`: release names are shared across the whole Sentry organization, so the project slug keeps them apart. `next.config.ts` builds it once into `NEXT_PUBLIC_SENTRY_RELEASE`, which `sentryInitOptions` sets on every runtime and `withSentryConfig` uploads source maps under, so the two cannot name different releases. Source map upload and the release switch themselves off unless `SENTRY_AUTH_TOKEN` is present — the publish workflow passes that secret to tag builds only, and a local `pnpm build` has none.

**Client events tunnel through `/monitoring`.** `tunnelRoute` in `next.config.ts` makes the browser POST envelopes to our own origin instead of `sentry.io`, which ad blockers filter by hostname. The route is generated by the Sentry plugin, so it exists only in a real build — and it is in `publicPaths` in `proxy.ts`, because an error on the login page has no session cookie yet and a redirect would drop the POST body.

**Structured logging** (`lib/observability/logger.ts`) writes one JSON object per line to stdout/stderr. `/api/usernames/suggest` logs the calling service account (`sub` + service account name) with the outcome on every path — service account names are not PII, so they are logged raw. The calendar logs `calendar_read_failed` when Google will not answer — deliberately a warning rather than a Sentry event, see [Architectural decisions](decisions.md) — and `calendar_page_cap_reached` when a read stops at `MAX_PAGES`, which at studio scale means something is wrong rather than that a real limit was reached. `POST /api/computers/[id]/ping` logs the calling agent and the outcome on every path, `registered` marking a machine's first ping and a rejected body carrying the `details` tree naming the field that failed — nobody reads the 400 the agent gets back. `getShortLinkClicks` logs `short_link_clicks_read_failed` and answers null, which the table shows as an unknown count, for the same reason the calendar does: a blank cell is not an incident. Nothing else logs through it yet.
