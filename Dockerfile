# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

##################################################

# Stage 1 - Dependencies

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

##################################################

# Stage 2 - Build

FROM base AS builder

# `next build` freezes NEXT_PUBLIC_* into the bundle, so these cannot be set on the
# running container. A DSN is public, hence plain args rather than secrets.
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_APP_VERSION="dev"
# No `.git` or git binary here, so CI passes what next.config.ts derives locally.
ARG NEXT_PUBLIC_COMMIT_HASH=""
ARG SENTRY_ORG=""
ARG SENTRY_PROJECT=""
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
ENV NEXT_PUBLIC_COMMIT_HASH=$NEXT_PUBLIC_COMMIT_HASH
ENV SENTRY_ORG=$SENTRY_ORG
ENV SENTRY_PROJECT=$SENTRY_PROJECT

COPY --from=deps /app/node_modules ./node_modules

# `pnpm exec` reinstalls when the lockfile or workspace file is missing.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm exec prisma generate

# Generating first only works because `app/generated` is in .dockerignore. Drop that
# entry and this copies the developer's stale client back over the fresh one.
COPY . .

# Without the token `withSentryConfig` skips source map upload and the build still passes.
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
  --mount=type=cache,id=next,target=/app/.next/cache \
  pnpm build

##################################################

# Stage 3 - Migration CLI

# The standalone bundle holds only what the server traced, so the entrypoint's
# `migrate deploy` needs its own CLI. Versions come from package.json to avoid drift.
FROM base AS migrator

WORKDIR /opt/prisma
COPY package.json ./
RUN PRISMA_VERSION="$(node -p "require('./package.json').devDependencies.prisma")" \
  && DOTENV_VERSION="$(node -p "require('./package.json').dependencies.dotenv")" \
  && rm package.json \
  && npm install --no-save --omit=dev "prisma@${PRISMA_VERSION}" "dotenv@${DOTENV_VERSION}"
# Do not try to drop Studio or @prisma/dev to shrink this: build/cli.js requires both
# eagerly, so the CLI stops loading at all.

##################################################

# Stage 4 - Runtime

FROM node:24-alpine AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Fixed high UID — maps to no host account, and volume ownership survives rebuilds.
# npm and npx are dropped: the entrypoint invokes the Prisma CLI through `node`.
RUN apk upgrade --no-cache \
  && rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx \
  && addgroup -S -g 65532 appgroup && adduser -S -u 65532 -G appgroup appuser

WORKDIR /app

COPY --from=builder --chown=65532:65532 /app/.next/standalone ./
COPY --from=builder --chown=65532:65532 /app/.next/static ./.next/static
COPY --from=builder --chown=65532:65532 /app/public ./public

# The config file lives beside the CLI's node_modules so its `dotenv` and `prisma/config`
# imports resolve; its relative migrations path then points at the copy below.
COPY --from=migrator --chown=65532:65532 /opt/prisma/node_modules /opt/prisma/node_modules
COPY --chown=65532:65532 prisma.config.ts /opt/prisma/prisma.config.ts
COPY --chown=65532:65532 prisma /opt/prisma/prisma

# AVATAR_STORAGE=local writes here, relative to the working directory.
RUN mkdir -p /app/storage/avatars && chown -R 65532:65532 /app/storage

COPY --chown=65532:65532 docker-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

LABEL image.uid="65532" image.gid="65532"
USER 65532

EXPOSE 3000

# The start period covers the entrypoint's migration step.
HEALTHCHECK --start-period=60s --interval=30s --retries=5 --timeout=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"]
