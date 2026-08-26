@AGENTS.md

# Backstage

Internal portal for a university TV studio (BSS). Source of truth for member data, syncing to
Authentik (identity provider) and a legacy Drupal website, plus tooling to reconcile a Google Group
mailing list. Also the studio's landing page.

Scale: ~30 active members, growing alumni list (~10 per semester). Single deployment, no tenancy,
no public traffic.

This file describes the system **as it exists**.

---

## Rules

Breaking these causes real damage, not style nits.

1. **`pnpm`, never `npm`/`yarn`.** Lockfile is `pnpm-lock.yaml`.
2. **This is Next.js 16, not 15.** APIs and file conventions differ from most training data — read
   the relevant guide under `node_modules/next/dist/docs/` before writing framework code. Route
   protection is `proxy.ts`, *not* `middleware.ts`.
3. **Never edit `app/generated/`** — Prisma output. Change `prisma/schema.prisma` and regenerate.
4. **Biome, not ESLint/Prettier.** `next lint` is disabled; `pnpm lint` is `biome check`.
   lint-staged formats on commit, so running `--write` by hand is usually unnecessary.
5. **Conventional commits** — enforced by commitlint. Subject lowercase, ≤72 chars.
6. **All user-facing text is Hungarian.** Code identifiers and enum values stay English.
7. **Coverage is at 100%** (statements/branches/functions/lines) for everything in the coverage
   include set. Land tests with the change. Genuinely unreachable defensive branches get a
   `/* v8 ignore next -- reason */` rather than dragging the number down.
8. **Docker must be running** for tests — Testcontainers spins a real PostgreSQL.

---

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm dev:setup` | One-command onboarding: `.env`, Postgres container, generate, migrate, seed |
| `pnpm check` | `biome check` + `tsc --noEmit` — run before declaring done |
| `pnpm typecheck` | Types only |
| `pnpm lint` | Biome only (no writes) |
| `pnpm test` | Full suite (needs Docker) |
| `pnpm test:watch` | Watch mode |
| `pnpm test:coverage` | With V8 coverage |
| `pnpm test:service` | Watch mode over `tests/services/` only |
| `pnpm db:migrate` | `prisma migrate dev` — creates + applies a migration |
| `pnpm db:generate` | Regenerate the Prisma client into `app/generated/prisma/` |
| `pnpm db:reset` | Drop, recreate, re-migrate, reseed (`--skip-seed` to stop after migrating) |
| `pnpm db:seed` | Wipe and reseed dev data (`--reset-user` re-asks who you are) |
| `pnpm build` | Production build (standalone output) |
| `pnpm authentik:contract` | Diff Authentik's OpenAPI spec against the committed snapshot (`--update` to rewrite it) |

Environment variables: see `.env.example`. It is the complete list and is kept in sync.

### Dev data

`pnpm db:seed` wipes the dev database and writes ~43 invented members (Hungarian names, none
real), leadership roles, an `AuthentikGroup` registry, per-member timeline and audit history, and
sync jobs including two FAILED and two SKIPPED ones so `/admin/sync-jobs`, its retry button and
every status badge have something to show. Semesters are relative to `currentSemester()`, and
member ids are the local prefix plus a hash of the seeded email, so member URLs survive a reseed.

The first run asks for your name and your Authentik `sub` and stores the answers in
`.dev-user.json` (gitignored). That row is created with your `sub` as its `id`, so logging in
through SSO lands on it instead of creating a second record.

The seeded `AuthentikGroup` UUIDs are invented, so a default seed cannot touch a real instance.
To test group sync against a dev Authentik, write the real UUIDs to `.dev-authentik-groups.json`
(gitignored, `[{ "displayName": "Főszerkesztő", "authentikGroupId": "<uuid>" }, …]`): entries
whose `displayName` matches a seeded group replace its UUID, the rest are added to the registry.
Real Authentik identifiers stay out of the repo, same as the group UUIDs in `.env`. Only *your*
member row resolves in Authentik: it is seeded with your `sub`, while every invented member carries
a local-prefixed id, so assigning *them* a role produces `SKIPPED` jobs and never calls anything. Assign
the role to yourself. For the same reason the seeded Authentik `CREATE_USER` and the FAILED
Authentik job both belong to your row — it is the only one a real retry can reach.

The scripts refuse to run against a database whose host is not local unless passed `--force`.

---

## Repository structure

- `app/(portal)/` — authenticated pages (members, admin, dashboard)
- `app/api/` — REST routes: `members/`, `members/[id]/{roles,avatar}`, `usernames/suggest`,
  `auth/[...all]`
- `app/avatars/[...path]/route.ts` — serves avatar bytes from whichever storage backend is active
- `lib/services/` — business logic (`members.ts`, `sync-jobs.ts`, `usernames.ts`). All real work
  happens here. `member-schemas.ts` holds the Zod schemas, split out so client forms can import
  them.
- `lib/actions/` — Server Actions; thin wrappers around services
- `lib/authentik/` — Authentik REST client (`client`, `users`, `groups`)
- `lib/website/` — legacy Drupal client (`client.ts` transport, `users.ts` operations)
- `lib/sync/` — `executor.ts` + per-target `{authentik,website}/{operations,orchestrators,group-mapping}.ts`
- `lib/storage/` + `lib/avatar-storage.ts` — avatar storage facade and local/S3 backends
- `lib/errors.ts` — typed error hierarchy + `mapServiceError`
- `lib/api-client-auth.ts` — bearer verification for machine-to-machine callers
- `lib/rate-limit.ts` — in-memory fixed-window rate limiter. State is per process, so every limit
  it enforces is per replica; the single-replica deployment is what makes that correct
- `lib/observability/` — `sentry.ts` (shared init options), `scrub.ts` (PII redaction),
  `capture.ts` (capture helpers), `logger.ts` (structured logging)
- `lib/members.ts`, `lib/nav-labels.ts`, `lib/sync-jobs.ts` — display helpers + Hungarian labels
- `components/form.tsx` — TanStack Form `useAppForm` plus the field/submit components every form
  is built from
- `components/ui/` — shadcn/ui primitives
- `scripts/` — dev tooling run with `tsx`: `dev-setup.ts`, `seed-dev.ts` (+ `seed-data.ts` roster,
  `dev-user.ts` identity prompt, `dev-groups.ts` Authentik group UUIDs), `reset-db.ts`, and
  `authentik-contract.ts` + its `authentik-contract.json` snapshot
- `tests/` — mirrors the source layout; `setup.ts` spins Testcontainers Postgres
- `proxy.ts` — route protection (Next.js 16 convention)
- `instrumentation.ts`, `instrumentation-client.ts`, `sentry.{server,edge}.config.ts` — Sentry
  bootstrap (Next.js 16 conventions)
- `prisma/schema.prisma` — single schema, client generated to `app/generated/prisma/`
- `Dockerfile`, `docker-entrypoint.sh`, `docker-compose.yml` — production image and stack;
  `docker-compose.dev.yml` is just the dev Postgres
- `.github/workflows/` — `ci.yml`, `docker-publish.yml`, `authentik-contract.yml`, all sharing the
  `.github/actions/setup` composite: `pnpm/setup`, which reads the pnpm version from
  `packageManager` and takes the runtime as an input, so `.nvmrc` is read into one first rather
  than pointed at. It needs pnpm 11 or newer. `.github/renovate.json` for dependency updates

---

## Where to make a change

**Add or change a Member field**
1. `prisma/schema.prisma` → `pnpm db:migrate`
2. `CreateMemberSchema` / `UpdateMemberSchema` in `lib/services/member-schemas.ts` (re-exported
   from `members.ts`) — the forms validate against the `*FormSchema` variants derived there
3. Should it reach Authentik? Add to `AUTHENTIK_SYNCED_FIELDS` *and* `buildAuthentikAttributes()`
   (`lib/sync/authentik/orchestrators.ts`) — the attribute set is sent wholesale, see below
4. Should it reach the website? Add to `WEBSITE_SYNCED_FIELDS` *and* the field mapping inside
   `updateMember`, and to `UpdateWebsiteUserInput` (`lib/website/users.ts`)
5. UI: `members/new/page.tsx`, `members/[id]/member-edit-sheet.tsx`, table `columns.tsx`
6. Tests: `tests/services/members.test.ts`

**Add a sync operation**
1. Low-level call in `lib/authentik/*` (then see below) or `lib/website/users.ts`
2. Register the handler in `lib/sync/<target>/operations.ts` — it receives
   `(payload, memberId, prisma)` and resolves external IDs itself at execute time
3. Orchestrator in `lib/sync/<target>/orchestrators.ts`: create the `SyncJob` row, then
   `executeSyncJob`
4. Call the orchestrator from `lib/services/`, collect failures into `syncErrors`
5. A new operation name also needs a `SyncOperation` enum value + migration

**Add or change an Authentik API call** — any new endpoint, query parameter or request/response
field in `lib/authentik/*` has to be mirrored into the contract check, or it goes unwatched.
1. The call itself in `lib/authentik/{client,users,groups}.ts`
2. Add or amend its entry in `CONTRACT` (`scripts/authentik-contract.ts`) — one object per
   `method` + `path`, listing the `query` parameters, `request` fields and `response` fields the
   client actually touches. Nothing derives this from the source, so a call with no entry passes
   the check silently forever
3. `pnpm authentik:contract --update`, and commit the regenerated
   `scripts/authentik-contract.json` with the change — a stale snapshot fails the next PR that
   touches `lib/authentik/**`
4. Removing a call means removing its `CONTRACT` entry too, otherwise the check guards a field
   nobody reads

**Add an API route** — keep it a thin adapter: `requireAuth()`/`requireRole()` from
`lib/session.ts`, call the service, wrap failures in `mapServiceError`. No business logic.

**Add a portal page** — `app/(portal)/…/page.tsx` exporting `metadata`, a Hungarian label in
`lib/nav-labels.ts` (used by both sidebar and breadcrumbs), and a sidebar entry in
`components/app-sidebar.tsx`.

---

## Data model

Prisma client generated to `app/generated/prisma/`, using the `@prisma/adapter-pg` driver adapter
over a raw `pg` connection.

**Member** — central record. `id` is the member's **Authentik user UUID**: the OIDC `sub` claim at
login and the `uuid` the sync layer filters `/core/users/` on to resolve a pk. There is no separate
`authentikId` — `id` serves both, which is why Authentik's provider **subject mode must be "Based
on the User's UUID"** (see Auth).

Members with no Authentik account — imported alumni, nobody the app created — carry an id prefixed
with `LOCAL_MEMBER_ID_PREFIX` instead (`localMemberId()` / `hasAuthentikAccount()` in
`types/index.ts`). The prefix is the *only* record that the account is missing, and unlike the
random UUID it replaces it cannot be mistaken for a real one. Its value is a meaningless token
rather than a descriptive word because member ids reach the public site inside avatar URLs — refer
to the constant, not the literal. Giving such a member an account later means rewriting the id to
the new UUID; Prisma's required relations default to `onUpdate: Cascade`, so a single
`UPDATE "Member" SET id = …` carries every child row with it.

`websiteUserId` is the Drupal numeric uid on bsstudio.hu. Nullable, internal, never user-editable
and not shown in the UI. Populated from the website `CREATE_USER` response, or by the import script
for pre-existing members. Later website syncs target the account by this uid directly. The website
*username* is whatever Authentik settled on at create time and is not stored.

**LeadershipRole** — only *active* roles, one per member (1:1 via `@unique` on `memberId`). Holds a
free-text `label` and an array of `authentikGroupIds`. When a role ends the row is deleted and a
`TimelineEntry` snapshot is written instead.

**AuthentikGroup** — registry of known Authentik groups powering the role-assignment checklist.
Populated manually by admins. The Authentik UUID is the primary key — no separate cuid.

**TimelineEntry** — human-readable history: status promotions, role changes, archival, reactivation.

**AuditLog** — field-level diff log, `{ field: { old, new } }` JSON. Written on every mutation.
A status change and a field update in the same request produce **separate** entries
(`STATUS_CHANGED` + `MEMBER_UPDATED`).

**SyncJob** — one row per external call. PENDING → IN_PROGRESS → SUCCESS | FAILED, plus `SKIPPED`
for a call that was never attempted (see Sync architecture). `memberId` is a required FK. Failed
jobs surface at `/admin/sync-jobs` and are individually retryable; `SKIPPED` is not retryable.

**GoogleGroupEntry** — reconciliation state for the mailing list. Annotations survive re-uploads.

### Membership status

```prisma
enum MembershipStatus {
  MEMBER_CANDIDATE_CANDIDATE // jelölt-jelölt
  MEMBER_CANDIDATE           // jelölt
  MEMBER                     // stúdiós
  ACTIVE_ALUMNI              // aktív öregtag
  ALUMNI                     // öregtag
}
```

`ACTIVE_ALUMNI` and `ALUMNI` map to the **same** Authentik group — the distinction exists only in
the DB and the UI, with no permission difference.

### Semester format

One string: `"2025/2026/1"` (autumn) or `"2025/2026/2"` (spring) — start year / end year / semester
number. Sorts correctly as a string. Helpers in `types/index.ts`: `parseSemester`, `formatSemester`
(`"2025 ősz"`), `currentSemester`, and `semesterSchema` for validation.

---

## Auth and permissions

Better Auth with the `genericOAuth` plugin against Authentik's OIDC discovery URL. Handler at
`app/api/auth/[...all]/route.ts`, client helper in `lib/auth-client.ts`. The plugin registers
Authentik as an ordinary social provider, so login is `signIn.social({ provider: "authentik" })` on
the core endpoints — there is no client-side plugin, the redirect URI registered in Authentik is
`<origin>/api/auth/callback/authentik`, and PKCE is on.

`accountIssuer` is pinned to `AUTHENTIK_ISSUER` rather than left to discovery. A discovery fetch
that returns nothing throws out of plugin init, which fails *every* auth route including
`/get-session`; pinned, an unreachable Authentik only breaks login.

On login `mapProfileToUser` reads the `groups` claim and derives a role, and carries the Authentik
`sub` in an `authentikSub` field; a `databaseHooks.user.create.before` hook promotes that to the
user row `id`, so it matches the Member `id`. None of these `additionalFields` may carry
`input: false` — better-auth strips such fields from the OAuth profile as well, which leaves every
login unnamed, `MEMBER`, and keyed on a generated id.

**The provider's subject mode must be "Based on the User's UUID"** (Applications → Providers → the
Backstage provider → Advanced protocol settings). Authentik's default is a *hashed* user id, which
is not the UUID the REST API filters on — so with the default, `sub` matches no Member row and
every login creates a duplicate keyed on the hash, while `getUserPk` fails to resolve anything.
Nothing in the app can detect this; it is instance configuration.

The handler mounts Better Auth's whole router, so `hooks.before` 404s every path outside
`ALLOWED_AUTH_PATHS` (`lib/auth.ts`). Only the OIDC round trip (`/sign-in/social`,
`/callback/:id`), `/get-session`, `/sign-out` and `/error` stay reachable; passwords, account
linking and `/update-user` — which without `input: false` would let a member set their own `role` —
belong to Authentik.

`proxy.ts` lets `/login`, `/api/auth` and `/api/usernames` through and redirects everything else to
`/login` when no session cookie is present, preserving the original path as `callbackUrl`. Its
matcher excludes static assets and image extensions — which is why avatar URLs are readable without
auth. `/api/usernames` is public to the proxy because it carries a bearer token instead of a session
cookie; the route itself does the authenticating.

Session helpers in `lib/session.ts` return `Session | NextResponse`, so routes early-return the
response: `requireAuth()` (401) and `requireRole(...roles)` (401/403).

| Role | Derived from | Can |
| --- | --- | --- |
| `MEMBER` | everyone else | view member list, view/edit own profile |
| `LEADER` | `AUTHENTIK_GROUP_LEADERSHIP` | + edit any member, change status, assign/remove roles, create, archive |
| `ADMIN` | `AUTHENTIK_GROUP_ADMIN` | + view audit log, retry failed sync jobs |

`resolveUserRole(groups)` in `types/index.ts` implements the mapping.

### Machine-to-machine access

Other studio apps authenticate with Authentik **client credentials** against the same login
provider — no second provider, application or redirect URI. One service account per consuming app,
added to the group named by `AUTHENTIK_GROUP_API_CLIENTS`; the account's app password is the
per-app secret, so revoking access means deleting the account.

`requireApiClient(req)` (`lib/api-client-auth.ts`) does `jwtVerify` + `createRemoteJWKSet` against
`AUTHENTIK_ISSUER` (JWKS at `<issuer>/jwks/`, memoized per issuer), audience
`AUTHENTIK_CLIENT_ID`, then requires the API-client group in the `groups` claim. It returns a
`NextResponse` on failure like the session helpers do, and the caller identity (`sub`,
`preferred_username`) otherwise.

It lives **outside** `lib/session.ts` on purpose. Login and client-credentials tokens share an
issuer and an audience, so a member's browser access token is a structurally valid bearer here —
group membership is the only boundary. In the shared helpers it would become a valid credential on
every route, admin ones included.

---

## API endpoints

`GET /api/members` — list; `?archived=true` includes archived (default excludes). Includes
`leadershipRole`, ordered by status then lastName.

`POST /api/members` — create (leader/admin). Requires `firstName`, `lastName`, `email`; optional
`nickname`, `mobile`, `university`, `major`, `dormRoom`. Status defaults to
`MEMBER_CANDIDATE_CANDIDATE`, `joinedSemester` from `currentSemester()`. Writes a `TimelineEntry`
and an `AuditLog`.

`GET /api/members/[id]` — member with `leadershipRole` and full `timeline` (newest first).

`PATCH /api/members/[id]` — members may edit themselves, leaders/admins anyone. Status changes
require leader/admin. Timeline entry only on status change.

`DELETE /api/members/[id]` — soft archive (leader/admin): sets `archived` + `archivedAt`.

`PUT /api/members/[id]/roles` — assign/update a leadership role (leader/admin). `label` +
`authentikGroupIds`. Identical label and groups is a no-op returning 200 with no audit entry. New
assignment writes `ROLE_ASSIGNED`, an update writes `ROLE_CHANGED`.

`DELETE /api/members/[id]/roles` — remove (leader/admin). Returns `{ removed: true }`; silent
no-op when no role exists.

`POST`/`DELETE /api/members/[id]/avatar` — upload/remove (self, or leader/admin).

`GET /api/usernames/suggest?firstName=…&lastName=…` — machine-to-machine only (bearer token, see
Machine-to-machine access). Returns `{ username }` and nothing else. Read-only: it neither creates
nor reserves, so the name can be taken by the time the caller uses it — callers handle the create
failure. 30 requests per minute per service account, and a 60-second in-memory cache per name,
because every miss fans out to Authentik's user API once per collision candidate.

`websiteUserId` is never accepted on any write — it is set by sync and import only.

Admin-only resources (sync jobs, audit log) deliberately have **no** REST routes; see
Architectural Decisions.

---

## External integrations

### Authentik

Three independent uses:

1. **Login (OIDC)** — `AUTHENTIK_ISSUER`, `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_CLIENT_SECRET`
2. **User/group management (REST)** — `lib/authentik/*`, using `AUTHENTIK_URL`,
   `AUTHENTIK_API_TOKEN`
3. **Machine-to-machine tokens** — client credentials against the *same* provider as login, no
   extra config beyond `AUTHENTIK_GROUP_API_CLIENTS`

Group **names** (matched against the OIDC groups claim): `AUTHENTIK_GROUP_LEADERSHIP`,
`AUTHENTIK_GROUP_ADMIN` for role resolution, `AUTHENTIK_GROUP_API_CLIENTS` for API clients.

Group **UUIDs** (used by the sync layer): `AUTHENTIK_GROUP_CANDIDATE_CANDIDATE`,
`AUTHENTIK_GROUP_CANDIDATE`, `AUTHENTIK_GROUP_MEMBER`, `AUTHENTIK_GROUP_ALUMNI` (covers both alumni
statuses), and `AUTHENTIK_GROUP_LEADERSHIP_UUID` — note this is a *different* variable from
`AUTHENTIK_GROUP_LEADERSHIP`, which holds a name.

**Username derivation.** First Hungarian letter of the first name + full last name, lowercase,
diacritics stripped, hyphens removed: `Kovács János → jkovacs`, `Csaba Nagy → csnagy`.
`deriveUsername()` in `types/index.ts`, collisions resolved by `findAvailableUsername()`
(`lib/authentik/users.ts`). Not overridable — there is no stored username field.

Both are paired in `lib/services/usernames.ts`: `resolveAvailableUsername()` (uncached, used by
`createAuthentikUser`) and `suggestUsername()` (cached, used by the suggestion endpoint). Member
creation and other studio apps therefore take the same path.

**Contract drift is watched, not tested.** `pnpm authentik:contract`
(`scripts/authentik-contract.ts`) downloads goauthentik's OpenAPI spec, extracts the shape of
exactly what the `CONTRACT` list names, and diffs it against `scripts/authentik-contract.json`.
No running Authentik and no credentials are involved, so it runs anywhere. It reads the spec from
`main` rather than a release tag on purpose: `main` runs ahead of the deployed version, so a field
rename surfaces here before the instance is upgraded into it. `AUTHENTIK_SCHEMA_URL` points it at
a local file or a pinned release instead.

`.github/workflows/authentik-contract.yml` runs it weekly, on `workflow_dispatch`, and on PRs
touching `lib/authentik/**` or the script. A PR run signals by going red; a scheduled run has
nobody watching, so it opens an issue instead, deduplicated by title against the open ones.

The check only sees what `CONTRACT` lists — see *Add or change an Authentik API call* above.
Nothing links it to `lib/authentik/*` automatically. It also covers only the `/api/v3` REST
surface: the OIDC endpoints behind `lib/auth.ts` and `lib/api-client-auth.ts`
(`.well-known/openid-configuration`, `/jwks/`) are not in Authentik's spec at all.

### Legacy website (Drupal at bsstudio.hu)

`WEBSITE_URL`, `WEBSITE_ADMIN_USERNAME`, `WEBSITE_ADMIN_PASSWORD`. There is no API — the client
logs in as an admin and scrapes/posts Drupal admin forms, with a hand-rolled cookie jar (Node's
`fetch` has none) and form-token extraction via cheerio. Expect it to be slow and brittle relative
to Authentik.

---

## Sync architecture

Every external mutation creates a `SyncJob` row and executes it **synchronously**
(`executeSyncJob`, `lib/sync/executor.ts`). Failures persist as `FAILED` rows at
`/admin/sync-jobs`, retried manually via `retrySyncJobAction`. There is no background worker.

Service code calls **orchestrators**, never handlers directly. An orchestrator creates the job row
then executes it. `createAuthentikUser` is the one exception: it runs *before* the Member exists
(its `sub` becomes the Member `id`), so it bypasses the job row and the service fabricates a
SUCCESS row afterwards.

Handlers receive `(payload, memberId, prisma)` and resolve external identifiers **at execute time** —
Authentik via `getUserPk(memberId)`, the website via `websiteUserId` on the member row. Resolving
late rather than baking IDs into the payload is what makes retry work: a job that failed because a
member had no `websiteUserId` succeeds on retry once an admin backfills it. A missing link throws,
so it lands as a visible `FAILED` row instead of being silently skipped.

**Members with no Authentik account are skipped, not failed.** Every Authentik orchestrator goes
through one choke point (`runAuthentikJob`, `lib/sync/authentik/orchestrators.ts`) that checks
`hasAuthentikAccount(memberId)` first. A prefixed id has no user to resolve a pk from, so unlike a
missing `websiteUserId` no admin action could ever make the job succeed. The row is still written,
as `SKIPPED` with `result: { reason }` — an id wrongly carrying the prefix would otherwise stop
syncing silently forever. No handler runs, `attempts` stays 0, nothing reaches Sentry.

Every FAILED job is also reported to Sentry from inside `executeSyncJob` — see Observability.

API routes return HTTP **207** with `{ ..., syncErrors: string[] }` when the DB write succeeded but
a sync step failed. The UI shows a warning toast, not an error.

Website specifics: `CREATE_USER` / `UPDATE_USER` / `DEACTIVATE_USER` are wired into create, update,
status change, archive and bulk operations. Status changes flow through `UPDATE_USER` via the
`position` field — there is no dedicated status orchestrator on this target.

---

## Observability

Sentry (`@sentry/nextjs`), errors only — no tracing, no session replay. There is no background
worker and no alerting elsewhere, so this is the only thing that tells anyone a sync broke.

`tracesSampleRate` is deliberately **absent** rather than `0`. Sentry's `hasSpansEnabled()` treats
`0` as "tracing on, sample nothing", which still builds spans and attaches `sentry-trace` /
`baggage` headers to every outgoing Authentik and Drupal call.

**Bootstrap.** `instrumentation.ts` `register()` imports `sentry.server.config.ts` or
`sentry.edge.config.ts` depending on `NEXT_RUNTIME`; the browser gets `instrumentation-client.ts`.
All three call `Sentry.init(sentryInitOptions())` from `lib/observability/sentry.ts`, so the three
runtimes cannot drift. That module stays free of server-only imports — it ends up in the client
bundle.

**Disabled without a DSN.** `NEXT_PUBLIC_SENTRY_DSN` unset ⇒ `enabled: false`, so dev machines and
the test suite never phone home. It is a `NEXT_PUBLIC_` value, so `next build` freezes it into the
bundle: the CI image build has to supply it, setting it on the running container is too late.

**What gets captured.**

| Source | Where |
| --- | --- |
| FAILED `SyncJob` | `captureSyncJobFailure` in `executeSyncJob` |
| Unhandled service errors behind a 500 | `captureServiceError` in `mapServiceError` |
| Server render errors and rethrowing Server Actions | `onRequestError` in `instrumentation.ts` |
| Client render errors | `app/global-error.tsx` |

`onRequestError` is server-side only, so a React render error in the browser reaches Sentry solely
through `global-error.tsx`. That file replaces the root layout when it renders, so it carries its
own `<html>`, stylesheet import and next-themes-compatible theme resolution.

A sync failure is tagged `sync.target`, `sync.operation`, `sync.job_id` and `member.id` — the alert
names the member and the system without anyone opening `/admin/sync-jobs`. The job **payload is
never attached**; it holds an email and a mobile number.

**Typed errors are not incidents.** `NotFoundError`, `ForbiddenError` and `ValidationError` are
control flow. They are filtered in three places: `isExpectedError` (by `name`, not `instanceof`, so
`lib/observability/sentry.ts` stays independent of `lib/errors.ts`, which imports `capture.ts`),
and again in `beforeSend` by exception type as a backstop.

**PII scrubbing** (`lib/observability/scrub.ts`) runs on every outgoing event. Emails and phone
numbers are redacted out of the message, exception values, `extra`, `contexts`, breadcrumbs and the
request URL; sensitive keys (`email`, `mobile`, `password`, `token`, `payload`, …) are dropped
wholesale; `user` is reduced to `id` + `username`; request headers, cookies and bodies are dropped
entirely. Tags are deliberately **not** scrubbed — every tag value is written by our own code, and
the phone matcher would otherwise eat identifiers that are long runs of digits.

**Release tagging** reuses `NEXT_PUBLIC_APP_VERSION` from `next.config.ts` (git tag + short hash, or
whatever the image build passes in), so an event points at a known build. Source map upload is
wired through `withSentryConfig` but switches itself off unless `SENTRY_AUTH_TOKEN` is present —
that secret belongs to the Docker build, not to a local `pnpm build`.

**Client events tunnel through `/monitoring`.** `tunnelRoute` in `next.config.ts` makes the browser
POST envelopes to our own origin instead of `sentry.io`, which ad blockers filter by hostname.
The route is generated by the Sentry plugin, so it exists only in a real build — and it is in
`publicPaths` in `proxy.ts`, because an error on the login page has no session cookie yet and a
redirect would drop the POST body.

**Structured logging** (`lib/observability/logger.ts`) writes one JSON object per line to
stdout/stderr. `/api/usernames/suggest` logs the calling service account (`sub` + service account
name) with the outcome on every path — service account names are not PII, so they are logged raw.
Nothing else logs through it yet.

---

## Release engineering

**Image.** Multi-stage `Dockerfile` on `node:24-alpine` producing the Next.js standalone server,
running as a fixed non-root UID (65532) so k8s `runAsNonRoot` can verify it. `output: "standalone"`
in `next.config.ts` is what makes the runtime stage possible; the traced bundle plus `.next/static`
and `public/` is all the runner gets.

**Migrations run from the entrypoint**, not a separate Job — one replica, one deploy.
`RUN_MIGRATIONS=false` opts a container out. The standalone bundle contains only what the server
traced, so the image carries its own copy of the Prisma CLI, npm-installed at build time from the
versions in `package.json` so it cannot drift from the generated client. `prisma.config.ts` is
copied next to that `node_modules` tree because its `dotenv` and `prisma/config` imports have to
resolve somewhere, and the config's relative migrations path then points at the copy beside it.
Do not try to shrink that tree by deleting `@prisma/studio-core` or `@prisma/dev`: `build/cli.js`
requires both eagerly and the CLI stops loading at all.

**Build args vs secrets.** Every `NEXT_PUBLIC_*` value is a plain build arg —
`NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_APP_VERSION`,
`NEXT_PUBLIC_COMMIT_HASH` and `NEXT_PUBLIC_GOOGLE_GROUP_URL`. A DSN and a Google Group URL are
public, the rest name the build or the environment, and `next build` freezes all of them into the
bundle, so setting any of them on the running container reports nothing at all. An empty
`NEXT_PUBLIC_SENTRY_ENVIRONMENT` falls back to `NODE_ENV`, which is what an unconfigured image
reports as. `SENTRY_ORG` and `SENTRY_PROJECT` are build args too: they only address the upload
target, and without them `withSentryConfig` has nowhere to send source maps. `SENTRY_AUTH_TOKEN`
is the only real secret and comes in as a BuildKit secret mount; a build arg would land in the
image history. The publish workflow derives the version and the hash from the ref it is building,
and reads `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`,
`NEXT_PUBLIC_GOOGLE_GROUP_URL`, `SENTRY_ORG` and `SENTRY_PROJECT` from repository *variables*, the
token from a repository *secret*.

**Workflows** (`.github/workflows/`), actions pinned to a patch version, mirroring
[BSStudio/request-manager](https://github.com/BSStudio/request-manager):

| Workflow | When | What |
| --- | --- | --- |
| `ci.yml` | PR, push to `main` | Biome + tsc, Vitest with coverage → Codecov, commitlint over the PR range |
| `docker-publish.yml` | PR (build only), push to `main`, `v*.*.*` tags | Buildx → `ghcr.io/bsstudio/backstage`, provenance attestation |
| `authentik-contract.yml` | Weekly cron, dispatch, PRs touching `lib/authentik/**` | Diffs Authentik's published spec against `scripts/authentik-contract.json` |

`ci.yml` carries no `paths` filter on purpose: it is what `main` is protected on, and a required
check that never runs on a docs-only PR blocks that PR instead of passing it. Both node jobs run
`prisma generate` first — `app/generated/prisma/` is gitignored and `tsc` resolves through it.

The contract check reads goauthentik's `main` rather than a release, so a field rename shows up
before the studio instance is upgraded into it. A scheduled run that drifts opens an issue
(deduplicated by title); on a PR the red job is the notification. The snapshot is refreshed by hand
with `pnpm authentik:contract --update` once the change is understood.

**Renovate** (`.github/renovate.json`). Non-major npm and GitHub Actions groups and the monthly
lockfile refresh automerge; everything else waits for a human. Majors are separate PRs, and a
Next.js major is disabled outright — it is a migration, not a bump (see `AGENTS.md`). The config
file does nothing on its own: the Renovate GitHub App has to be installed on the repository.
`schedule:weekends` opens PRs across both days, `automergeSchedule` merges them Monday 04:00–08:00.
The gap is the review pass: by Monday `schedule:weekends` has stopped opening new PRs, so the set
that merges is the set that was reviewed. An out-of-schedule run still processes branches that
already have a PR — only branch *creation* is skipped — which is what leaves the Monday window
reachable at all. That pairing is also why `platformAutomerge` is **off**: GitHub's own auto-merge
is enqueued when the PR is created and fires the moment checks go green, which ignores
`automergeSchedule` entirely. Renovate merges these itself instead, and it waits for CI on its own
rather than relying on branch protection. Vulnerability alerts opt back out of both schedules.

**GitHub-side settings.** None of this lives in the repository, all of it is assumed by the
automation, and all of it is set once:

| Kind | Name | Without it |
| --- | --- | --- |
| Secret | `CODECOV_TOKEN` | the coverage upload fails the `Test` job (`fail_ci_if_error`) |
| Secret | `SENTRY_AUTH_TOKEN` | no source map upload, so production stack traces stay minified |
| Variable | `NEXT_PUBLIC_SENTRY_DSN` | the built image reports nothing to Sentry at all |
| Variable | `NEXT_PUBLIC_GOOGLE_GROUP_URL` | the new-member page drops its Google Group link |
| Variable | `SENTRY_ORG` / `SENTRY_PROJECT` | source map upload has no target |

Branch protection on `main` requires exactly `ci.yml`'s three jobs — `Lint and typecheck`, `Test`,
`Commit messages`. The Docker and contract jobs must **not** be required: both filter on paths, and
a required check that never reports blocks the PR forever instead of passing it. "Require branches
to be up to date" stays off, or every Renovate PR stalls — `rebaseWhen: "conflicted"` will not
rebase a merely stale branch.

Also repository-level: squash-only merging (see Renovate above), the
Renovate and Codecov apps installed, Issues enabled with the assignee named in
`authentik-contract.yml` holding repository access, and the `ghcr.io/bsstudio/backstage` package's
access linked back to this repository so deployment hosts can pull it.

---

## Testing

Vitest + Testcontainers (real PostgreSQL). Service-layer tests are integration tests against the
container; routes and actions get smoke tests for auth and error mapping only.

- `tests/setup.ts` — starts the container in `beforeAll`, migrates, truncates all tables in
  `afterEach`, stops in `afterAll`. Exports `getTestPrisma()` and `mockPrisma()`.
- `tests/helpers.ts` — `mockSession(overrides)` / `mockNoSession()` for auth, and
  `mockWebsiteOrchestrators()` to stub the Drupal fan-out in route tests.
- Route tests use `vi.resetModules()` + `vi.doMock()` + dynamic `import()` to swap in the test
  database and session before each test.
- Website client tests stub `fetch` with real `Response`/`Headers` objects so `getSetCookie()`
  behaves as in production. Website operation tests mock only the transport, leaving `parseHtml`
  and `getFormToken` real so the Drupal scraping selectors are genuinely exercised.

Coverage includes `app/**/*.ts`, `lib/**/*.ts`, `types/**/*.ts`, excluding `app/generated/**`,
`app/api/auth/**`, and the config/wiring files `lib/auth.ts`, `lib/auth-client.ts`,
`lib/prisma.ts`, `lib/utils.ts`. The 100% figure is enforced, not just documented:
`coverage.thresholds` in `vitest.config.ts` fails `pnpm test:coverage` — and so CI — on a drop.

---

## Architectural decisions

Why things are the way they are. The *what* is in the code.

**Service layer.** Business logic lives in `lib/services/`. Routes and Server Actions are both thin
adapters over the same service, so behaviour cannot drift between the HTTP and RSC paths. Typed
errors (`NotFoundError`, `ForbiddenError`, `ValidationError`) flow through `mapServiceError`.

**Authentik attributes are replaced, not merged.** `PATCH /core/users/{pk}/` overwrites the whole
`attributes` object, so `buildAuthentikAttributes(member)` always sends the full managed set
(`first_name`, `last_name`, `mobile`, `avatar_url`). Trade-off: attributes set by hand in the
Authentik admin UI get wiped on the next update. Acceptable for a managed fleet.

**Status change adds before removing.** `orchestrateStatusChange` issues `ADD_TO_GROUP` before
`REMOVE_FROM_GROUP`. If ADD fails nothing changed; if REMOVE fails the user is briefly in both
groups, which a retry fixes. The reverse order risks leaving a user in **no** group.

**"Has an Authentik account" is encoded in the id, not in a column.** The alternative was an
`authentikUserId` or a `hasAuthentikAccount` field. Neither pays for itself: `Member.id` must
*already* equal the Authentik UUID for login and for pk resolution, so a member who gains an account
needs their id rewritten either way — a column would not save that, only duplicate a fact the id
already carries, where the two can drift. The prefix also keeps the check pure, which matters
because orchestrators receive a bare `memberId` and would otherwise have to read the member row on
every sync. Cost: ids are not uniformly UUIDs, and the prefix shows up in member URLs — and, once
avatars are embedded on the public website, in `/avatars/<id>-square.webp` too. That is why the
token is meaningless rather than descriptive. It does not hide the id itself: an avatar URL
publishes the member's Authentik user UUID either way. Fixing *that* means minting avatar
filenames independently of the member id, which is not done.

**No background retry queue.** A failed sync reports to Sentry, somebody looks, and it is retried by
hand from `/admin/sync-jobs`. At ~30 members the failure rate does not justify a worker, a queue
table or the operational surface of pg-boss or a CronJob. Revisit only if manual retries become
routine.

**The Drupal password never leaves `createWebsiteUser`.** Drupal demands a password at account
creation but nobody uses it — members log in through Authentik. It is minted inside the function,
is not part of `CreateWebsiteUserInput`, and therefore never reaches a SyncJob payload, which is
rendered verbatim in the admin UI. A retry mints a fresh one.

**Both systems share one username.** `createMember` reuses `authentikUser.username` — the name
`createAuthentikUser` settled on after its collision loop — rather than re-deriving. Otherwise a
collision gives Authentik `jkovacs2` and the website `jkovacs`. Drupal has its own namespace, so a
collision *there* still fails the create and lands as a `FAILED` job.

**Avatar upload and removal are separate audit actions.** The avatar URL is deterministic from the
member UUID, so a replace would be invisible in the diff without dedicated `AVATAR_UPLOADED` /
`AVATAR_REMOVED` actions. `removeMemberAvatar` no-ops when there is nothing to remove.

**Leadership role → group sync.** Assigning a role adds the member to the common Leadership group
(`AUTHENTIK_GROUP_LEADERSHIP_UUID`) **plus** any role-specific `authentikGroupIds`; `removeRole`
removes both. Updating an existing role keeps the Leadership membership and only diffs the
role-specific groups.

**No REST routes for admin resources.** Sync jobs and the audit log are read directly via
service/Prisma in server components; mutations go through Server Actions. No external consumer
exists, so an HTTP API would be surface area for nothing.

**Avatar storage is backend-agnostic.** `lib/avatar-storage.ts` is the facade: it validates member
ID shape, 5MB size and WebP magic bytes, then delegates to a backend implementing `AvatarStorage`
(`lib/storage/{types,local,s3,factory}.ts`), chosen once from `AVATAR_STORAGE=local|s3` and cached.
Both store the same logical key `<id>-<variant>.webp` — local under `./storage/avatars/`, S3 under
`s3://<S3_BUCKET>/avatars/`. Migrating means copying files and flipping the env var; stored URLs
(`/avatars/<filename>`) stay valid. Local storage sits **outside `public/`** deliberately: static
serving would shadow `app/avatars/[...path]/route.ts` and break the S3 path.

**Forms validate against the service's own schemas.** `lib/services/member-schemas.ts` exists only
so a client component can import a Zod schema without dragging Prisma and the sync layer into the
browser bundle — `members.ts` re-exports it, so service and API callers are unaffected. The forms
use `*FormSchema` variants (`CreateMemberSchema.required()` and friends) because a form always
submits every field as a present string, while an API caller may send a partial payload. Validation
messages therefore live in the schema and are Hungarian; they surface both inline in the form and
in a 400 body.

**Save is disabled until something changes.** Edit forms subscribe to TanStack Form's
`isDefaultValue`, so reverting an edit re-disables the button. The role checkbox group keeps its
value sorted for the same reason — the comparison is order-sensitive, and unchecking then
rechecking a box would otherwise read as a change. Field errors stay hidden until a field is
blurred or a submit is attempted — forms register the schema on `onChange` **only**, and the field
components re-run that validator from their blur handler so a field the user tabbed straight past
still reports. Registering the same schema on `onBlur` as well looks equivalent and is not: every
validation cause keeps its own slot in `errorMap` and `meta.errors` flattens all of them, so the
field renders two messages at once and keeps the stale one until that cause fires again.

**The edit sheet's forms live inside `SheetContent`.** Radix unmounts it on close, so both forms
remount with the current member data on every open — no reset effect, and a discarded edit cannot
survive a reopen.

**Studio leaders history lives on the wiki.** Not an in-app page — the sidebar links to
`https://wiki.bsstudio.hu/doc/studiovezetok-AdWWlRMuAI`. Edits are rare, pre-2010 entries lack
contact details, and the wiki already provides editing and audit.

---

## Conventions

- Hungarian for anything a user sees; English for identifiers and enum values
- **Comments are minimal and explain *why*, never *what*.** Code is expected to read on its own —
  name things instead of narrating them. A comment earns its place only when the reason is not
  recoverable from the code: a non-obvious constraint, a trade-off, a workaround for someone else's
  bug. No module-header docblocks restating the filename, no JSDoc that repeats the signature, no
  step-by-step commentary on straightforward control flow. The same holds for `.env.example` and
  config files — describe what a value does, never general advice the reader already knows
- Zod `.trim()` on every string input; empty strings become `null` in the service layer so optional
  fields can be cleared
- `archived: false` is the default filter on member queries
- Leadership roles are deleted when they end — history survives in `TimelineEntry`
- 207 responses carry `syncErrors`; the UI shows a warning toast, never an error
- Toasts (sonner) for every mutation — `toast.success()` / `toast.error()`
- Per-button loading spinners, never one global spinner — pages with several actions must show
  feedback on the button that was clicked. Each form carries its own `isSubmitting`; where several
  actions share one `useTransition` (`members-table.tsx`) a `pendingAction` discriminator says
  which button is busy
- Forms are TanStack Form via `useAppForm` (`components/form.tsx`) — no raw `FormData` reads.
  Fields are `<form.AppField>` + a field component, submit buttons go inside `<form.AppForm>`
- Every portal page exports `metadata` (or `generateMetadata`) for a descriptive Hungarian title
- Non-login form fields carry `autoComplete="off"` + `data-1p-ignore` + `data-lpignore="true"` to
  suppress password-manager autofill
- `components/ui/` primitives are registry output and are re-addable with `shadcn add --overwrite`.
  Anything hand-edited carries a `LOCAL MODIFICATIONS` comment at the top of the file saying what
  changed and why, so an update can re-apply it — currently `table.tsx` and `pagination.tsx`.
  Auditing that claim means re-adding every primitive with the pinned `shadcn` dev dependency into
  a clean project carrying only `components.json`, `tsconfig.json` and `app/globals.css`, then
  diffing Biome-formatted output against the repo — files drift from the registry without local
  intent, and only a diff separates those from real modifications
- `AvatarContext` (`components/avatar-context.tsx`) shares the current avatar URL between the
  layout-rendered navbar and the member detail page, so an upload does not force a layout re-render

---

## Design tokens

Light + dark via `next-themes`. Tokens in `app/globals.css` map BSS brand blue (`#005baa`) to the
shadcn `--primary`. Geist sans + mono. Status badges use `text-status-*` / `bg-status-*` utilities —
class map in `lib/members.ts`.

> Spotify has an unrelated open-source project also called Backstage (backstage.io). No shared code
> and nothing published under `@backstage/*` — anything about plugins, catalogs or software
> templates is theirs, not this.
