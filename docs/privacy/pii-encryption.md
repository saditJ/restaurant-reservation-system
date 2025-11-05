# Transparent PII Encryption with Prisma Extensions

## Overview

This implementation provides transparent encryption/decryption of PII (Personally Identifiable Information) fields using Prisma's `$extends` API. All sensitive data is encrypted at rest in the database, but appears as plaintext to application services.

## Architecture

### Core Components

1. **`src/prisma/pii.extension.ts`** - Transparent encryption extension
   - Intercepts all Prisma queries via `$allOperations`
   - Encrypts fields on write (create, update, upsert)
   - Decrypts fields on read (findMany, findFirst, etc.)
   - Handles nested operations and relations

2. **`src/privacy/pii-crypto.ts`** - Cryptographic primitives
   - `encryptPii()` - AES-256-GCM encryption with authentication
   - `decryptPii()` - Decrypts with version-specific keys
   - `deriveEmailSearch()` - HMAC-based searchable tokens
   - `derivePhoneSearch()` - Phone number search tokens
   - `getActivePiiKeyVersion()` - Current key version

3. **`src/prisma.service.ts`** - Extension integration
   - Applies `piiExtension` before `tenantScopeExtension`
   - Order matters: PII encryption → tenant filtering

4. **`scripts/rotate-pii-keys.ts`** - Key rotation utility
   - Re-encrypts records with new key version
   - Supports dry-run mode and batch processing
   - Updates searchable and derived fields

## Encrypted Fields

### User Model
- `emailEnc` - User email address
- `nameEnc` - User display name

### Reservation Model
- `guestName` - Guest full name
- `guestEmail` - Guest email address
- `guestPhone` - Guest phone number
- Derived fields:
  - `guestEmailSearch` - Searchable email token (HMAC)
  - `guestPhoneSearch` - Searchable phone token (HMAC)
  - `guestPhoneLast4` - Last 4 digits of phone
  - `piiKeyVersion` - Encryption key version used

### Waitlist Model
- `name` - Guest name
- `emailEnc` - Guest email
- `phoneEnc` - Guest phone number

## How It Works

### Write Operations (Create/Update)

```typescript
// Service code (plaintext)
await prisma.reservation.create({
  data: {
    guestName: 'John Doe',
    guestEmail: 'john@example.com',
    guestPhone: '+1-555-0100',
    // ... other fields
  }
});

// Database storage (encrypted)
{
  guestName: 'base64_encrypted_ciphertext...',
  guestEmail: 'base64_encrypted_ciphertext...',
  guestPhone: 'base64_encrypted_ciphertext...',
  guestEmailSearch: 'hmac_hash_for_search...',
  guestPhoneSearch: 'hmac_hash_for_search...',
  guestPhoneLast4: '0100',
  piiKeyVersion: 'v1'
}
```

### Read Operations (Find)

```typescript
// Query returns decrypted data automatically
const reservation = await prisma.reservation.findUnique({
  where: { id: 'res_123' }
});

console.log(reservation.guestName); // "John Doe" (decrypted)
console.log(reservation.guestEmail); // "john@example.com" (decrypted)
```

### Searchable Fields

Email and phone searches use HMAC tokens:

```typescript
// Privacy service searches by email
const searchToken = deriveEmailSearch('john@example.com');
const reservations = await prisma.reservation.findMany({
  where: { guestEmailSearch: searchToken }
});
// Returns all reservations for john@example.com (decrypted)
```

## Configuration

### Environment Variables

```bash
# Required: 32-byte encryption key (base64, hex, or UTF-8)
PII_SECRET=your-32-byte-base64-encoded-key

# Optional: Current key version (default: v1)
PII_KEY_VERSION=v1

# Optional: Legacy key versions for rotation
PII_SECRET_v1=old-key-base64...
PII_SECRET_v2=new-key-base64...
```

### Key Generation

Generate a secure 32-byte key:

```bash
# Using OpenSSL
openssl rand -base64 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Key Rotation

### Process

1. **Generate new key** and set as new version:
   ```bash
   export PII_SECRET_v2="new-32-byte-key..."
   export PII_KEY_VERSION=v2
   ```

2. **Keep old key** for decryption:
   ```bash
   export PII_SECRET_v1="old-32-byte-key..."
   ```

3. **Run rotation script**:
   ```bash
   # Dry run to preview changes
   pnpm rotate:pii --dry-run
   
   # Rotate all models
   pnpm rotate:pii
   
   # Rotate specific model only
   pnpm rotate:pii --model=Reservation
   
   # Custom batch size
   pnpm rotate:pii --batch-size=500
   ```

4. **Verify completion** - Script reports:
   - Total records processed
   - Total records updated
   - Any errors encountered

5. **Remove old key** after verification:
   ```bash
   unset PII_SECRET_v1
   ```

### Rotation Script Options

```bash
--dry-run              Preview changes without writing to database
--batch-size=N         Process N records at a time (default: 100)
--model=ModelName      Rotate only specific model (User, Reservation, Waitlist)
```

## Security Features

### Encryption Algorithm

- **AES-256-GCM** - Authenticated encryption with associated data
- **12-byte IV** - Unique initialization vector per record
- **16-byte auth tag** - Prevents tampering
- **32-byte key** - Required key length for AES-256

### Ciphertext Format

```
[12-byte IV][16-byte Auth Tag][N-byte Encrypted Data]
Base64 encoded for storage
```

### Key Management

- Multiple key versions supported simultaneously
- Old keys retained for decryption during rotation
- Current version specified via `PII_KEY_VERSION`
- Per-record version tracking in `piiKeyVersion` field

### Searchability

- **HMAC-SHA256** for deterministic search tokens
- Separate key material derived from primary key
- Email and phone normalized before hashing
- Cannot reverse tokens to plaintext

## Privacy Service Integration

The privacy service automatically works with encrypted data:

### Export Guest Data

```typescript
// Privacy service queries by email search token
const reservations = await prisma.reservation.findMany({
  where: { guestEmailSearch: deriveEmailSearch(email) }
});
// Returns decrypted data for export
```

### Erase Guest Data

```typescript
// Updates with anonymized placeholders
await prisma.reservation.update({
  where: { id },
  data: {
    guestName: '[redacted]',
    guestEmail: null,
    guestPhone: null,
    // Extension automatically encrypts new values
  }
});
```

## Extension Order

Extensions are applied in specific order in `PrismaService`:

```typescript
constructor() {
  super();
  // 1. PII encryption (must be first)
  const withPii = this.$extends(piiExtension);
  
  // 2. Tenant scoping (operates on already-encrypted data)
  const withTenant = withPii.$extends(tenantScopeExtension);
  
  Object.assign(this, withTenant);
}
```

**Why this order?**
- PII extension encrypts/decrypts at query level
- Tenant extension filters results based on tenant context
- Encryption happens before tenant filtering

## Performance Considerations

### Write Performance

- Encryption adds ~1-2ms per operation
- HMAC derivation for searchable fields: ~0.5ms
- Negligible impact on batch operations

### Read Performance

- Decryption adds ~1-2ms per record
- No performance impact on queries (search tokens unchanged)
- Nested relations decrypted recursively

### Optimization Tips

1. **Batch operations** - Use `createMany` for bulk inserts
2. **Select only needed fields** - Reduces decryption overhead
3. **Index search fields** - `guestEmailSearch`, `guestPhoneSearch` are indexed
4. **Cache decrypted results** - If data doesn't change frequently

## Testing

### Unit Tests

Verify encryption/decryption:

```typescript
import { encryptPii, decryptPii } from './pii-crypto';

const plaintext = 'john@example.com';
const { ciphertext, keyVersion } = encryptPii(plaintext);
const decrypted = decryptPii(ciphertext, keyVersion);

expect(decrypted).toBe(plaintext);
expect(ciphertext).not.toContain(plaintext);
```

### Integration Tests

Test Prisma operations:

```typescript
const reservation = await prisma.reservation.create({
  data: { guestEmail: 'test@example.com', /* ... */ }
});

// Email should be decrypted in response
expect(reservation.guestEmail).toBe('test@example.com');

// But encrypted in database
const raw = await prisma.$queryRaw`
  SELECT "guestEmail" FROM "Reservation" WHERE id = ${reservation.id}
`;
expect(raw[0].guestEmail).not.toBe('test@example.com');
```

### Manual Verification

```bash
# Start the API
pnpm dev:api

# Create a reservation
curl -X POST http://localhost:3003/v1/reservations \
  -H "Content-Type: application/json" \
  -d '{"guestEmail": "test@example.com", ...}'

# Query database directly
docker exec -it postgres psql -U postgres -d reserve_dev \
  -c "SELECT \"guestEmail\", \"piiKeyVersion\" FROM \"Reservation\" LIMIT 1;"

# Should show base64-encoded ciphertext, not plaintext
```

## Troubleshooting

### "Failed to decrypt PII payload"

**Cause:** Key version mismatch or corrupted ciphertext

**Solution:**
1. Verify `PII_SECRET` and `PII_KEY_VERSION` are set correctly
2. Check `piiKeyVersion` field in database matches available keys
3. Run rotation script to update old records

### "PII_SECRET is required"

**Cause:** Missing encryption key in environment

**Solution:**
```bash
export PII_SECRET=$(openssl rand -base64 32)
export PII_KEY_VERSION=v1
```

### Search not finding records

**Cause:** Searchable tokens not updated after manual database changes

**Solution:**
```bash
# Re-run rotation to regenerate search tokens
pnpm rotate:pii --model=Reservation
```

### Slow queries

**Cause:** Decrypting many records or missing indexes

**Solution:**
1. Add indexes on search fields (already present in schema)
2. Use `select` to retrieve only needed fields
3. Consider caching frequently accessed data

## Migration from Existing System

If you have an existing PII encryption system:

1. **Deploy new code** with both old and new extensions
2. **Gradual migration** - New writes use new extension
3. **Run rotation** - Convert old records to new format
4. **Remove old extension** after all records migrated
5. **Verify** using privacy export/erase endpoints

## Best Practices

1. **Never log plaintext PII** - Use redaction in logs
2. **Rotate keys regularly** - Annually or after incidents
3. **Monitor rotation** - Track progress and errors
4. **Test in staging** - Verify key rotation before production
5. **Backup keys securely** - Store in secrets manager
6. **Audit access** - Log PII export/erase operations
7. **Limit key access** - Only production systems need keys

## Compliance

This implementation supports:

- ✅ **GDPR** - Right to export and right to erasure
- ✅ **CCPA** - Consumer data access and deletion
- ✅ **Encryption at rest** - AES-256-GCM for all PII
- ✅ **Key rotation** - Version-based key management
- ✅ **Audit trail** - All export/erase logged via AuditLogService

## Future Enhancements

1. **Field-level permissions** - Role-based PII access
2. **Automatic key rotation** - Scheduled rotation jobs
3. **Hardware security modules** - AWS KMS, Azure Key Vault
4. **Differential privacy** - Add noise to aggregated queries
5. **Encrypted search** - Homomorphic encryption for advanced queries

## Support

For questions or issues:
- Check logs in `api-debug.err`
- Review audit logs for PII operations
- Run rotation script with `--dry-run` to diagnose
- Contact platform team for key management assistance
