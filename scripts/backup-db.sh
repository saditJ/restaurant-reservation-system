#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/backups}
DATABASE_URL=${DATABASE_URL:-}

if [[ -z "${DATABASE_URL}" ]]; then
  echo "DATABASE_URL must be set (e.g. export from .env.prod)" >&2
  exit 1
fi

timestamp=$(date -u +"%Y%m%d-%H%M%S")
mkdir -p "${BACKUP_DIR}"
filename="${BACKUP_DIR}/reserve-${timestamp}.sql.gz"

echo "Starting pg_dump to ${filename}"
pg_dump --no-owner --format=plain "${DATABASE_URL}" | gzip > "${filename}"
echo "Backup complete: ${filename}"
