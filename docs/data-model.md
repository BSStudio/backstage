# Data model

Prisma client generated to `app/generated/prisma/`, using the `@prisma/adapter-pg` driver adapter over a raw `pg` connection.

**Member** — central record. `id` is the member's **Authentik user UUID**: the OIDC `sub` claim at login and the `uuid` the sync layer filters `/core/users/` on to resolve a pk. There is no separate `authentikId` — `id` serves both, which is why Authentik's provider **subject mode must be "Based on the User's UUID"** (see [Auth](auth.md)).

Members with no Authentik account — imported alumni, nobody the app created — carry an id prefixed with `LOCAL_MEMBER_ID_PREFIX` instead (`localMemberId()` / `hasAuthentikAccount()` in `types/index.ts`). The prefix is the *only* record that the account is missing, and unlike the random UUID it replaces it cannot be mistaken for a real one. Its value is a meaningless token rather than a descriptive word because member ids reach the public site inside avatar URLs — refer to the constant, not the literal. Giving such a member an account later means rewriting the id to the new UUID; Prisma's required relations default to `onUpdate: Cascade`, so a single `UPDATE "Member" SET id = …` carries every child row with it.

No Backstage code runs in that procedure, so nothing writes the AD `CREATE_USER` job either, and the member's next edit sends Authentik a DN for an account that does not exist. Insert the job `createMember` would have written, then retry it from `/admin/sync-jobs`, which offers retry on a `PENDING` row. `id` and `updatedAt` are filled by Prisma rather than the database, so the SQL supplies them:

```sql
INSERT INTO "SyncJob" (id, target, operation, "memberId", payload, "updatedAt")
VALUES (gen_random_uuid()::text, 'ACTIVE_DIRECTORY', 'CREATE_USER', '<uuid>',
        '{"username": "<authentik username>"}', now());
```

**LeadershipRole** — only *active* roles, one per member (1:1 via `@unique` on `memberId`). Holds a free-text `label` and an array of `authentikGroupIds`. When a role ends the row is deleted and a `TimelineEntry` snapshot is written instead. Archiving the member is one of the ways it ends — see [Architectural decisions](decisions.md).

**AuthentikGroup** — registry of known Authentik groups powering the role-assignment checklist. Populated manually by admins. The Authentik UUID is the primary key — no separate cuid. It is a constraint and not just a source for the checklist: `assignRole` refuses an id the registry does not name, or a leader could grant any group in the instance, `AUTHENTIK_GROUP_ADMIN` included.

**TimelineEntry** — human-readable history: status promotions, role changes, archival, reactivation.

**AuditLog** — field-level diff log, `{ field: { old, new } }` JSON. Written on every mutation. A status change and a field update in the same request produce **separate** entries (`STATUS_CHANGED` + `MEMBER_UPDATED`). `targetId` is nullable because `GOOGLE_GROUP_SYNCED` records a read of the mailing list and `WEBSITE_FULL_SYNC` a push of the whole roster, neither of which is about a single member. `targetLabel` names what an entry is about when that is not a member either — an app link, say. It is a snapshot rather than a relation, so the log still reads correctly after the row it names is renamed or deleted; an `APP_LINK_UPDATED` entry stores the name the link goes by *after* the change.

**SyncJob** — one row per external call, against Authentik, Active Directory, the website or a Google Group. PENDING → IN_PROGRESS → SUCCESS | FAILED, plus `SKIPPED` for a call that was never attempted (see [Sync architecture](integrations.md#sync-architecture)). `memberId` is a required FK. Failed jobs surface at `/admin/sync-jobs` and are individually retryable, and so is a row left `PENDING` or `IN_PROGRESS` — execution is synchronous, so one outliving its request was interrupted. `SUCCESS` and `SKIPPED` are the two that are finished and refuse a retry.

**GoogleGroupEntry** — one row per address on the mailing list, rebuilt from a live read. `matchStatus` is either derived by matching the address against `Member.email` (`MATCHED`, `ARCHIVED_ON_LIST`, `UNKNOWN`) or set by hand (`SECONDARY_EMAIL` — a member's other address; `KNOWN_ADDRESS` — no member behind it and that is fine, another list or an external contact). The two hand-set states survive a refresh, everything else is recomputed, and notes survive either way. `KNOWN_ADDRESS` requires a note: with no member link it is the only record of what the address is.

**AppLink** — one of the studio's other applications, listed on `/apps`. Config rather than member data: no relations, and nothing here is derived from anything else. `icon` is a lucide name from the curated list in `types/index.ts`, `accent` is an enum of eight presets rather than a colour string, `featured` is what the dashboard filters on and `/apps` ignores, and `sortOrder` is renumbered contiguously on every move.

**Computer** — one studio workstation, created by its own agent's first ping rather than by an admin. `id` is the slug the agent config carries (`nle4`), not a generated key — it is what the ping URL names. There is no display name column: it is the slug uppercased. `agentSub` records the service account that claimed the id, and a different one pinging it is refused. `metadata` is whatever the agent last reported — OS, load, signed-in user, whether the screen is locked — validated on the way in and re-parsed on the way out, so a row written by an older agent still renders. Status is derived, not stored: online means a ping inside `COMPUTER_ONLINE_WINDOW_MS`.

**CardDAVToken** — one row per device a member set up for contact sync. `tokenHash` is the SHA-256 of a 256-bit random token; the token itself is shown once and stored nowhere. `label` names the device, `lastUsedAt` moves at most once every five minutes. Deleting the row revokes the device.

## Membership status

```prisma
enum MembershipStatus {
  MEMBER_CANDIDATE_CANDIDATE // stúdiós-jelölt jelölt
  MEMBER_CANDIDATE           // stúdiós-jelölt
  MEMBER                     // stúdiós
  ACTIVE_ALUMNI              // aktív öregtag
  ALUMNI                     // öregtag
}
```

`ACTIVE_ALUMNI` and `ALUMNI` map to the **same** Authentik group and the **same** mailing list, and carry no permission difference. The one place the two part ways is the CardDAV address book, which carries `ACTIVE_ALUMNI` and drops `ALUMNI` (see [Architectural decisions](decisions.md)); everywhere else the distinction is a badge. `ALUMNI_STATUSES` and `isAlumniStatus()` in `types/index.ts` are the shared predicate; the members and alumni pages keep their own filters because they enumerate different concepts.

## Semester format

One string: `"2025/2026/1"` (autumn) or `"2025/2026/2"` (spring) — start year / end year / semester number. Sorts correctly as a string. Helpers in `types/index.ts`: `parseSemester`, `formatSemester` (`"2025 ősz"`) and `currentSemester`. Nothing validates the format — only `currentSemester()` ever writes one.

## Dates and the studio zone

The container runs on UTC and the studio does not, so nothing derives a calendar date from the server's clock. `STUDIO_TIME_ZONE` and `civilDate(instant, zone?)` in `types/index.ts` resolve an instant to the date it falls on **at the studio**; `addDays`, `startOfWeek` (Monday, as a Hungarian calendar starts) and `daysBetween` are whole-day arithmetic over the `"YYYY-MM-DD"` strings that produces, done in UTC so no zone shift can move them.

Rendering splits along the same line. An instant is formatted **in the studio's zone**, because that is the clock on the wall — `formatTimestamp` and `formatTimestampDate` in `types/index.ts` for a stored one, `lib/calendar.ts`'s `clock` for an event. A `"YYYY-MM-DD"` is already a civil date with no zone of its own, so it is parsed and formatted **as UTC** — putting it through Budapest would shift it a day. Getting this backwards moves a Monday all-day event into the previous week, which is exactly the bug the split exists to prevent.
