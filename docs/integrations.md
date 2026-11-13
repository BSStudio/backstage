# External integrations

## Authentik

Three independent uses:

1. **Login (OIDC)** — `AUTHENTIK_ISSUER`, `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_CLIENT_SECRET`
2. **User/group management (REST)** — `lib/authentik/*`, using `AUTHENTIK_URL`, `AUTHENTIK_API_TOKEN`
3. **Machine-to-machine tokens** — client credentials against the *same* provider as login, no extra config beyond `AUTHENTIK_GROUP_API_CLIENTS`

Group **names** (matched against the OIDC groups claim): `AUTHENTIK_GROUP_LEADERSHIP`, `AUTHENTIK_GROUP_ADMIN` for role resolution, `AUTHENTIK_GROUP_API_CLIENTS` for API clients and `AUTHENTIK_GROUP_COMPUTER_AGENTS` for workstation agents.

Group **UUIDs** (used by the sync layer): `AUTHENTIK_GROUP_CANDIDATE_CANDIDATE`, `AUTHENTIK_GROUP_CANDIDATE`, `AUTHENTIK_GROUP_MEMBER`, `AUTHENTIK_GROUP_ALUMNI` (covers both alumni statuses), and `AUTHENTIK_GROUP_LEADERSHIP_UUID` — note this is a *different* variable from `AUTHENTIK_GROUP_LEADERSHIP`, which holds a name.

**Username derivation.** First Hungarian letter of the first name + full last name, lowercase, diacritics stripped, hyphens removed: `Kovács János → jkovacs`, `Csaba Nagy → csnagy`. `deriveUsername()` in `types/index.ts`, collisions resolved by `findAvailableUsername()` (`lib/authentik/users.ts`). Not overridable — there is no stored username field.

Both are paired in `lib/services/usernames.ts`: `resolveAvailableUsername()` (uncached, used by `createAuthentikUser`) and `suggestUsername()` (cached, used by the suggestion endpoint). Member creation and other studio apps therefore take the same path.

**Contract drift is watched, not tested.** `pnpm authentik:contract` (`scripts/authentik-contract.ts`) downloads goauthentik's OpenAPI spec, extracts the shape of exactly what the `CONTRACT` list names, and diffs it against `scripts/authentik-contract.json`. No running Authentik and no credentials are involved, so it runs anywhere. It reads the spec from `main` rather than a release tag on purpose: `main` runs ahead of the deployed version, so a field rename surfaces here before the instance is upgraded into it. `AUTHENTIK_SCHEMA_URL` points it at a local file or a pinned release instead.

`.github/workflows/authentik-contract.yml` runs it weekly, on `workflow_dispatch`, and on PRs touching `lib/authentik/**` or the script. A PR run signals by going red; a scheduled run has nobody watching, so it opens an issue instead, deduplicated by title against the open ones.

The check only sees what `CONTRACT` lists — see *Add or change an Authentik API call* in [Where to make a change](structure.md#where-to-make-a-change). Nothing links it to `lib/authentik/*` automatically. It also covers only the `/api/v3` REST surface: the OIDC endpoints behind `lib/auth.ts` and `lib/api-client-auth.ts` (`.well-known/openid-configuration`, `/jwks/`) are not in Authentik's spec at all.

## The website (members webhook)

`WEBSITE_WEBHOOK_URL` and `WEBSITE_WEBHOOK_TOKEN`. One endpoint, one verb: a bearer `POST` of members, either as targeted operations or as a whole-roster `replace`. The contract is **theirs**, generated from their own route and published at `docs/api/members-webhook.openapi.yaml` in [kir-dev/bss-stack](https://github.com/kir-dev/bss-stack). Read it there rather than keeping a copy here, which can only go stale.

The token is issued on the website's side and shown there once; it is a client identifier and a secret joined by a dot, and revoking access means revoking the client there.

`membershipStatus` is our `MembershipStatus` verbatim, which is why nothing maps between the two. The contract carries **no email and no mobile**, so neither is a reason to push and neither ever goes over the wire.

`x-bss-delivery-id` is an idempotency key, and the sync layer passes the `SyncJob` id: a push that landed but never answered comes back as a duplicate instead of applying twice, and a push the endpoint *rejected* leaves the key unclaimed, so the same job can retry once the payload is fixed.

## Google Workspace (Cloud Identity)

`GOOGLE_SERVICE_ACCOUNT_KEY` (the downloaded JSON key, base64-encoded), `GOOGLE_GROUP_EMAIL`, and the optional `GOOGLE_ALUMNI_GROUP_EMAIL`. No `googleapis` dependency: `lib/google/client.ts` signs a JWT with `jose`, exchanges it at `oauth2.googleapis.com`, and caches the token **per scope**, so a read path never carries write authority.

**The Admin SDK Directory API is not usable here** — it answers only to a Workspace admin, and the university owns the domain. Cloud Identity accepts a service account that holds the **MANAGER** role on the group itself, with no domain-wide delegation, which is the whole reason this integration exists at all.

What that role can reach was established by probing, not from docs: `groups:lookup`, `memberships.list`, `memberships.create` and `memberships.delete` all work, while `memberships:lookup` is refused on both scopes — it resolves an address against the *directory*, where group-manager rights do not reach. So `removeGroupMember` finds the membership name in the listing instead of looking it up. Restoring that call would mean granting the service account the Workspace **Groups Administrator** role, which needs a Super Admin and buys one saved request.

The service account is itself a member of the group; the reconciliation read filters its own address out, or it would sit there as a permanent `UNKNOWN`.

**The calendar is a second, unrelated grant on the same account.** `GOOGLE_CALENDAR_ID` names it, `lib/google/calendar.ts` reads it on `calendar.readonly`, and the per-scope token cache keeps that token apart from the group ones. None of the Cloud Identity story above applies: sharing the calendar with the service account's address at **"See all event details"** is the entire setup, and no Workspace admin is involved. Leaving `GOOGLE_CALENDAR_ID` unset drops the widget instead of failing, so an instance without a calendar is a supported configuration.

A share that never landed reads as **404, not 403** — the account cannot see the calendar at all, so the API answers as if it did not exist. `scripts/google-calendar-probe.ts` prints what the account can actually read and says as much on a 404.

Three shapes of the events feed cost a probe to establish and none of them is guessable:

- **An all-day `end.date` is exclusive.** A single day on the 4th arrives as the 4th to the 5th, so `endDate` steps a day back from it. Read literally, every all-day event looks a day longer than it is.
- **The API returns anything *overlapping* the window,** so a multi-day event under way arrives dated before `timeMin`. Its own start date is therefore not a safe grouping key — see the hero under [Architectural decisions](decisions.md).
- **`singleEvents=true` is what expands a recurrence** into one row per occurrence, and `orderBy=startTime` is only accepted alongside it. Without them the weekly meetings render once, forever, as the series' first instance.

The request manager writes a `További információk a <a href="…">felkéréskezelőben</a>.` line into the description of every event it creates, which is where an event's `url` comes from — the first anchor in the description, and only when it is `http(s)`.

## Active Directory

`AD_LDAP_URL`, `AD_BIND_DN`, `AD_BIND_PASSWORD`, `AD_USERS_OU` and `AD_UPN_SUFFIX`, plus the optional `AD_LDAP_CA_CERT` and `AD_LDAP_TLS_VERIFY`. The domain exists for logging in to the studio workstations, at the console and over RDP, and for nothing else — so a member's account carries the username, the UPN, the names and whether it is enabled. Leaving any of the five required values empty records every AD job as `SKIPPED`.

**Backstage owns the account; Authentik owns the password.** Authentik cannot create accounts in an on-prem AD — its LDAP source imports in the other direction — but that source's password writeback sets the AD password of any Authentik user carrying a `distinguishedName` attribute, whether or not the source imported them. So Backstage creates, renames, disables and enables the account over LDAPS, and every password a member sets in Authentik — enrollment, recovery, a change — lands in AD through the DN `buildAuthentikAttributes` carries whenever AD is configured. Writeback checks the password against AD's complexity policy first and fails the Authentik change if AD refuses, so the two cannot diverge.

The account's CN is the member id and its `sAMAccountName` the Authentik username: the DN is `CN=<id>,<AD_USERS_OU>` (`memberDistinguishedName`), and the UPN `<username>@<AD_UPN_SUFFIX>`. `userAccountControl` is `NORMAL_ACCOUNT | DONT_EXPIRE_PASSWORD` (66048), plus `ACCOUNTDISABLE` (66050) for an archived member. `DONT_EXPIRE_PASSWORD` is load-bearing: an expiry would force a change at the Windows logon screen, which never reaches Authentik.

AD accepts `unicodePwd` only over an encrypted connection, so the URL must be `ldaps://`. The DC's certificate is self-signed: `AD_LDAP_CA_CERT` pins it (base64-encoded PEM, replacing the system trust store rather than adding to it, and it has to name the host in the URL), or `AD_LDAP_TLS_VERIFY=false` switches verification off, which wins over a pinned certificate. `scripts/active-directory-probe.ts` binds with the configured values and lists the OU.

The domain-side and Authentik-side setup is instance configuration nothing in the app can detect, like Authentik's subject mode, and it lives on the studio wiki: the two delegated service accounts; the LDAP source, with writeback on and user and group sync off; `LDAPBackend` removed from every password stage, without which every wrong Authentik password is also a failed AD bind counting toward lockout; the "Remove Change Password" GPO; a finite lockout duration, since an Authentik reset does not unlock an AD account; and an `adm-` or `svc-` prefix on every account made by hand, since Authentik's username collision check sees only Authentik.

## Sync architecture

Every external mutation creates a `SyncJob` row and executes it **synchronously**: `runSyncJob` writes the row and hands it to `executeSyncJob` (`lib/sync/executor.ts`). Failures persist as `FAILED` rows at `/admin/sync-jobs`, retried manually via `retrySyncJobAction`. There is no background worker.

Service code calls **orchestrators**, never handlers directly. An orchestrator decides only what the row says and whether the call should be skipped; `runSyncJob` writes and runs it, so "the row exists before anything is attempted" is stated once rather than per target. `createAuthentikUser` is the one exception: it runs *before* the Member exists (its `sub` becomes the Member `id`), so it bypasses the job row and the service fabricates a SUCCESS row afterwards.

Handlers receive `(payload, memberId, prisma, jobId)` and resolve external identifiers **at execute time** — Authentik via `getUserPk(memberId)`. Resolving late rather than baking IDs into the payload is what makes retry work: a job that failed because Authentik could not resolve the member succeeds on retry once the account is fixed. A missing link throws, so it lands as a visible `FAILED` row instead of being silently skipped.

**Members with no Authentik account are skipped, not failed.** Every Authentik orchestrator goes through one choke point (`runAuthentikJob`, `lib/sync/authentik/orchestrators.ts`) that checks `hasAuthentikAccount(memberId)` and passes `runSyncJob` a skip reason when it is false. A prefixed id has no user to resolve a pk from, so unlike an account Authentik fails to resolve, no admin action could ever make the job succeed. The row is still written, as `SKIPPED` with `result: { reason }` — an id wrongly carrying the prefix would otherwise stop syncing silently forever. No handler runs, `attempts` stays 0, nothing reaches Sentry.

Every FAILED job is also reported to Sentry from inside `executeSyncJob` — see [Observability](observability.md).

API routes return HTTP **207** with `{ ..., syncErrors: string[] }` when the DB write succeeded but a sync step failed; `syncJson` and `syncJsonResource` (`lib/api-response.ts`) are what choose between that and the normal answer, and services build the list with `collectSyncErrors`. The UI shows a warning toast, not an error.

Authentik specifics: `REACTIVATE_USER` is the reverse of `DEACTIVATE_USER` — the account goes back to `is_active` and the `users` path. `UPDATE_USER` rebuilds `attributes` from the member row at execute time whenever its payload carries them, because Authentik replaces the set wholesale and a retried snapshot could predate newer values or the DN. The payload's `attributes` are the record of what was asked, not what is sent.

Website specifics: one operation, `SYNC_MEMBER` on the `WEBSITE` target, with an empty payload. The handler reads the member row at execute time and sends an `upsert` or — when the row is archived — an `archive`, so a retry pushes what is true *now*. `orchestrateSyncWebsiteMember` is the choke point and skips when the webhook is unconfigured. Every member mutation calls it: create, update, archive, reactivate, both batch operations, both role operations, and both avatar paths.

Google Group specifics: `ADD_TO_GROUP` / `REMOVE_FROM_GROUP` on the `GOOGLE_GROUP` target, with `{ email, groupEmail }` as the payload — the list is in the payload because there are two of them. This target deliberately **does not** resolve its identifier at execute time: the address *is* what the group holds, so re-deriving it from the member row would let a retry act on an address the job was never about. `runGoogleGroupJob` is the choke point and passes the same kind of skip reason when credentials or the target list are unconfigured.

Only three things touch the lists automatically: creating a member adds the address to the main list; a status change **into** alumni adds it to the alumni list (once — the two alumni statuses share one list); archiving offers an optional removal, a checkbox in `ArchiveDialog` that defaults to off and reaches the REST route as `?removeFromGoogleGroup=true`. Everything else is manual on purpose — an email change leaves the old address on the list (the edit sheet says so), nobody is removed on becoming alumni, leaving alumni does not undo the membership, and reactivating an archived member does not put back an address the archive took off. The reconciliation page is where those leftovers surface, and the archive dialog's checkbox says as much.

Active Directory specifics: `CREATE_USER` and `SYNC_MEMBER` on the `ACTIVE_DIRECTORY` target. `CREATE_USER` carries `{ username }`, because Backstage stores no username and the one `createAuthentikUser` settled on cannot be re-derived later; everything else both handlers read from the member row at execute time, so a create retried after an archive makes the account disabled. AD answers code 68 for a taken DN, `sAMAccountName` or UPN alike, so the client counts it as success only when a base search finds the DN — otherwise another account holds the name and the job fails. `SYNC_MEMBER` replaces the names and the whole `userAccountControl`, so it is also the disable and the enable. `runActiveDirectoryJob` is the choke point: it skips a member with no Authentik account first, then an unconfigured AD. `createMember` creates the account and, with AD configured, sends Authentik a second `UPDATE_USER` carrying the DN, which names the member id `createAuthentikUser` only returns; `updateMember` syncs a first or last name change; archiving, the batch archive and reactivation sync the enabled flag. A `CREATE_USER` skipped for missing configuration stays skipped once AD is configured, and the member's next edit sends the DN anyway, which locks them out of Authentik password sets; insert the job by hand, as for an `x_` member.

## Google Group reconciliation

`/admin/google-group`. "Lista frissítése" reads the group live and rebuilds `GoogleGroupEntry`: addresses no longer on the list are deleted, matched ones are linked to their member, hand-set states and notes survive. There is no upload step — that was the pre-API design.

Each refresh writes a `GOOGLE_GROUP_SYNCED` audit entry carrying `{ addresses: { old, new } }`, and that entry **is** the "last read" timestamp the page shows. Nothing else records when a read happened, and a column would duplicate the same fact.

Two tables: the group's addresses (sortable by address or state, state ordered by how much attention a row needs — `UNKNOWN` first, `MATCHED` last) and members no address on the list resolves to. Alumni and archived members sit behind a checkbox in the second one, since they are expected to be absent and would bury the rows worth acting on.

Leaders read the page; refreshing and annotating are admin-only, enforced in the service and the Server Action rather than by hiding the buttons.
