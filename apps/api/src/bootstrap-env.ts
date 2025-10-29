import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

function parseEnvValue(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const quoteMatch = trimmed.match(/^(['"])(.*)\1$/);
  if (quoteMatch) {
    return quoteMatch[2];
  }
  return trimmed;
}

function parseEnvFile(filepath: string): Record<string, string> {
  const content = readFileSync(filepath, 'utf-8');
  const entries: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1);
    if (!key) continue;

    entries[key] = parseEnvValue(rawValue);
  }

  return entries;
}

function assignEnv(entries: Record<string, string>) {
  for (const [key, value] of Object.entries(entries)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function findEnvFiles(): string[] {
  const candidates = new Set<string>();
  const explicit = process.env.DOTENV_PATH;
  if (explicit) {
    candidates.add(resolve(explicit));
  }

  let currentDir = __dirname;
  // Walk up to project root in case the app is started from different cwd.
  for (let depth = 0; depth < 5; depth += 1) {
    const envPath = join(currentDir, '.env');
    candidates.add(envPath);
    currentDir = dirname(currentDir);
  }

  // Also consider the process working directory.
  candidates.add(join(process.cwd(), '.env'));

  return Array.from(candidates);
}

export function bootstrapEnv() {
  for (const envFile of findEnvFiles()) {
    if (!existsSync(envFile)) continue;
    try {
      assignEnv(parseEnvFile(envFile));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(`Failed to load environment file ${envFile}`, error);
    }
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required. Set it in your environment before starting the API service.',
    );
  }

  if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new Error(
      `DATABASE_URL must point to Postgres (received "${databaseUrl}").`,
    );
  }

  const piiSecret = (process.env.PII_SECRET ?? '').trim();
  if (!piiSecret) {
    const nodeEnv = (process.env.NODE_ENV ?? '').toLowerCase();
    if (nodeEnv === 'production') {
      throw new Error('PII_SECRET is required for encrypting guest data.');
    }
    // eslint-disable-next-line no-console
    console.warn(
      'PII_SECRET is not set; using an insecure built-in development secret.',
    );
    process.env.PII_SECRET = 'dev-only-insecure-pii-secret-key';
  }

  if ((process.env.PII_KEY_VERSION ?? '').trim().length === 0) {
    process.env.PII_KEY_VERSION = 'v1';
  }
}

bootstrapEnv();
