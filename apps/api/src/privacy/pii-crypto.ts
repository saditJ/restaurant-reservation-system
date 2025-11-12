import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';

type KeyRecord = {
  version: string;
  key: Buffer;
};

const PRIMARY_KEY: KeyRecord = {
  version: normalizeKeyVersion(process.env.PII_KEY_VERSION),
  key: resolveSecret(process.env.PII_SECRET, 'PII_SECRET'),
};

const keyCache = new Map<string, Buffer>([
  [PRIMARY_KEY.version, PRIMARY_KEY.key],
]);
const searchKeyMaterial = createHmac('sha256', PRIMARY_KEY.key)
  .update('reserve-platform/privacy/search')
  .digest();
const BASE64_PATTERN = /^[A-Za-z0-9+/=]+$/;

export function getActivePiiKeyVersion(): string {
  return PRIMARY_KEY.version;
}

export function encryptPii(value: string): {
  ciphertext: string;
  keyVersion: string;
} {
  const plain = value.trim();
  if (!plain) {
    throw new Error('Cannot encrypt empty PII value');
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', PRIMARY_KEY.key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, encrypted]);
  return {
    ciphertext: payload.toString('base64'),
    keyVersion: PRIMARY_KEY.version,
  };
}

export function decryptPii(
  ciphertext: string | null | undefined,
  keyVersion?: string | null,
): string | null {
  if (!ciphertext) return null;
  if (!BASE64_PATTERN.test(ciphertext)) {
    return ciphertext;
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(ciphertext, 'base64');
  } catch {
    return ciphertext;
  }
  if (buffer.length <= 28) {
    return ciphertext;
  }
  const iv = buffer.subarray(0, 12);
  const authTag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);

  try {
    const key = lookupKeyForVersion(keyVersion);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error('Failed to decrypt PII payload');
  }
}

function lookupKeyForVersion(version: string | null | undefined): Buffer {
  const requested =
    version && version.trim() ? version.trim() : PRIMARY_KEY.version;
  const cached = keyCache.get(requested);
  if (cached) return cached;

  const envKey =
    process.env[`PII_SECRET_${requested}`] ??
    process.env[`PII_SECRET_V${requested}`];
  if (!envKey) {
    if (requested === PRIMARY_KEY.version) {
      return PRIMARY_KEY.key;
    }
    throw new Error(`No PII secret configured for version ${requested}`);
  }
  const decoded = resolveSecret(envKey, `PII_SECRET_${requested}`);
  keyCache.set(requested, decoded);
  return decoded;
}

export function deriveEmailSearch(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) return null;
  return createHmac('sha256', searchKeyMaterial)
    .update('email:')
    .update(normalized)
    .digest('hex');
}

export function derivePhoneSearch(value: string): {
  hash: string | null;
  last4: string | null;
} {
  const digits = value.replace(/\D+/g, '');
  if (!digits) {
    return { hash: null, last4: null };
  }
  const hash = createHmac('sha256', searchKeyMaterial)
    .update('phone:')
    .update(digits)
    .digest('hex');
  const last4 = digits.slice(-4);
  return { hash, last4 };
}

export function derivePhoneLast4(value: string): string | null {
  const digits = value.replace(/\D+/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function resolveSecret(raw: string | undefined, label: string): Buffer {
  if (!raw) {
    throw new Error(`${label} is required to boot the API`);
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(`${label} must not be empty`);
  }

  const candidates: Array<[Buffer, string]> = [];

  try {
    const base64 = Buffer.from(trimmed, 'base64');
    candidates.push([base64, 'base64']);
  } catch {
    // ignore
  }

  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    candidates.push([Buffer.from(trimmed, 'hex'), 'hex']);
  }

  candidates.push([Buffer.from(trimmed, 'utf8'), 'utf8']);

  for (const [candidate] of candidates) {
    if (candidate.length === 32) {
      return candidate;
    }
  }

  throw new Error(`${label} must resolve to exactly 32 bytes for AES-256-GCM`);
}

function normalizeKeyVersion(value: string | undefined): string {
  const normalized = value?.trim() ?? 'v1';
  if (!normalized) {
    throw new Error('PII_KEY_VERSION must not be empty');
  }
  return normalized;
}
