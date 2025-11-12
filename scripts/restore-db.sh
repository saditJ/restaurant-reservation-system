#!/usr/bin/env bash
set -euo pipefail

# Restores the most recent dump produced by backup-db.sh.
# ⚠️ This will DROP existing data. Make sure you know what you're doing.

BACKUP_DIR=${BACKUP_DIR:-/backups}
DATABASE_URL=${DATABASE_URL:-}

if [[ -z "${DATABASE_URL}" ]]; then
  echo "DATABASE_URL must be set before running a restore." >&2
  exit 1
fi

latest_backup=$(ls -1t "${BACKUP_DIR}"/reserve-*.sql.gz 2>/dev/null | head -n 1 || true)
if [[ -z "${latest_backup}" ]]; then
  echo "No backups found in ${BACKUP_DIR}" >&2
  exit 1
fi

read -r -p "This will overwrite data using ${latest_backup}. Continue? [y/N] " reply
if [[ ! "${reply}" =~ ^[Yy]$ ]]; then
  echo "Restore aborted."
  exit 0
fi

echo "Restoring ${latest_backup}..."
gunzip -c "${latest_backup}" | psql "${DATABASE_URL}"
echo "Restore complete."
