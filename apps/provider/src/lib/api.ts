const API_BASE = (process.env.API_BASE_INTERNAL ?? 'http://localhost:3003').replace(/\/$/, '');
const ADMIN_KEY =
  process.env.PROVIDER_API_KEY ??
  process.env.ADMIN_API_KEY ??
  process.env.API_KEY ??
  process.env.NEXT_PUBLIC_API_KEY;

if (!ADMIN_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    'Provider app missing PROVIDER_API_KEY (or ADMIN_API_KEY/API_KEY). API requests will fail without an admin key.',
  );
}

function buildUrl(path: string) {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const normalised = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalised}`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), {
    ...init,
    method: 'GET',
    headers: {
      accept: 'application/json',
      ...(ADMIN_KEY ? { 'x-api-key': ADMIN_KEY } : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    const payload = await parseResponse<any>(response);
    throw new Error(
      `Request failed (${response.status}) ${
        typeof payload === 'object' ? JSON.stringify(payload) : String(payload)
      }`,
    );
  }
  return parseResponse<T>(response);
}

export async function apiPost<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  headers.set('accept', 'application/json');
  headers.set('content-type', 'application/json');
  if (ADMIN_KEY) {
    headers.set('x-api-key', ADMIN_KEY);
  }

  const response = await fetch(buildUrl(path), {
    ...init,
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = await parseResponse<any>(response);
    throw new Error(
      `Request failed (${response.status}) ${
        typeof payload === 'object' ? JSON.stringify(payload) : String(payload)
      }`,
    );
  }

  return parseResponse<T>(response);
}

export async function apiPatch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  headers.set('accept', 'application/json');
  headers.set('content-type', 'application/json');
  if (ADMIN_KEY) {
    headers.set('x-api-key', ADMIN_KEY);
  }

  const response = await fetch(buildUrl(path), {
    ...init,
    method: 'PATCH',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = await parseResponse<any>(response);
    throw new Error(
      `Request failed (${response.status}) ${
        typeof payload === 'object' ? JSON.stringify(payload) : String(payload)
      }`,
    );
  }

  return parseResponse<T>(response);
}
