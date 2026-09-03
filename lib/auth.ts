import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { authentikIssuer } from "@/lib/authentik/issuer";
import { resolveUserRole, USER_ROLES } from "@/types";

// Better Auth mounts its whole router, including password, account-linking and
// profile-mutation routes Authentik owns. Patterns, not resolved URLs.
const ALLOWED_AUTH_PATHS = new Set([
  "/sign-in/social",
  "/callback/:id",
  "/get-session",
  "/sign-out",
  "/error",
]);

export const auth = betterAuth({
  baseURL: process.env.APP_URL,

  session: {
    expiresIn: 60 * 60 * 8,
    updateAge: 60 * 60,
  },

  user: {
    additionalFields: {
      // The literal list, not "string": better-auth infers the field's type from it, so
      // `session.user.role` lands as UserRole and no caller has to assert it back.
      role: {
        type: [...USER_ROLES],
        required: true,
        defaultValue: "MEMBER",
      },
      firstName: {
        type: "string",
        required: false,
      },
      lastName: {
        type: "string",
        required: false,
      },
      authentikSub: {
        type: "string",
        required: false,
        returned: false,
      },
    },
  },

  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (!ALLOWED_AUTH_PATHS.has(ctx.path)) {
        throw new APIError("NOT_FOUND", {
          message: "Auth endpoint not enabled",
        });
      }
    }),
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const { authentikSub } = user as { authentikSub?: string };
          if (!authentikSub) return;
          return { data: { ...user, id: authentikSub } };
        },
      },
    },
  },

  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "authentik",
          discoveryUrl: `${authentikIssuer()}/.well-known/openid-configuration`,
          // Without an explicit issuer, a failed discovery fetch throws out of
          // plugin init and takes down every auth route, `/get-session`
          // included. Pinned here, an unreachable Authentik only breaks login.
          accountIssuer: authentikIssuer(),
          clientId: process.env.AUTHENTIK_CLIENT_ID ?? "",
          clientSecret: process.env.AUTHENTIK_CLIENT_SECRET ?? "",
          scopes: ["openid", "email", "profile"],

          // Without this better-auth writes the mapped fields once, at first sign-in, and
          // ignores them forever after — so a group change in Authentik would never reach
          // `role`, and revoking leadership there would leave Backstage access intact.
          overrideUserInfo: true,

          mapProfileToUser: async (profile) => {
            const groups = Array.isArray(profile.groups)
              ? (profile.groups as string[])
              : [];
            return {
              role: resolveUserRole(groups),
              firstName: profile.given_name,
              lastName: profile.family_name,
              authentikSub: profile.sub,
            } as Record<string, unknown>;
          },
        },
      ],
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
