# Release engineering

**Image.** Multi-stage `Dockerfile` on `node:24-alpine` producing the Next.js standalone server, running as a fixed non-root UID (65532) so k8s `runAsNonRoot` can verify it. `output: "standalone"` in `next.config.ts` is what makes the runtime stage possible; the traced bundle plus `.next/static` and `public/` is all the runner gets.

**Migrations run from the entrypoint**, not a separate Job — one replica, one deploy. `RUN_MIGRATIONS=false` opts a container out. The standalone bundle contains only what the server traced, so the image carries its own copy of the Prisma CLI, npm-installed at build time from the versions in `package.json` so it cannot drift from the generated client. `prisma.config.ts` is copied next to that `node_modules` tree because its `dotenv` and `prisma/config` imports have to resolve somewhere, and the config's relative migrations path then points at the copy beside it. Do not try to shrink that tree by deleting `@prisma/studio-core` or `@prisma/dev`: `build/cli.js` requires both eagerly and the CLI stops loading at all.

**Build args vs secrets.** Every `NEXT_PUBLIC_*` value is a plain build arg — `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_APP_VERSION` and `NEXT_PUBLIC_COMMIT_HASH`. A DSN is public, the rest name the build or the environment, and `next build` freezes all of them into the bundle, so setting any of them on the running container reports nothing at all. `NEXT_PUBLIC_SENTRY_RELEASE` is the exception: `next.config.ts` derives it from the version and it is not an input. An empty `NEXT_PUBLIC_SENTRY_ENVIRONMENT` falls back to `NODE_ENV`, which is what an unconfigured image reports as. `SENTRY_ORG` and `SENTRY_PROJECT` are build args too: they only address the upload target, and without them `withSentryConfig` has nowhere to send source maps. `SENTRY_AUTH_TOKEN` is the only real secret and comes in as a BuildKit secret mount; a build arg would land in the image history. The publish workflow derives the version from the ref it is building and its distance to the last release tag — hence the full-history checkout — and the hash from the commit, and reads `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `SENTRY_ORG` and `SENTRY_PROJECT` from repository *variables*, the token from a repository *secret*.

**Workflows** (`.github/workflows/`), actions pinned to a patch version, mirroring [BSStudio/request-manager](https://github.com/BSStudio/request-manager):

| Workflow | When | What |
| --- | --- | --- |
| `ci.yml` | PR, push to `main` | Biome + tsc, Vitest with coverage → Codecov, commitlint over the PR range |
| `docker-publish.yml` | PR (build only), push to `main`, `v*.*.*` tags | Buildx → `ghcr.io/bsstudio/backstage`, provenance attestation |
| `authentik-contract.yml` | Weekly cron, dispatch, PRs touching `lib/authentik/**` | Diffs Authentik's published spec against `scripts/authentik-contract.json` |

`ci.yml` carries no `paths` filter on purpose: it is what `main` is protected on, and a required check that never runs on a docs-only PR blocks that PR instead of passing it. Both node jobs run `prisma generate` first — `app/generated/prisma/` is gitignored and `tsc` resolves through it.

The contract check reads goauthentik's `main` rather than a release, so a field rename shows up before the studio instance is upgraded into it. A scheduled run that drifts opens an issue (deduplicated by title); on a PR the red job is the notification. The snapshot is refreshed by hand with `pnpm authentik:contract --update` once the change is understood.

**Renovate** (`.github/renovate.json`). Non-major npm and GitHub Actions groups and the monthly lockfile refresh automerge; everything else waits for a human. Majors are separate PRs, which is what a Next.js major wants to be: a PR that says a version landed and that nobody merges on sight, because it is a migration rather than a bump (see [AGENTS.md](../AGENTS.md)). The config file does nothing on its own: the Renovate GitHub App has to be installed on the repository. `schedule:weekends` opens PRs across both days, `automergeSchedule` merges them Monday 04:00–08:00. The gap is the review pass: by Monday `schedule:weekends` has stopped opening new PRs, so the set that merges is the set that was reviewed. An out-of-schedule run still processes branches that already have a PR — only branch *creation* is skipped — which is what leaves the Monday window reachable at all. That pairing is also why `platformAutomerge` is **off**: GitHub's own auto-merge is enqueued when the PR is created and fires the moment checks go green, which ignores `automergeSchedule` entirely. Renovate merges these itself instead, and it waits for CI on its own rather than relying on branch protection. Vulnerability alerts opt back out of both schedules.

**GitHub-side settings.** None of this lives in the repository, all of it is assumed by the automation, and all of it is set once:

| Kind | Name | Without it |
| --- | --- | --- |
| Secret | `CODECOV_TOKEN` | the coverage upload fails the `Test` job (`fail_ci_if_error`) |
| Secret | `SENTRY_AUTH_TOKEN` | no source map upload, so production stack traces stay minified |
| Variable | `NEXT_PUBLIC_SENTRY_DSN` | the built image reports nothing to Sentry at all |
| Variable | `SENTRY_ORG` / `SENTRY_PROJECT` | source map upload has no target |

Branch protection on `main` requires exactly `ci.yml`'s three jobs — `Lint and typecheck`, `Test`, `Commit messages`. The Docker and contract jobs must **not** be required: both filter on paths, and a required check that never reports blocks the PR forever instead of passing it. "Require branches to be up to date" stays off, or every Renovate PR stalls — `rebaseWhen: "conflicted"` will not rebase a merely stale branch.

Also repository-level: squash-only merging (see Renovate above), the Renovate and Codecov apps installed, Issues enabled with the assignee named in `authentik-contract.yml` holding repository access, and the `ghcr.io/bsstudio/backstage` package's access linked back to this repository so deployment hosts can pull it.
