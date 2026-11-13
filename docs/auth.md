# Auth and permissions

Better Auth with the `genericOAuth` plugin against Authentik's OIDC discovery URL. Handler at `app/api/auth/[...all]/route.ts`, client helper in `lib/auth-client.ts`. The plugin registers Authentik as an ordinary social provider, so login is `signIn.social({ provider: "authentik" })` on the core endpoints — there is no client-side plugin, the redirect URI registered in Authentik is `<origin>/api/auth/callback/authentik`, and PKCE is on.

**The issuer is normalised before anything is appended to it.** Authentik's issuer identifier ends in a slash — `https://…/application/o/backstage/` is what its own discovery document reports — so joining `/.well-known/openid-configuration` onto the raw value yields a double slash, which Authentik answers 404 to: discovery returns nothing and login breaks, while better-auth skips the provider and leaves the rest of the auth routes alive. Both the login config and `lib/api-client-auth.ts` therefore take the value from `authentikIssuer()` (`lib/authentik/issuer.ts`), which drops the trailing slash. The slash-terminated form is still what arrives in an `iss` claim, which is why `requireApiClient` verifies against both spellings.

On login `mapProfileToUser` reads the `groups` claim and derives a role, and carries the Authentik `sub` in an `authentikSub` field; a `databaseHooks.user.create.before` hook promotes that to the user row `id`, so it matches the Member `id`. It also carries `preferred_username` into `authentikUsername`, which is the Authentik username and therefore the AD account name — the only place this app has one, and only for the length of a session. None of these `additionalFields` may carry `input: false` — better-auth strips such fields from the OAuth profile as well, which leaves every login unnamed, `MEMBER`, and keyed on a generated id.

`role`'s field `type` is the `USER_ROLES` list rather than `"string"`: better-auth infers the field's type from a literal array, so `session.user.role` reads as `UserRole` everywhere and no caller asserts it back. Nothing changes at runtime — a literal-array field is still a text column.

**The provider's subject mode must be "Based on the User's UUID"** (Applications → Providers → the Backstage provider → Advanced protocol settings). Authentik's default is a *hashed* user id, which is not the UUID the REST API filters on — so with the default, `sub` matches no Member row and every login creates a duplicate keyed on the hash, while `getUserPk` fails to resolve anything. Nothing in the app can detect this; it is instance configuration.

The handler mounts Better Auth's whole router, so `hooks.before` 404s every path outside `ALLOWED_AUTH_PATHS` (`lib/auth.ts`). Only the OIDC round trip (`/sign-in/social`, `/callback/:id`), `/get-session`, `/sign-out` and `/error` stay reachable; passwords, account linking and `/update-user` — which without `input: false` would let a member set their own `role` — belong to Authentik.

`proxy.ts` lets `/login`, `/api/auth`, `/api/usernames`, `/api/health`, `/monitoring` and the workstation agent's ping through, and turns everything else away when no session cookie is present. Only a `GET` or `HEAD` outside `/api/` is redirected to `/login` with the original path as `callbackUrl`; everything else — an API call, a Server Action `POST` on an expired session, a phone probing for a collection — gets a 401 JSON body. The rule is the method rather than the path prefix because only a browser navigation can act on a redirect: anything else resolves with the login HTML under a 200 and cannot tell that apart from a real answer. Its matcher excludes static assets and image extensions — which is why avatar URLs are readable without auth. `/api/usernames` is public to the proxy because it carries a bearer token instead of a session cookie; the route itself does the authenticating. The agent's ping is public for the same reason, but as a pattern rather than a prefix — a `GET /api/computers` added later must not inherit the exemption from its neighbour.

CardDAV is checked ahead of all of that, and by method as well as by path: a WebDAV verb reaches `handleCardDav` wherever it is aimed, because a client hunting for a collection points them at arbitrary paths and cannot read a login page. `OPTIONS` is deliberately not one of them — it is also an ordinary CORS preflight.

The proxy only sees whether a cookie *exists*. `requireAuth()` is what rejects one that is expired or forged, so it is still the check that matters — the proxy only decides what an anonymous caller is told.

`lib/session.ts` resolves the caller in the shape each kind of entry point needs. All of them take a predicate from `lib/permissions.ts` rather than a role list:

| Helper | Returns | For |
| --- | --- | --- |
| `requireAuth()` | `Session` or a 401 `NextResponse` | routes, which early-return the response |
| `requirePermission(allows)` | `Session` or a 401/403 `NextResponse` | routes |
| `sessionActor()`, `permittedActor(allows)` | `Actor \| null` | Server Actions, which answer with a result object |
| `pageActor(allows?)` | `Actor`, or `redirect("/login")` unauthenticated / `redirect("/")` refused | pages, which have nowhere to put a status code |

`toActor(session)` in `lib/permissions.ts` reduces a session to the `{ id, role }` actor services take. It is typed structurally rather than on `Session`, so `lib/permissions.ts` pulls in neither `next/headers` nor better-auth — `components/app-sidebar.tsx` is a client component that imports it, and either would break the browser bundle.

**Every rule lives in `lib/permissions.ts`.** Nothing else compares a role to a literal — the predicates (`canManageMembers`, `canViewAdminArea`, `canAdminister`, `canModifyMember`) drive the UI, and the `ensureCan*` guards enforce it in the services. A route's `requirePermission` only fails the request earlier, before a body is parsed; it is not what makes the call safe.

| Role | Derived from | Can |
| --- | --- | --- |
| `MEMBER` | everyone else | view member list, view/edit own profile |
| `LEADER` | `AUTHENTIK_GROUP_LEADERSHIP` | + edit any member, change status, assign/remove roles, create, archive, reactivate; read the whole admin area — audit log, sync jobs, Google Group reconciliation, app links |
| `ADMIN` | `AUTHENTIK_GROUP_ADMIN` | + retry failed sync jobs, force a full website sync, refresh and annotate the Google Group list, create/edit/reorder/delete app links, delete a computer |

The admin area splits on read vs write: `LEADER` sees every admin page, `ADMIN` is what the mutations on them require.

`resolveUserRole(groups)` in `types/index.ts` implements the mapping.

## Machine-to-machine access

Other studio apps authenticate with Authentik **client credentials** against the same login provider — no second provider, application or redirect URI. One service account per consuming app, added to the group named by `AUTHENTIK_GROUP_API_CLIENTS`; the account's app password is the per-app secret, so revoking access means deleting the account. Authentik's client-credentials flow takes `client_id` plus that username and password, so the provider's own client secret never leaves the server.

`requireApiClient(req, kind)` takes the *kind* of caller, and each kind names its own group: `apiClient` (the default) requires `AUTHENTIK_GROUP_API_CLIENTS`, `computerAgent` requires `AUTHENTIK_GROUP_COMPUTER_AGENTS`. One group would make every workstation token a credential on every machine-to-machine endpoint, and an agent token sits on a machine members can walk up to.

`requireApiClient(req)` (`lib/api-client-auth.ts`) does `jwtVerify` + `createRemoteJWKSet` against `AUTHENTIK_ISSUER` (JWKS at `<issuer>/jwks/`, memoized per issuer), audience `AUTHENTIK_CLIENT_ID`, then requires the API-client group in the `groups` claim. It returns a `NextResponse` on failure like the session helpers do, and the caller identity (`sub`, `preferred_username`) otherwise.

It lives **outside** `lib/session.ts` on purpose. Login and client-credentials tokens share an issuer and an audience, so a member's browser access token is a structurally valid bearer here — group membership is the only boundary. In the shared helpers it would become a valid credential on every route, admin ones included.

## CardDAV access

A phone's CardDAV client cannot fetch an Authentik token, so `/api/carddav` authenticates with HTTP Basic against per-device tokens. `authenticateCardDavToken` hashes what arrives and looks the digest up on a unique index. The **username is ignored**: the token is the whole credential, and checking an address would break every device a member owns the day a leader corrects their email. An archived member's tokens stop working.

Like `lib/api-client-auth.ts`, this sits outside `lib/session.ts` — a different credential on a different boundary, which in the shared helpers would become a valid credential everywhere.

Minting is self-service only. A leader may list and delete another member's devices, so a lost phone can be cut off, but never mint one. Both actions are audited.
