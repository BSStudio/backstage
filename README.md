<p align="center">
  <img src="https://bsstudio.hu/system/files/site_content/logo/bss_logo_169.png" width="50%" alt="Budavári Schönherz Stúdió logo">
</p>

---

# Backstage

Internal portal for [Budavári Schönherz Stúdió](https://bsstudio.hu). Source of truth for member
data, syncing to Authentik and the legacy Drupal website, plus tooling to reconcile the studio
mailing list.

[![CI](https://github.com/BSStudio/backstage/actions/workflows/ci.yml/badge.svg)](https://github.com/BSStudio/backstage/actions/workflows/ci.yml)
[![Docker](https://github.com/BSStudio/backstage/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/BSStudio/backstage/actions/workflows/docker-publish.yml)
[![codecov](https://codecov.io/gh/BSStudio/backstage/graph/badge.svg)](https://codecov.io/gh/BSStudio/backstage)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

## Overview

| Layer | Stack |
| --- | --- |
| App | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS 4, shadcn/ui, TanStack Table, TanStack Form |
| Data | PostgreSQL, Prisma 7 over the `pg` driver adapter |
| Auth | Better Auth against Authentik OIDC |
| Quality | Biome, Vitest + Testcontainers, Sentry |

The user interface is in Hungarian. Architecture, data model and conventions are documented in
[CLAUDE.md](CLAUDE.md).

## Getting started

Requires Node.js (see [.nvmrc](.nvmrc)), pnpm and Docker.

```bash
pnpm install
pnpm dev:setup   # writes .env, starts Postgres, generates, migrates and seeds
pnpm dev
```

`pnpm dev:setup` asks for your name and your Authentik `sub` on first run so the seeded database
contains a member row that your SSO login lands on. The ~43 other members are invented.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm check` | Biome + `tsc --noEmit` — run before opening a PR |
| `pnpm test` | Full suite (needs Docker; Testcontainers starts a real PostgreSQL) |
| `pnpm test:coverage` | Same, with V8 coverage. The thresholds are 100% |
| `pnpm db:migrate` | Create and apply a migration |
| `pnpm db:reset` | Drop, recreate, re-migrate, reseed |
| `pnpm authentik:contract` | Diff Authentik's published OpenAPI spec against the committed snapshot |
| `pnpm build` | Production build (standalone output) |

Environment variables are listed in [.env.example](.env.example).

## Contributing

Branch off `main`, open a PR. Three things are enforced rather than suggested, and all three fail
the build rather than warning:

- **Conventional commits.** commitlint runs in the husky `commit-msg` hook and again in CI over the
  PR's whole commit range, so an older commit cannot slip through. Subject lowercase, ≤72
  characters.
- **100% coverage** — statements, branches, functions and lines, thresholded in
  [vitest.config.ts](vitest.config.ts) over `app/`, `lib/` and `types/`. Land tests with the change.
  A defensive branch that genuinely cannot be reached takes a
  `/* v8 ignore next -- reason */` instead of dragging the number down.
- **Biome**, not ESLint or Prettier. lint-staged formats staged files on commit, so this rarely
  needs running by hand.

`pnpm test` needs Docker running — Testcontainers starts a real PostgreSQL. Run `pnpm check` and
`pnpm test` before pushing; CI runs the same two plus commitlint.

## Deployment

Images are published to `ghcr.io/bsstudio/backstage` on every push to `main` and on semver tags.

```bash
docker compose up -d
```

The image runs `prisma migrate deploy` from its entrypoint before starting the server; set
`RUN_MIGRATIONS=false` on any container that must not touch the schema.

`NEXT_PUBLIC_*` values are frozen into the bundle by `next build`, so the DSN, the version and the
commit hash have to be passed as build args — setting them on the running container has no effect.
The same is true of the Sentry source map upload, which happens at build time. The publish workflow
supplies all of them from repository variables and secrets; see Release engineering in
[CLAUDE.md](CLAUDE.md).
