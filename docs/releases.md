# Release engineering

**Image.** Multi-stage `Dockerfile` on `node:24-alpine` producing the Next.js standalone server, running as a fixed non-root UID (65532) so k8s `runAsNonRoot` can verify it. `output: "standalone"` in `next.config.ts` is what makes the runtime stage possible; the traced bundle plus `.next/static` and `public/` is all the runner gets.

**Migrations run from the entrypoint**, not a separate Job — one replica, one deploy. `RUN_MIGRATIONS=false` opts a container out. The standalone bundle contains only what the server traced, so the image carries its own copy of the Prisma CLI, npm-installed at build time from the versions in `package.json` so it cannot drift from the generated client. `prisma.config.ts` is copied next to that `node_modules` tree because its `dotenv` and `prisma/config` imports have to resolve somewhere, and the config's relative migrations path then points at the copy beside it. Do not try to shrink that tree by deleting `@prisma/studio-core` or `@prisma/dev`: `build/cli.js` requires both eagerly and the CLI stops loading at all.

**Build args vs secrets.** Every `NEXT_PUBLIC_*` value is a plain build arg — `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_APP_VERSION` and `NEXT_PUBLIC_COMMIT_HASH`. A DSN is public, the rest name the build or the environment, and `next build` freezes all of them into the bundle, so setting any of them on the running container reports nothing at all. `NEXT_PUBLIC_SENTRY_RELEASE` is the exception: `next.config.ts` derives it from the version and it is not an input. An empty `NEXT_PUBLIC_SENTRY_ENVIRONMENT` falls back to `NODE_ENV`, which is what an unconfigured image reports as. `SENTRY_ORG` and `SENTRY_PROJECT` are build args too: they only address the upload target, and without them `withSentryConfig` has nowhere to send source maps. `SENTRY_AUTH_TOKEN` is the only real secret and comes in as a BuildKit secret mount; a build arg would land in the image history. The publish workflow derives the version from the ref it is building and its distance to the last release tag — hence the full-history checkout — and the hash from the commit, and reads `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `SENTRY_ORG` and `SENTRY_PROJECT` from repository *variables*, the token from a repository *secret*.

**Workflows** (`.github/workflows/`), actions pinned to a commit SHA with the version in a comment, mirroring [BSStudio/request-manager](https://github.com/BSStudio/request-manager):

| Workflow | When | What |
| --- | --- | --- |
| `ci.yml` | PR, push to `main` | Biome + tsc, Vitest with coverage → Codecov, commitlint over the PR range |
| `checks.yml` | PR, push to `main` | BSStudio/.github's shared checks: actionlint and zizmor over the workflows, dependency review on PRs |
| `docker-publish.yml` | PR (build only), push to `main`, `v*.*.*` tags | Buildx → `ghcr.io/bsstudio/backstage`, provenance attestation |
| `authentik-contract.yml` | Weekly cron, dispatch, PRs touching `lib/authentik/**` | Diffs Authentik's published spec against `scripts/authentik-contract.json` |

`ci.yml` and `checks.yml` carry no `paths` filter on purpose: they are what `main` is protected on, and a required check that never runs on a docs-only PR blocks that PR instead of passing it. `ci.yml`'s `Lint and typecheck` and `Test` run `prisma generate` first — `app/generated/prisma/` is gitignored and `tsc` resolves through it.

The contract check reads goauthentik's `main` rather than a release, so a field rename shows up before the studio instance is upgraded into it. A scheduled run that drifts opens an issue (deduplicated by title); on a PR the red job is the notification. The snapshot is refreshed by hand with `pnpm authentik:contract --update` once the change is understood.

**Renovate** (`.github/renovate.json`) extends [BSStudio/renovate-config](https://github.com/BSStudio/renovate-config) with the `weekly` window and `approve-merges`: its README says when PRs open, what merges unattended and what waits for an approval, and each of this repo's own rules carries its reason in `description`. Majors are separate PRs, which is what a Next.js major wants to be: a PR that says a version landed and that nobody merges on sight, because it is a migration rather than a bump (see [AGENTS.md](../AGENTS.md)). `approve-merges` merges through GitHub auto-merge, which waits only for required checks, so it rests on the ruleset below; `CODEOWNERS` leaves workflows, actions and the lockfile without an owner, so their updates merge without an approval. The config file does nothing on its own: the Renovate GitHub App has to be installed on the repository.

**GitHub-side settings.** None of this lives in the repository, all of it is assumed by the automation, and all of it is set once:

| Kind | Name | Without it |
| --- | --- | --- |
| Secret | `CODECOV_TOKEN` | the coverage upload fails the `Test` job (`fail_ci_if_error`) |
| Secret | `SENTRY_AUTH_TOKEN` | no source map upload, so production stack traces stay minified |
| Variable | `NEXT_PUBLIC_SENTRY_DSN` | the built image reports nothing to Sentry at all |
| Variable | `SENTRY_ORG` / `SENTRY_PROJECT` | source map upload has no target |

The `main` ruleset requires exactly five checks: `ci.yml`'s `Lint and typecheck`, `Test` and `Commit messages`, and `checks.yml`'s `Checks / Workflows` and `Checks / Dependencies`. It also requires code owner review and keeps approvals across pushes, as `approve-merges` expects. The Docker and contract jobs must **not** be required: both filter on paths, and a required check that never reports blocks the PR forever instead of passing it. "Require branches to be up to date" stays off, or every Renovate PR stalls — `rebaseWhen: "conflicted"` will not rebase a merely stale branch.

Also repository-level: squash-only merging with the PR title as the commit message, auto-merge allowed (for `approve-merges`), the Renovate and Codecov apps installed, Issues enabled with the assignee named in `authentik-contract.yml` holding repository access, and the `ghcr.io/bsstudio/backstage` package's access linked back to this repository so deployment hosts can pull it.
