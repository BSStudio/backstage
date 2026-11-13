# Repository structure

- `app/(portal)/` — authenticated pages (members, apps, computers, admin, dashboard)
- `app/api/` — REST routes: `members/`, `members/[id]/{roles,avatar}`, `usernames/suggest`, `computers/[id]/ping`, `auth/[...all]`
- `app/avatars/[...path]/route.ts` — serves avatar bytes from whichever storage backend is active
- `lib/services/` — business logic (`members.ts`, `sync-jobs.ts`, `usernames.ts`, `google-group.ts`, `audit.ts`, `app-links.ts`, `calendar.ts`, `computers.ts`, `website.ts`). All real work happens here. `member-schemas.ts`, `google-group-schemas.ts`, `app-link-schemas.ts` and `computer-schemas.ts` hold the Zod schemas, split out so client forms can import them; `pagination.ts` holds the page size and the skip/take arithmetic the paginated admin lists share
- `lib/actions/` — Server Actions; thin wrappers around services. `result.ts` owns the `ActionResult` shape they all return, the two failure constants and `mapActionError`
- `lib/authentik/` — Authentik REST client (`client`, `users`, `groups`), plus `issuer.ts`, which owns the one spelling of `AUTHENTIK_ISSUER` every path is joined onto
- `lib/website/` — `webhook.ts`, the whole client for the website: one bearer POST of the member push contract — see [The website](integrations.md#the-website-members-webhook)
- `lib/active-directory/` — `config.ts` (the `AD_*` settings and a member's DN) and `client.ts` (one bound LDAPS connection per call: create an account, replace attributes) — see [Active Directory](integrations.md#active-directory)
- `lib/google/` — the Google clients sharing one signer: `client.ts` (token minting + transport, `googleFetch` for an absolute URL, `googleRequest` for a Cloud Identity path), `groups.ts` (membership operations), `calendar.ts` (the studio calendar read)
- `lib/sync/` — `executor.ts` + per-target `authentik/{operations,orchestrators,attributes,group-mapping}.ts`, `google/{operations,orchestrators}.ts`, `website/{operations,orchestrators,payload}.ts` and `active-directory/{attributes,operations,orchestrators}.ts`
- `lib/storage/` + `lib/avatar-storage.ts` — avatar storage facade and local/S3 backends
- `lib/http.ts` — the timeout every outgoing request carries, and what a rejection that never became an HTTP answer says
- `lib/errors.ts` — typed error hierarchy + `mapServiceError`
- `lib/api-response.ts` — `syncJson` / `syncJsonResource`, the answer every mutating route returns
- `lib/toast.ts` — `toastSync`, the success-or-partial-failure toast every mutation raises
- `lib/permissions.ts` — every role rule: `can*` predicates for the UI, `ensureCan*` guards that throw `ForbiddenError` for services
- `lib/api-client-auth.ts` — bearer verification for machine-to-machine callers, one Authentik group per kind of caller
- `lib/carddav/` — the read-only CardDAV endpoint: `paths.ts` (URL shapes, recognised without loading the rest), `handler.ts` (method dispatch + Basic auth), `vcard.ts`, `xml.ts`. Served from `proxy.ts`, not `app/api/` — see [Architectural decisions](decisions.md)
- `lib/rate-limit.ts` — in-memory fixed-window rate limiter. State is per process, so every limit it enforces is per replica; the single-replica deployment is what makes that correct
- `lib/rdp.ts` — the `.rdp` file `/computers` hands out, and the three environment values that shape it. Separate from `lib/computers.ts` because client components import that one and would carry the environment read into the browser bundle
- `lib/observability/` — `sentry.ts` (shared init options), `scrub.ts` (PII redaction), `capture.ts` (capture helpers), `logger.ts` (structured logging)
- `lib/members.ts`, `lib/audit.ts`, `lib/nav-labels.ts`, `lib/sync-jobs.ts`, `lib/google-group.ts`, `lib/app-links.ts`, `lib/calendar.ts`, `lib/computers.ts` — display helpers + Hungarian labels. `lib/app-links.ts` also owns the icon name → lucide component map and the per-accent tile classes; `lib/calendar.ts` owns every Hungarian date and time string the dashboard renders, and the split between the two kinds of formatter that needs — see [Dates and the studio zone](data-model.md#dates-and-the-studio-zone)
- `components/form.tsx` — TanStack Form `useAppForm` plus the field/submit components every form is built from
- `components/` — shared pieces above the primitives: `page-nav.tsx` (admin list pagination), `status-badge.tsx` (`StatusBadge` / `ArchivedBadge`), `archive-dialog.tsx` (the archive confirmation and its mailing-list checkbox), `app-link-card.tsx` (one row on /apps), `computer-card.tsx` (one workstation on /computers), `auto-refresh.tsx` (re-runs a page's server components on a timer), `portal-shell.tsx` (the authenticated frame)
- `components/dashboard/` — the widgets `/` composes, one file per source: `calendar.tsx` (`HeroEvent` + `UpcomingEvents`, two server components sharing one `cache()`d read), `profile-card.tsx` (which also exports the member read the page's greeting reuses), `quick-links.tsx`, and `computers-card.tsx`
- `components/ui/` — shadcn/ui primitives
- `scripts/` — dev tooling run with `tsx`: `dev-setup.ts`, `seed-dev.ts` (+ `seed-data.ts` roster, `dev-user.ts` identity prompt, `dev-groups.ts` Authentik group UUIDs), `reset-db.ts`, `authentik-contract.ts` + its `authentik-contract.json` snapshot, and the three credential probes, `google-group-probe.ts`, `google-calendar-probe.ts` and `active-directory-probe.ts`, which read the configured group, calendar and members OU through the real clients. Everything here runs on a developer's own machine against their `.env`, and nothing here is shipped
- `workstation-agent/` — the studio workstation agent: `backstage-agent.ps1` (the ping loop), `install-agent.ps1` (the scheduled task, the ACL and the DPAPI-encrypted credential), `bootstrap.ps1` (the one-liner that fetches the other two at the latest release tag), and their own `README.md`. Top level rather than under `scripts/` because it is not tooling for this repository: it is Windows PowerShell fetched over HTTP onto machines that never clone this, and its paths are part of a published install URL
- `tests/` — mirrors the source layout; `setup.ts` spins Testcontainers Postgres
- `proxy.ts` — route protection (Next.js 16 convention), and the CardDAV endpoint, which cannot live in a route handler
- `instrumentation.ts`, `instrumentation-client.ts`, `sentry.{server,edge}.config.ts` — Sentry bootstrap (Next.js 16 conventions)
- `prisma/schema.prisma` — single schema, client generated to `app/generated/prisma/`
- `Dockerfile`, `docker-entrypoint.sh`, `docker-compose.yml` — production image and stack; `docker-compose.dev.yml` is just the dev Postgres
- `.github/workflows/` — `ci.yml`, `docker-publish.yml`, `authentik-contract.yml`, all sharing the `.github/actions/setup` composite: `pnpm/setup`, which reads the pnpm version from `packageManager` and is pointed at `.nvmrc` for the runtime. Named rather than left to the action's own detection, which falls back through `.node-version`, `.nvmrc` and `.tool-versions` and defers to `devEngines.runtime` — so adding any of those would silently move CI onto another Node. It installs too: `require-lockfile` is what makes a *missing* lockfile fail the job, which a frozen install does not — pnpm resolves from the registry, writes one and exits 0. It needs pnpm 11 or newer. `.github/renovate.json` for dependency updates

## Where to make a change

**Add or change a Member field**
1. `prisma/schema.prisma` → `pnpm db:migrate`
2. `CreateMemberSchema` / `UpdateMemberSchema` in `lib/services/member-schemas.ts` (re-exported from `members.ts`) — the forms validate against the `*FormSchema` variants derived there
3. Should it reach Authentik? Add to `AUTHENTIK_SYNCED_FIELDS` *and* `buildAuthentikAttributes()` (`lib/sync/authentik/attributes.ts`) — the attribute set is sent wholesale, see [Architectural decisions](decisions.md)
4. Should it reach the website? Only if the contract names it — it is theirs, not ours. Then `WebsiteMember` (`lib/website/webhook.ts`), `buildWebsiteMember` (`lib/sync/website/payload.ts`) and, if a change to it should trigger a push, `WEBSITE_SYNCED_FIELDS`
5. Should it reach Active Directory? Almost certainly not — an AD account carries the names and the enabled flag and nothing else, see [Active Directory](integrations.md#active-directory). If it does, `buildDirectoryAttributes` (`lib/sync/active-directory/attributes.ts`) and `ACTIVE_DIRECTORY_SYNCED_FIELDS`
6. Should it reach a synced phone? Almost certainly not — a vCard carries contact details only, see [Architectural decisions](decisions.md). If it does, `VCardMember` and `renderVCard` (`lib/carddav/vcard.ts`) *and* the projection in `listCardDavMembers`
7. UI: `members/new/page.tsx`, `members/[id]/member-edit-sheet.tsx`, table `columns.tsx`
8. Tests: `tests/services/members.test.ts`

**Add a sync operation**
1. Low-level call in `lib/authentik/*` (then see below), `lib/google/groups.ts` or `lib/active-directory/client.ts`
2. Register the handler in `lib/sync/<target>/operations.ts` — it receives `(payload, memberId, prisma, jobId)` and resolves external IDs itself at execute time — `jobId` is there for a target whose endpoint takes an idempotency key
3. Orchestrator in `lib/sync/<target>/orchestrators.ts`: hand `runSyncJob` the row to write, plus a skip reason if the target has a condition no retry could fix
4. Call the orchestrator from `lib/services/`, and turn the results into `syncErrors` with `collectSyncErrors`
5. A new operation name also needs a `SyncOperation` enum value + migration

**Add or change an Authentik API call** — any new endpoint, query parameter or request/response field in `lib/authentik/*` has to be mirrored into the contract check, or it goes unwatched.
1. The call itself in `lib/authentik/{client,users,groups}.ts`
2. Add or amend its entry in `CONTRACT` (`scripts/authentik-contract.ts`) — one object per `method` + `path`, listing the `query` parameters, `request` fields and `response` fields the client actually touches. Nothing derives this from the source, so a call with no entry passes the check silently forever
3. `pnpm authentik:contract --update`, and commit the regenerated `scripts/authentik-contract.json` with the change — a stale snapshot fails the next PR that touches `lib/authentik/**`
4. Removing a call means removing its `CONTRACT` entry too, otherwise the check guards a field nobody reads

**Add an API route** — keep it a thin adapter: `requireAuth()` or `requirePermission(<predicate>)` from `lib/session.ts`, `toActor(session)` for the service call, `syncJson(body, syncErrors)` for the answer — or `syncJsonResource(key, resource, syncErrors)` when the body is the resource itself — and `mapServiceError` around failures. No business logic, and no role list of its own — the predicate comes from `lib/permissions.ts` and the service guards itself regardless.

**Add something the workstation agent reports**
1. Collect it in `Get-Metadata` (`workstation-agent/backstage-agent.ps1`), inside its own `try`, so a machine that cannot answer still pings
2. Add the field to `ComputerMetadataSchema` (`lib/services/computer-schemas.ts`) — unknown keys are stripped, so an agent reporting a field the schema does not name writes nothing
3. Render it from `lib/computers.ts` and `components/computer-card.tsx`
4. Report a fact, not a conclusion. The portal decides what a fact means, so changing that decision is not a reinstall on every workstation
5. Old agents keep running: every field is optional, and absent has to stay distinguishable from an empty value. `loggedInUser` is the worked example — omitted when the session lookup failed, `null` when it ran and found nobody, and only the second means the machine is free

**Add a portal page** — `app/(portal)/…/page.tsx` exporting `metadata` and, if it reads data, opening with `pageActor()` — or `pageActor(<predicate>)` when a role gates it; a Hungarian label in `lib/nav-labels.ts` (used by both sidebar and breadcrumbs); and a sidebar entry in `components/app-sidebar.tsx`.

**Add a dashboard widget** — one file in `components/dashboard/`, exporting a server component that **reads its own data**. `app/(portal)/page.tsx` composes and never queries on a widget's behalf, so a feature arrives with its card instead of the page growing a read per source. A widget that talks to something off our own network goes in its own `<Suspense>` with a `Skeleton`, so the rest of the page does not wait for it. Two widgets over one source share a `cache()`d reader rather than querying twice (`readCalendar`, `readOwnProfile`).
