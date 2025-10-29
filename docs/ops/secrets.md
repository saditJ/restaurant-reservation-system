# Secrets & Key Management

This document captures the minimum guardrails for managing credentials across the Reserve Platform.

## Inventory

- **API_KEYS** (`apps/api`): Comma-separated allowlist for write endpoints and admin actions.
- **API_KEY** (`apps/b2b-console`, `apps/booking-widget`): Per-client key injected into proxy calls to the API.
- **DATABASE_URL**: Prisma connection string for Postgres.
- **Third-party tokens**: Add additional entries here as integrations come online.

## Storage Guidance

| Environment | Recommended Store | Notes |
|-------------|-------------------|-------|
| Local       | `apps/*/.env` tracked only locally | Never commit populated `.env` files. Templates live in `configs/.env.example`. |
| CI / CD     | GitHub Actions Encrypted Secrets   | Use repository secrets for shared values, environment secrets for environment-specific overrides. |
| Production  | Secret manager (e.g. AWS Secrets Manager, Doppler, Vault) | Rotate keys automatically where possible. |

## Rotation Playbook (API Keys)

1. **Generate** a new random value (e.g. `openssl rand -base64 32`).
2. **Update source of truth**:
   - Add new key to the secure store.
   - Append it to `API_KEYS` for the API service.
   - Update dependent clients (`API_KEY` for web apps) to send both old and new keys during overlap.
3. **Deploy** the configuration change. The API reads the comma-separated list at startup.
4. **Verify**:
   - Hit `GET /ready` and ensure `dependencies.database` is still `ok`.
   - Use the `/metrics` endpoint to confirm request success counts with the new key.
5. **Remove** the old key from clients and the API once logs show zero traffic using it.

Automate steps 2-5 with an internal CLI or secrets manager when possible. Track key ownership and expiry dates in your runbook.

## Local Development

- Copy `configs/.env.example` into each app directory and set developer-specific values.
- Never commit real credentials—Git is treated as an unsecured transport.
- Rotate locally cached keys whenever production keys rotate; stale keys will fail readiness checks.

## Incident Response

If a key leaks:

1. Revoke the compromised key immediately (remove from `API_KEYS`).
2. Issue replacement keys to affected clients.
3. Audit logs via the `/metrics` histogram (`route="/v1/availability"`) to verify load returning to expected levels.
4. Update this document with lessons learned.

