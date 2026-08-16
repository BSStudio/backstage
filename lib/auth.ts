import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { resolveUserRole } from "@/types";

// Better Auth mounts its whole router, including password, account-linking and
// profile-mutation routes Authentik owns. Patterns, not resolved URLs.
const ALLOWED_AUTH_PATHS = new Set([
  "/sign-in/oauth2",
  "/oauth2/callback/:providerId",
  "/get-session",
  "/sign-out",
  "/error",
]);

export const auth = betterAuth({
  user: {
    additionalFields: {
      role: {
        type: "string",
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
          discoveryUrl: `${process.env.AUTHENTIK_ISSUER}/.well-known/openid-configuration`,
          clientId: process.env.AUTHENTIK_CLIENT_ID ?? "",
          clientSecret: process.env.AUTHENTIK_CLIENT_SECRET ?? "",
          scopes: ["openid", "email", "profile"],

          mapProfileToUser: async (profile) => {
            const groups: string[] = profile.groups ?? [];
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
