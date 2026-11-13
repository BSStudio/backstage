# API endpoints

`GET /api/members` — list; `?archived=true` includes archived (default excludes). Includes `leadershipRole`, ordered by status then lastName.

`POST /api/members` — create (leader/admin). Requires `firstName`, `lastName`, `email`, `mobile` (E.164, see [Architectural decisions](decisions.md)); optional `nickname`, `university`, `major`, `dormRoom`. Status defaults to `MEMBER_CANDIDATE_CANDIDATE`, `joinedSemester` from `currentSemester()`. Writes a `TimelineEntry` and an `AuditLog`.

`GET /api/members/[id]` — member with `leadershipRole` and full `timeline` (newest first).

`PATCH /api/members/[id]` — members may edit themselves, leaders/admins anyone. Status **and email** changes require leader/admin. `mobile` may be cleared only on a member with no Authentik account. Timeline entry only on status change.

`DELETE /api/members/[id]` — soft archive (leader/admin): sets `archived` + `archivedAt`. `?removeFromGoogleGroup=true` also takes the member off the mailing list; anything else leaves the address in place. A query parameter because a DELETE body is undefined territory that proxies drop. Archiving is undone by `reactivateMemberAction`, a Server Action with no REST route of its own — nothing outside Backstage reactivates anybody, and DELETE was only ever a route because it is the natural verb for the archive. A second archive answers 200 having changed nothing, except `?removeFromGoogleGroup=true`, which still takes the address off the list — see [Architectural decisions](decisions.md).

`PUT /api/members/[id]/roles` — assign/update a leadership role (leader/admin). `label` + `authentikGroupIds`. Identical label and groups is a no-op returning 200 with no audit entry. New assignment writes `ROLE_ASSIGNED`, an update writes `ROLE_CHANGED`.

`DELETE /api/members/[id]/roles` — remove (leader/admin). Returns `{ removed: true }`; silent no-op when no role exists.

`POST`/`DELETE /api/members/[id]/avatar` — upload/remove (self, or leader/admin).

`GET /api/usernames/suggest?firstName=…&lastName=…` — machine-to-machine only (bearer token, see [Machine-to-machine access](auth.md#machine-to-machine-access)). Returns `{ username }` and nothing else. Read-only: it neither creates nor reserves, so the name can be taken by the time the caller uses it — callers handle the create failure. 30 requests per minute per service account, and a 60-second in-memory cache per name, because every miss fans out to Authentik's user API once per collision candidate.

`/api/carddav` — read-only CardDAV, and **not a route handler**: PROPFIND and REPORT never reach one, so `proxy.ts` serves the whole tree (see [Architectural decisions](decisions.md)). `/.well-known/carddav` 301s to it, `/api/carddav/principal/` is the principal (Apple's `/principals` is an alias for it), and `/api/carddav/addressbook/` holds one `<id>.vcf` per member still around — archived members and plain `ALUMNI` are left out, `ACTIVE_ALUMNI` are not. Reads `APP_URL` to absolutise avatar URLs.

`POST /api/computers/[id]/ping` — a workstation agent's heartbeat, machine-to-machine only (bearer token, see [Machine-to-machine access](auth.md#machine-to-machine-access)). `id` is the agent's configured slug; the body is `{ metadata }`. Answers **201** when the ping registered the machine and 200 afterwards. 10 requests per minute per service account — an agent pings once a minute, so anything near that ceiling is a schedule misconfigured into a loop.

`GET /api/computers/[id]/rdp` — an `.rdp` file for the signed-in member, served as an attachment named after the machine. Addresses the workstation at `<id>.<COMPUTER_RDP_HOST_SUFFIX>` on `COMPUTER_RDP_PORT` and prefills `COMPUTER_RDP_AD_DOMAIN\<their Authentik username>`; the password is never in the file. Answers 404 for a machine that has never pinged and for a deployment whose RDP configuration does not parse, so an instance without a host suffix is a supported configuration. `/computers` fetches it rather than linking to it, so a 404 raises a toast instead of navigating the member onto the route's JSON.

`GET /api/health` — container liveness. Public to the proxy and unauthenticated: it answers `{ status: "ok" }`, or 503 once the database round trip fails.

Admin-area resources (sync jobs, audit log, Google Group), app links and computers deliberately have **no** REST read routes; see [Architectural decisions](decisions.md).
