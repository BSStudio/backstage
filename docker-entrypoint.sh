#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Applying database migrations..."
  # `migrate deploy` waits on its advisory lock forever, so a container that boots
  # mid-migration would hang here silently.
  if ! timeout "${MIGRATION_TIMEOUT:-300}" \
    sh -c 'cd /opt/prisma && node node_modules/prisma/build/index.js migrate deploy'; then
    echo "Migrations failed or timed out after ${MIGRATION_TIMEOUT:-300}s." >&2
    exit 1
  fi
fi

exec "$@"
