# Database Backup & Restore Runbook

This project ships with two helper scripts in `scripts/` that wrap `pg_dump`/`psql` for quick snapshots.

## Prerequisites

- `pg_dump`/`psql` available on the machine running the scripts (install `postgresql-client`).
- `DATABASE_URL` exported in the shell or provided inline. The URL should include credentials for a superuser or a user with full access to the `reserve` database.
- A writable `BACKUP_DIR` (defaults to `/backups`). In `docker-compose.prod.yml` this directory is mounted as a named volume so you can reuse `/backups` from the host or a cron container.

## Taking a Manual Backup

```bash
export DATABASE_URL="postgresql://reserve:supersecret@postgres:5432/reserve?schema=public"
export BACKUP_DIR="/var/backups/reserve"
./scripts/backup-db.sh
```

The script writes a gzip-compressed SQL dump named `reserve-YYYYMMDD-HHMMSS.sql.gz`.

## Restoring

> ⚠️ Restoring will **overwrite** the current database contents. Always double check the target environment.

```bash
export DATABASE_URL="postgresql://reserve:supersecret@postgres:5432/reserve?schema=public"
export BACKUP_DIR="/var/backups/reserve"
./scripts/restore-db.sh
```

You will be prompted for confirmation and the latest dump in `BACKUP_DIR` will be replayed via `psql`.

## Scheduling Nightly Backups

Example cron entry on the docker host (runs at 02:00 UTC daily and logs to syslog):

```
0 2 * * * DATABASE_URL=postgresql://reserve:supersecret@localhost:5432/reserve?schema=public BACKUP_DIR=/var/backups/reserve /opt/reserve/scripts/backup-db.sh >> /var/log/reserve-backups.log 2>&1
```

When running everything through Compose you can also create a lightweight cron container that shares the `backups` volume and executes the script with `docker exec`.
