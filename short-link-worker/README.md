# Short link worker

Serves the studio's short links. A request to `l.bsstudio.hu/<slug>` is answered with a 302 to
whatever Backstage last published for that slug into Workers KV.

It is deliberately independent of Backstage: the redirect has to keep working during a deploy, a
Postgres restart, or a Backstage outage, because the short URL is already printed on a poster.
Backstage is the control plane — it decides what a slug points at and writes it into KV — and
nothing in the request path touches it.

Plain JavaScript on purpose. The repository's `tsconfig.json` includes `**/*.ts`, so a
TypeScript worker here would be typechecked by the root `pnpm typecheck` under the Next.js
`lib` and module resolution, and a local `tsconfig.json` would not displace that. `.js` avoids
pulling `@cloudflare/workers-types` into the root dependency list for twenty lines of code.

## Cloudflare setup, once

None of this lives in the repository, and nothing in the app can detect that it is missing.

1. **KV namespace.** Create one, then put its id into `kv_namespaces[0].id` in
   `wrangler.jsonc` — it ships as `REPLACE_WITH_KV_NAMESPACE_ID` and the first deploy fails
   until it is filled in. The id is an opaque identifier, not a credential; it is useless
   without an API token.
2. **Analytics Engine dataset.** Nothing to create — the dataset named in `wrangler.jsonc`
   appears the first time the worker writes to it.
3. **DNS.** A proxied record for `l.bsstudio.hu`. The `routes` entry in `wrangler.jsonc` is what
   attaches the worker to it.
4. **Workers Builds.** Connect the Cloudflare account to this repository, set the worker's
   **root directory** to `short-link-worker/`, and set **build watch paths** to the same, so a
   push that touches nothing here does not redeploy. No API token is needed anywhere in
   GitHub — Cloudflare pulls the repository itself, which is the whole reason this is not a
   workflow.

Backstage needs its own, narrower token — **Workers KV Storage: Edit** on that namespace plus
**Account Analytics: Read** — in `CLOUDFLARE_API_TOKEN` in its environment, beside
`CLOUDFLARE_KV_NAMESPACE_ID` and `CLOUDFLARE_ANALYTICS_DATASET`. See `.env.example`.

## Deploying

Cloudflare Workers Builds watches this directory and deploys on a push to `main`. There is no
workflow and no deploy token in GitHub: a workflow would need an API token with Workers
Scripts: Edit, which is far broader than the KV-only token Backstage holds, and Cloudflare can
read the repository on its own.

A build that fails leaves the previous version serving, so a broken config means the update
does not land rather than the redirect breaking.

Known wart: dashboard-connected workers also run a preview build on non-production branches,
and those builds ignore the root directory and watch paths — so an unrelated pull request can
show a build here. It deploys nothing.

To deploy by hand, with a token that has Workers Scripts: Edit in your own environment:

```bash
pnpm worker:deploy
```

## Locally

```bash
pnpm worker:dev
```

`wrangler dev` serves the worker against a local KV namespace, which starts empty — seed a key
to exercise a redirect:

```bash
pnpm exec wrangler kv key put --local --binding LINKS gala https://bsstudio.hu
```

## What it answers

| Request | Answer |
| --- | --- |
| `/<slug>` with a key in KV | 302 to the stored URL |
| `/<slug>` with no key | 404, `Nincs ilyen rövidítés.` |
| `/` | 302 to bsstudio.hu |

**302, never 301.** A browser caches a 301 indefinitely, so retargeting a slug would leave that
visitor going to the old URL forever.

A slug is lowercased before the lookup, matching what Backstage stores, and a trailing slash is
trimmed so `/gala/` and `/gala` are the same link.

## Clicks

Each redirect writes one Analytics Engine data point keyed on the slug, which is what fills the
click column on `/admin/short-links`. `writeDataPoint` returns immediately and the runtime
writes in the background, so the redirect never waits on it, and a failure there cannot fail a
redirect.

Counts are read back with `SUM(_sample_interval)`, not `COUNT(*)` — Analytics Engine downsamples
on both read and write, so a plain count under-reports. Retention is Cloudflare's, so these are
a live reading rather than a stored total.

## Why KV rather than D1

A redirect is one key lookup at the edge, which is exactly what KV is for. D1 would be strongly
consistent and could hold a click counter in the same row, but it has a single-region primary
and would add latency to every redirect. KV writes are eventually consistent — a new or
retargeted link can take up to a minute to reach every location, which is the one cost worth
knowing about.
