@AGENTS.md

# Backstage

Internal portal for a university TV studio (BSS). Source of truth for member data, syncing to
Authentik (identity provider), the Active Directory domain behind the studio workstations, the
studio's public website and its Google Group mailing lists, which it also reconciles against the
member roster. Also the studio's landing page.

Scale: ~30 active members, growing alumni list (~10 per semester). Single deployment, no tenancy,
no public traffic.

This file describes the system **as it exists**.

The architecture is documented in [docs/](docs/), one file per topic. Before building a new feature, read the docs for the area it touches and follow the existing patterns.

- [structure.md](docs/structure.md) — where code lives, and which files each common kind of change touches.
- [data-model.md](docs/data-model.md) — the Prisma models, membership status, the semester format, dates and the studio time zone.
- [auth.md](docs/auth.md) — login, roles and permissions, machine-to-machine and CardDAV access.
- [api.md](docs/api.md) — the REST routes.
- [integrations.md](docs/integrations.md) — Authentik, the website, Google Workspace and Active Directory, the sync jobs that write to them, and Google Group reconciliation.
- [observability.md](docs/observability.md) — Sentry, PII scrubbing, release tagging and structured logs.
- [releases.md](docs/releases.md) — the image, migrations, build args, workflows, Renovate and the GitHub-side settings.
- [testing.md](docs/testing.md) — the test setup and what coverage includes.
- [decisions.md](docs/decisions.md) — why things are the way they are; read it before changing an established pattern.
- [dev-data.md](docs/dev-data.md) — what `pnpm db:seed` writes, and how to test against a dev Authentik.

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
- Leadership roles are deleted when they end, archiving their holder included — history survives
  in `TimelineEntry`
- 207 responses carry `syncErrors`; the UI shows a warning toast, never an error
- Toasts (sonner) for every mutation — `toast.error()` for a refusal, and
  `toastSync(message, syncErrors)` (`lib/toast.ts`) for a success, which downgrades itself to a
  warning naming the failures when a sync step did not land
- Per-button loading spinners, never one global spinner — pages with several actions must show
  feedback on the button that was clicked. Each form carries its own `isSubmitting`; where several
  actions share one `useTransition` (`members-table.tsx`) a `pendingAction` discriminator says
  which button is busy
- Forms are TanStack Form via `useAppForm` (`components/form.tsx`) — no raw `FormData` reads.
  Fields are `<form.AppField>` + a field component, submit buttons go inside `<form.AppForm>`.
  `SelectField` for a handful of options, `ComboboxField` (Popover + cmdk) once the list is long
  enough to need typing — but only when the reader knows what they are looking for, see the icon
  grid under [Architectural decisions](docs/decisions.md) — its filter replaces cmdk's default fuzzy scoring, which matches any name
  carrying the query's letters in order, with an accent-insensitive substring match. A field's
  `hint` renders a note under the input and joins `aria-describedby`
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
  layout-rendered navbar and the member detail page, so an upload does not force a layout
  re-render. `PortalShell` reads the initial URL itself rather than taking it as a prop; after
  mount the context is the only thing that changes it. That read makes it an async server
  component importing `lib/prisma`, so unlike its neighbours in `components/` it cannot be
  imported from a client component

---

## Design tokens

Light + dark via `next-themes`. Tokens in `app/globals.css` map BSS brand blue (`#005baa`) to the
shadcn `--primary`. Geist sans + mono. Status badges use `text-status-*` / `bg-status-*` utilities —
class map in `lib/members.ts`, markup in `components/status-badge.tsx`.

> Spotify has an unrelated open-source project also called Backstage (backstage.io). No shared code
> and nothing published under `@backstage/*` — anything about plugins, catalogs or software
> templates is theirs, not this.
