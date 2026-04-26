import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { resolveUserRole } from "@/types";

export const auth = betterAuth({
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "MEMBER",
        input: false,
      },
      firstName: {
        type: "string",
        required: false,
        input: false,
      },
      lastName: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Use OAuth sub as user ID
          const { _sub, ...rest } = user as Record<string, unknown>;
          return { data: { ...rest, id: _sub } as typeof user };
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
              _sub: profile.sub,
            } as Record<string, unknown>;
          },
        },
      ],
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
