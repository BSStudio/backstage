# Initial data migration

One-time merge of three sources into an empty Backstage database:

| Source | Holds | Authority |
| --- | --- | --- |
| Authentik | current members plus a few years of archived ones | newest; wins on identity fields |
| Drupal (`bsstudio.hu`) | a superset of the Sheet, going back further | only source of `websiteUserId`; last status + archived flag for people nobody else knows about |
| Google Sheet (multiple tabs) | current and archived roster | only source of academic fields and joined semester; retired after this |

The result is produced **locally**, verified locally, and moved to production as a
`pg_dump`. Nothing here writes to Authentik or to the website — no accounts are created
in either system.

## This branch is never merged

`migration/initial-import` exists so the work has a history and so the cutover can be
repeated from zero if it goes wrong. Only a docs commit lands on `main`; the PR is closed
unmerged and GitHub keeps its commits under `refs/pull/<n>/head` indefinitely.

`data/` is gitignored in full. Every export, review sheet and artifact under it holds
member PII and none of it is ever committed. Keep `data/id-assignments.json` backed up
somewhere outside the repo until the production cutover has succeeded — it is what makes
re-runs produce the same member ids.

## 0. Preflight

```
pnpm tsx migration/preflight.ts --token <id_token>
```

Checks, in order of how much damage each one does if wrong:

1. **The OIDC `sub` equals the user's Authentik UUID.** `Member.id` is written from
   `AuthentikUser.uuid` at import time and from the `sub` claim at login. Authentik's
   default subject mode is a *hashed* user id, not the UUID. If those disagree, every
   imported member gets a second row on first login and every sync job fails to resolve a
   pk. Fix under Applications → Providers → the Backstage provider → Advanced protocol
   settings → Subject mode → "Based on the User's UUID".
2. Every `AUTHENTIK_GROUP_*` UUID in `.env` resolves to a real group, and every
   `AUTHENTIK_GROUP_*` *name* matches one.
3. Website credentials are present.

Get an `id_token` by logging into the portal on the dev instance, or pass
`--sub <sub> --email <address>` if you have the claims another way.

## 1. Extract

### Authentik

```
pnpm tsx migration/extract-authentik.ts
```

Writes `data/authentik-users.json` and `data/authentik-groups.json`. Service accounts are
kept in the file and filtered out later by `type`.

### Drupal

Load a dump of the site database locally — do not query production — then run the four
queries in `migration/sql/` and save each as TSV under `data/drupal/`:

```
mysql --batch --raw -h 127.0.0.1 -u root -p bsstudio \
  < migration/sql/01-profile-fields.sql > migration/data/drupal/01-profile-fields.tsv
```

…and the same for `02-users`, `03-profile-values`, `04-user-roles`. Then:

```
pnpm tsx migration/load-drupal.ts
```

Run `01` first and read its output. Everything downstream keys off `profile_fields.name`,
and a wrong guess about a field name silently blanks that column for every member rather
than failing — `load-drupal.ts` exits non-zero if any expected field is absent.

The normalizer prints a tally of every `profile_BSS_state` value and which
`MembershipStatus` it maps to. Labels the current site no longer writes come out as
UNMAPPED; add them to `LEGACY_ALIASES` in `lib/status.ts` once you have decided what they
mean. It also reports duplicate email addresses, which matter because `Member.email` is
unique.

### Google Sheet

Export each tab as CSV into `data/sheet/`. Tab shapes differ, so each gets its own
normalizer.

## 2. Match

Clustering keys, in descending confidence:

1. normalized email — Drupal carries three (`users.mail`, `users.init`,
   `profile_email`), all three are indexed
2. Drupal username against `deriveUsername(firstName, lastName)`
3. sorted-token name key, which sidesteps the Hungarian/Western order disagreement
   between the sources

The matcher writes a review sheet with one row per proposed cluster, the keys that fired
and a confidence. Corrections go into `data/overrides.json`, keyed by source id
(`authentik:<uuid>`, `drupal:<uid>`, `sheet:<tab>:<row>`) — never by email, so the file
carries no PII and re-running the matcher preserves every human decision. Re-running is
expected; the overrides file is what makes it idempotent, not the email match.

## 3. Field precedence

| Field | Source |
| --- | --- |
| `email`, `firstName`, `lastName`, `mobile` | Authentik `attributes`, else Sheet, else Drupal |
| `status` | Authentik status-group membership, else Drupal `profile_BSS_state`, else Sheet tab |
| `archived` | Drupal `profile_passive` or `users.status = 0`; Authentik `is_active` for members it knows |
| `joinedSemester` | Sheet, else Drupal `profile_BSS_join_year` |
| `nickname` | Sheet, else Drupal `profile_personal_nickname` |
| `university`, `major`, `dormRoom` | Sheet only |
| `leadershipRole` | Drupal `profile_BSS_HQ_role` / `profile_BSS_is_leader`, Sheet overrides |
| `websiteUserId` | Drupal `uid` — always |

## 4. IDs

- Cluster contains an Authentik user → `Member.id` is that user's `uuid`.
- Otherwise a fresh `randomUUID()`, recorded in `data/id-assignments.json` and reused on
  every subsequent run.

No Authentik accounts are created, so members with no account cannot log in. That is
fine for archived alumni. If one ever comes back and gets an account, their `Member.id`
has to change to the new `uuid` — cheap, because Prisma's required relations default to
`onUpdate: Cascade`, so a single `UPDATE "Member" SET id = … WHERE id = …` carries
`LeadershipRole`, `TimelineEntry`, `AuditLog`, `SyncJob` and `GoogleGroupEntry` with it.

## 5. Import

The importer writes through raw Prisma, never through `lib/services/`. `createMember`
would call Authentik and Drupal; the whole point here is that it must not. No `SyncJob`
rows are produced. Each member gets one `MEMBER_CREATED` timeline entry and one audit log
with `actorId: null` and `diff: { imported: true }`.

## 6. Verify

The verifier fails on any of:

- a non-archived member without `websiteUserId` — their first website sync would land as
  a FAILED job
- a member whose id does not resolve back to an Authentik user
- duplicate emails, or a `LeadershipRole` referencing an unregistered `authentikGroupId`

Then run the app against the imported database and click through `/members`,
`/admin/sync-jobs` and a few member pages.

## 7. Cutover

Dump the **whole** local database, `_prisma_migrations` included, and restore it into the
empty production database. The migration table comes along, so the entrypoint's
`migrate deploy` is a no-op on first boot and `RUN_MIGRATIONS` can stay at its default.

The local schema must be at the exact commit the production image is built from.

```
pg_dump --format=custom --no-owner --no-privileges "$LOCAL_DATABASE_URL" > backstage.dump
pg_restore --no-owner --no-privileges -d "$PROD_DATABASE_URL" backstage.dump
```

First thing after the cutover: log in yourself and confirm you land on your existing
member row rather than a new one. That is the live proof of step 0.
