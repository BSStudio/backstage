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

## Which artefacts are still true

```
pnpm tsx migration/status.ts
```

The pipeline gets re-run in pieces over days, so a review file can easily be answering
questions the newest export no longer asks. This compares every artefact's modification
time against its declared inputs and says which are stale, which are missing, and which
nothing under `migration/` produces at all.

`--clean` deletes the orphans and any stale output that holds no human decisions. It never
deletes a file carrying answers — `rejected.tsv`, the review sheets, `id-assignments.json`
— because those are regenerated in place by their own script, which reads them back before
overwriting.

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
   settings → Subject mode → "Based on the User's UUID". Same invariant as the Auth
   section of [CLAUDE.md](../CLAUDE.md) — nothing in the app can detect a violation, which
   is why it is checked here.
2. Every `AUTHENTIK_GROUP_*` UUID in `.env` resolves to a real group, and every
   `AUTHENTIK_GROUP_*` *name* matches one.
3. Website credentials are present.

### Getting the claims

There is no `id_token` lying around to copy — `lib/auth.ts` declares no `database`, so
better-auth keeps the account in its in-memory adapter and never persists one. The
`sub` is still reachable, because `databaseHooks.user.create.before` rewrites the user
row's `id` to it: run the dev server against the **real** Authentik, log in, then open
`/api/auth/get-session` in the same browser and read `user.id` and `user.email`.

```
pnpm tsx migration/preflight.ts --sub <user.id> --email <user.email>
```

That value came out of the OIDC round trip, not out of the Authentik admin UI, so it is
a real test rather than a comparison of the UUID with itself. A hash where a UUID belongs
is the failure this is looking for.

`--token <id_token>` works too if you have one from somewhere else; it reads `sub`,
`email` and `preferred_username` out of the payload.

## 1. Extract

### Authentik

```
pnpm tsx migration/extract-authentik.ts
```

Writes `data/authentik-users.json` and `data/authentik-groups.json`. Service accounts are
kept in the file and filtered out later by `type`.

### Drupal

Load a dump of the site database into a local container — do not query production — then:

```
pnpm tsx migration/extract-drupal.ts --list --password <root password>
pnpm tsx migration/extract-drupal.ts --database <name> --password <root password>
pnpm tsx migration/load-drupal.ts
```

`extract-drupal.ts` runs the four queries in `sql/` through the mysql client *inside* the
container (`docker exec`), so no local mysql install is needed, and captures the output
itself instead of shell-redirecting it — a PowerShell `>` writes UTF-16 or prepends a BOM
and neither survives a TSV parser. Defaults to container `website-mysql-1`, user `root`;
override with `--container` / `--user`, or `DRUPAL_MYSQL_*` in the shell environment. Do
not add those to `.env`, which is kept in step with `.env.example`.

The password goes to the container as `MYSQL_PWD` rather than `-p`, which would put it in
the container's process list and draw a warning on stderr.

`--raw` is deliberately not passed to mysql. It disables the escaping that keeps a tab or
a newline inside a value from splitting the row.

Everything downstream keys off `profile_fields.name`. A wrong guess about a field name
blanks that column for every member rather than failing, so `load-drupal.ts` exits
non-zero when an expected field is absent — reconcile `FIELD` against
`data/drupal/01-profile-fields.tsv` if that fires.

The normalizer prints a tally of every `profile_BSS_state` value and which
`MembershipStatus` it maps to, the join-year parse rate, and duplicate email addresses —
which matter because `Member.email` is unique.

### Names written the wrong way round

```
pnpm tsx migration/inspect-names.ts
```

A flipped name is the one error the matcher cannot catch: the name key sorts its tokens,
so `Barcza Emese` and `Emese Barcza` are the same key and cluster correctly. It then
lands `firstName` and `lastName` swapped on the member and derives the username from the
wrong half, with nothing downstream to notice.

Two signals, and they are not equally good. Authentik's `first_name` / `last_name`
attributes are separate fields rather than a parsed string, so where they exist they settle
it — that covers everyone with an account. For the rest the corpus votes, and Hungarian
makes that hard: Bálint, Máté, Csaba, László, Balázs and Péter are all both family names
and given names, so a bare majority calls a great many correct names flipped. Two tiers
instead:

| Tier | Rule | Measured |
| --- | --- | --- |
| `corpus` | both tokens sit where nothing else in the corpus ever puts them | catches 80% of synthetic flips, no false positives observed |
| `corpus-likely` | the reverse reading wins by 10:1 or better | 87% together, at the cost of the occasional real surname that is a common given name |

Anything weaker is counted but not shown; `--all` lists it. Fix what it finds **at the
source** — the Sheet or the website — not with an override here.

When a flagged name was right all along, write `ok` in the `decision` column of
`data/name-order-review.tsv`. The next run reads the file back before it overwrites it,
keeps the decision, and stops raising that row — otherwise a rare family name that happens
to be a common given name is reported forever.

### Reviewing what Drupal could not decide

```
pnpm tsx migration/inspect-drupal.ts
```

Lists the rows behind those counts — unresolved status, guessed join year, unparseable
join year — each with its `profile_passive` / `blocked` / last-access evidence and a link
to the profile. `WEBSITE_URL` decides where the links point, so aim it at the live site to
check against production rather than the local dump.

It writes `data/drupal-review.tsv` with an empty `decision` column. **Do not fill it in
before the Sheet is normalized.** The Sheet outranks Drupal on `joinedSemester` and
status, so most of these rows answer themselves once the matcher runs; the review file is
the fallback for what the Sheet does not cover.

Two things worth resolving up front, because they are not per-user judgements:

- a status label that always means the same thing belongs in `LEGACY_ALIASES`
  (`lib/status.ts`), decided once rather than per row
- role accounts — a shared mailbox, the site admin, anything carrying Drupal's
  administrator roles — are not members and get `SKIP`

### Google Sheet

Export each tab as CSV into `data/sheets/`, then:

```
pnpm tsx migration/normalize-sheets.ts
```

Encoding and delimiter are both detected: Sheets' own download is comma-separated UTF-8,
while a round trip through a Hungarian Excel produces semicolon-separated windows-1250.
Neither is guessed at — decoding windows-1250 as latin-1 turns `ő` and `ű` into `õ` and `û`
without erroring.

A file containing **U+FFFD replacement characters is rejected outright**. That is not an
encoding to choose between; it is a file that was opened as the wrong codepage and saved
back, and the accents are gone for good. Export that tab again rather than re-saving it.

Every tab carries the same ten columns in the same order, so they are read **by position**:
the first header cell is a stray `f` / `i` on two tabs, and the address and phone columns
are titled differently per tab.

| Column | Goes to |
| --- | --- |
| `Név` | `firstName` + `lastName`, split on Hungarian order |
| `Pozíció` | `status`, `leadershipRole.label`, and an inactive marker — see below |
| `Becenév` | `nickname` |
| `Mikor jött BSS-be` | `joinedSemester` |
| `Egyetem, kar, szak` | `university` + `major` |
| `Cím` | `dormRoom` — `külsős` here means *no dorm room*, not "external member" |
| `Tel`, `E-mail` | `mobile`, `email` |
| `SVIE tagság`, `Megjegyzés` | nothing; no field for them |
| `Öregtag lett` (alumni tab) | the year they became an alumnus |

What the tab name means:

| Tab | Result |
| --- | --- |
| `current` | not archived, status from `Pozíció`; the tab that tracks Authentik |
| `alumni` | not archived, `ALUMNI` — a status, not a soft delete |
| `archived_<year>` | archived, `archivedAt` the start of that year |
| `archived` | archived, date unknown |

Someone on both `current` and `alumni` is on `current` for a reason: those rows are
exactly the `Aktív öregtag`, so `current` wins.

`Pozíció` packs up to three things into one cell and nothing but the value tells them
apart: a status (`Stúdiós jelölt`), a status plus a leadership role
(`Stúdiós - Stúdióvezető`), and an `(inaktív)` marker that only ever appears on the
year-unknown archived tab, where the tab already says as much. A cell that resolves to no
status is kept as a bare role label and left for review rather than guessed at.

## 2. Match

```
pnpm tsx migration/match.ts
```

Groups the three exports into one cluster per person, keyed
`authentik:<uuid>` / `drupal:<uid>` / `sheet:<tab>:<row>`.

**Strong keys**, taken at face value:

1. a shared email address — Drupal carries three per account (`users.mail`,
   `users.init`, `profile_email`) and all three are indexed
2. an identical username between Authentik and Drupal

**Weak keys**, which are how two different Kovács Jánoses become one member:

3. the sorted-token name key, which sidesteps the Hungarian/Western order disagreement
   between the sources
4. `deriveUsername(firstName, lastName)`, and only *across* sources — within one source it
   adds nothing an email or a full name would not already have caught, and it happily
   merges two people, since Almási Eszter and Almási Emma both derive `ealmasi`

A weak key is refused outright when it would put two Authentik users or two Drupal users
in one cluster, or two rows from the *same* sheet tab: a tab is one roster, so nobody is
on it twice. A genuine duplicate row still merges, but only on a strong key. Any cluster
that needed a weak key to form is flagged for review even when it survives.

Accounts that are not people — Authentik's built-in `akadmin`, the site administrator, the
shared studio mailbox — are listed in `lib/skip.ts` and never reach a cluster.

The review file is `data/match-review.tsv`; corrections go into `data/overrides.json`:

```json
{
  "merge": [["drupal:9001", "sheet:archived:2"]],
  "split": [["authentik:<uuid>", "drupal:9002"]]
}
```

Keyed by source id, never by email, so the file carries no PII and re-running preserves
every human decision. A `split` pair that some other key joins anyway is reported rather
than silently honoured. Re-running is expected; the overrides file is what makes it
idempotent, not the email match.

### Fixing the website instead of overriding it

```
pnpm tsx migration/export-website-tasks.ts
```

Writes two worklists for the *website*, not for this repository:

- `data/website-fix-status.tsv` — accounts whose `profile_BSS_state` maps to no
  `MembershipStatus`, with the valid labels and a link straight to the BSS adatok tab
- `data/website-create-users.tsv` — members on a roster with no Drupal account, with the
  username `deriveUsername` would pick (collision-checked against every existing account
  *and* against earlier rows in the file), and a `blockers` column for rows the create form
  would reject

Prefer this over `overrides.json` wherever a decision is really about the website. The
website outlives this migration; an override file does not. Work through both, dump the
database again, then re-run `extract-drupal.ts`, `load-drupal.ts` and `match.ts` — the
clusters that were Sheet-only become Drupal-linked, and `data/id-assignments.json` carries
each member's id across the re-key because it is stored against every record in the
cluster.

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

- Cluster contains an Authentik user → `Member.id` is that user's `uuid` — the `uuid`
  field of the `/core/users/` response, not `pk` and not a `sub` read from a token.
- Otherwise → `localMemberId()` from `@/types`.

**Never a bare `randomUUID()`.** An unprefixed id claims an Authentik account the member
does not have, and `hasAuthentikAccount()` is what decides whether a sync job runs or is
recorded SKIPPED. Test for the shape with `hasAuthentikAccount()` and build ids with
`localMemberId()`; do not write `LOCAL_MEMBER_ID_PREFIX`'s value into a comparison or a
fixture. The token is deliberately opaque because member ids reach the public site inside
avatar URLs, and it may change.

Either way the assignment is recorded in `data/id-assignments.json` and reused on every
subsequent run — that file, not the email match, is what makes re-runs stable.

No Authentik accounts are created, so members with no account cannot log in. That is fine
for archived alumni, and **it is not a one-way door**: if one comes back and gets an
account, `UPDATE "Member" SET id = … WHERE id = …` swaps the prefixed id for the new
`uuid` and carries `LeadershipRole`, `TimelineEntry`, `AuditLog`, `SyncJob` and
`GoogleGroupEntry` with it, because Prisma's required relations default to
`onUpdate: Cascade`. Stored avatar files are keyed by id and have to be renamed alongside.

## 5. Build

```
pnpm tsx migration/build-members.ts
```

Resolves each cluster into the row the import will write, applying the precedence table
above, and records **which source won every field**. That provenance is printed as a
summary and stored per member, because "where did this value come from" is the only
question worth asking of a merge afterwards, and the clusters are gone by then.

Two details the table does not capture:

- `ALUMNI` and `ACTIVE_ALUMNI` share one Authentik group, so group membership proves
  someone is an alumnus but not which kind. Only the Sheet marks anyone `Aktív öregtag`,
  and only on `current` — so the sheet rows are consulted freshest-first, and without a row
  saying otherwise the plain `ALUMNI` is the honest answer.
- `leadershipRole.authentikGroupIds` is not guessed from the label. For a member with an
  account it is their real group membership minus the status group and the Leadership
  group; for anyone else it is empty.

A cluster that cannot produce a complete member is **rejected, listed, and the run fails**
— no status in any source, no email, no usable name, or no join semester. Rejecting is
usually right (a website signup who never joined has none of those for a reason), but it
should never happen quietly. `--allow-unresolved` continues without them.

`data/rejected.tsv` is where they get answered, in its own columns:

| Column | Effect |
| --- | --- |
| `setStatus` | a `MembershipStatus` for a person no source gives one |
| `setJoined` | a semester, e.g. `2011/2012/1` |
| `decision` | `SKIP` drops the person for good and stops counting them as a problem |

The file is read back before it is rewritten, so answers survive a re-run, and they are
keyed by every record on the row rather than by the cluster — a cluster re-keys the moment
it gains a source, and an answer that stopped applying because someone acquired a website
account would be worse than no answer.

`suggestedJoined` and `basis` are offered, never applied. A Drupal account made the week
someone joined dates their joining well; one backfilled during this migration dates
nothing — the alumna whose account was created yesterday would otherwise come out as
having joined this semester. The basis is printed next to the suggestion so that is
obvious.

## 6. Import

The importer writes through raw Prisma, never through `lib/services/`. `createMember`
would call Authentik and Drupal; the whole point here is that it must not. Each member
gets one `MEMBER_CREATED` timeline entry and one audit log with `actorId: null` and
`diff: { imported: true }`.

**No `SyncJob` rows at all** — not even `SKIPPED` ones for the accountless members.
`SKIPPED` records a call the app declined to make; the import makes no calls, and seeding
`/admin/sync-jobs` with hundreds of rows nobody can act on buries the FAILED ones that
matter.

## 7. Verify

The verifier fails on any of:

- a **non-archived** member without `websiteUserId` — their first website sync would land
  as a FAILED job, and alumni are shown on the website's own alumni page, so they need the
  account. Archived members without one are reported but do not fail the run: nobody edits
  an archived member, and a FAILED job for one nobody touches costs nothing
- **both directions** of the id shape: `hasAuthentikAccount(id)` ⇒ the id must resolve to
  a live Authentik user, and a prefixed id ⇒ it must *not*. The second direction is the
  quiet one — a member who does have an account but got a prefixed id has every Authentik
  job recorded SKIPPED, so their sync stops without a single failure to look at
- duplicate emails, or a `LeadershipRole` referencing an unregistered `authentikGroupId`

Then run the app against the imported database and click through `/members`,
`/admin/sync-jobs` and a few member pages.

## 8. Cutover

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
