# PII Encryption Verification Guide

## Quick Verification

After deploying the PII encryption extension, verify it works correctly:

### 1. Check Environment Variables

```bash
# Verify PII_SECRET is set
echo $PII_SECRET

# Verify PII_KEY_VERSION is set  
echo $PII_KEY_VERSION
# Should output: v1 (or your current version)
```

### 2. Create a Test Reservation

```bash
curl -X POST http://localhost:3003/v1/reservations/hold \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: your-tenant-id" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "venueId": "your-venue-id",
    "partySize": 2,
    "slotLocalDate": "2025-12-15",
    "slotLocalTime": "19:00",
    "guestName": "Test User",
    "guestEmail": "test@example.com",
    "guestPhone": "+1-555-0100"
  }'
```

Save the reservation ID from the response.

### 3. Verify Decryption (API Response)

```bash
curl http://localhost:3003/v1/reservations/{RESERVATION_ID} \
  -H "X-Tenant-ID: your-tenant-id" \
  -H "X-API-Key: your-api-key"
```

**Expected:** Response shows plaintext:
```json
{
  "guestName": "Test User",
  "guestEmail": "test@example.com",
  "guestPhone": "+1-555-0100",
  "piiKeyVersion": "v1"
}
```

### 4. Verify Encryption (Database)

```bash
# Connect to database
docker exec -it postgres psql -U postgres -d reserve_dev

# Query the reservation directly
SELECT 
  id, 
  "guestName", 
  "guestEmail", 
  "guestPhone",
  "guestEmailSearch",
  "guestPhoneSearch",
  "guestPhoneLast4",
  "piiKeyVersion"
FROM "Reservation" 
WHERE id = 'RESERVATION_ID_HERE'
LIMIT 1;
```

**Expected:** Database shows encrypted values:
```
guestName       | YXNkZmFzZGZhc2RmYXNkZmFzZGY... (base64)
guestEmail      | cXdlcnF3ZXJxd2VycXdlcnF3ZXI... (base64)
guestPhone      | enhjdnp4Y3Z6eGN2enhjdnp4Y3Y... (base64)
guestEmailSearch| a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0 (hex)
guestPhoneSearch| b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3b2a1c0 (hex)
guestPhoneLast4 | 0100
piiKeyVersion   | v1
```

**Verify:**
- ✅ guestName/Email/Phone are base64-encoded (NOT plaintext)
- ✅ Searchable fields are hex-encoded hashes
- ✅ guestPhoneLast4 contains last 4 digits
- ✅ piiKeyVersion matches PII_KEY_VERSION env var

### 5. Test Privacy Export

```bash
curl "http://localhost:3003/v1/privacy/export?email=test@example.com" \
  -H "X-Tenant-ID: your-tenant-id" \
  -H "X-API-Key: your-api-key"
```

**Expected:** Returns decrypted reservation data

### 6. Test Key Rotation (Dry Run)

```bash
# Preview what would be rotated
pnpm rotate:pii --dry-run

# Expected output:
# 🔐 PII Key Rotation Script
#    Mode: DRY RUN
#    Target Version: v1
# 
# 🔄 Processing Reservation...
#   Found X records to process
#   ...
```

## Acceptance Criteria Checklist

- [ ] Creating reservations stores **ciphertext** in database
- [ ] Database queries show **base64-encoded** data, not plaintext
- [ ] API responses return **plaintext** (auto-decrypted)
- [ ] Search fields (`guestEmailSearch`) are populated with HMAC tokens
- [ ] `piiKeyVersion` field matches current `PII_KEY_VERSION`
- [ ] Privacy export endpoint returns decrypted data
- [ ] Privacy erase endpoint can find and anonymize records
- [ ] Rotation script can preview changes with `--dry-run`
- [ ] TypeScript compilation passes (`pnpm --filter api run typecheck`)
- [ ] API builds successfully (`pnpm --filter api build`)

## Common Issues

### Issue: "Failed to decrypt PII payload"

**Cause:** Key version mismatch

**Fix:**
```bash
# Check what version records are using
SELECT DISTINCT "piiKeyVersion" FROM "Reservation";

# Ensure that version's key is available
export PII_SECRET_v1="your-old-key"
export PII_KEY_VERSION=v2  # New key
export PII_SECRET="your-new-key"

# Run rotation
pnpm rotate:pii
```

### Issue: Plain text visible in database

**Cause:** Extension not applied or old records

**Fix:**
1. Verify `prisma.service.ts` applies `piiExtension`
2. Restart API server
3. Create new test record
4. If still plaintext, check for errors in API logs

### Issue: Search not working

**Cause:** Search tokens not derived

**Fix:**
```bash
# Re-run rotation to regenerate tokens
pnpm rotate:pii --model=Reservation
```

## Performance Check

After enabling encryption, monitor:

```bash
# Check query performance
SELECT 
  COUNT(*) as total_reservations,
  COUNT(CASE WHEN "piiKeyVersion" IS NOT NULL THEN 1 END) as encrypted_count
FROM "Reservation";

# Should show all records have piiKeyVersion set
```

## Rollback Procedure

If issues arise:

1. **Keep keys** - Don't delete `PII_SECRET` variables
2. **Database has ciphertext** - Don't modify directly
3. **Revert code changes** - Git revert extension commits
4. **Data remains encrypted** - Must decrypt with same keys

To fully rollback:
```bash
# 1. Set PII_KEY_VERSION to original
export PII_KEY_VERSION=v1

# 2. Ensure old key is available
export PII_SECRET="original-key"

# 3. All queries will use old key for decryption
```

## Production Deployment Checklist

- [ ] `PII_SECRET` stored in secure secrets manager (AWS Secrets Manager, Azure Key Vault, etc.)
- [ ] `PII_KEY_VERSION` documented and tracked
- [ ] Backup keys securely stored offline
- [ ] Rotation schedule planned (annually recommended)
- [ ] Monitoring alerts configured for decryption failures
- [ ] Audit logs enabled for all PII access
- [ ] Privacy export/erase tested with production-like data
- [ ] Database backups include encryption keys metadata
- [ ] Team members trained on key rotation procedure
- [ ] Incident response plan includes key compromise scenario

## Support

For deployment assistance:
- Check `docs/privacy/pii-encryption.md` for full documentation
- Review `api-debug.err` for error logs
- Contact platform team for key management questions
