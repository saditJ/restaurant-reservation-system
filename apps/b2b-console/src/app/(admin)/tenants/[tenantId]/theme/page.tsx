import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { isApiError } from '@/lib/api';
import { serverGet, serverPut } from '@/lib/serverApi';

type TenantThemeResponse = {
  tenantId: string;
  theme: {
    colors?: {
      primary?: string;
      secondary?: string;
      background?: string;
      foreground?: string;
    };
    logoUrl?: string | null;
    font?: string | null;
  } | null;
  domains: string[];
};

type TenantThemePageProps = {
  params: { tenantId: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

async function fetchTenantTheme(tenantId: string) {
  try {
    return await serverGet<TenantThemeResponse>(`/tenants/${encodeURIComponent(tenantId)}/theme`);
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      notFound();
    }
    throw error;
  }
}

export default async function TenantThemePage({ params, searchParams }: TenantThemePageProps) {
  const { tenantId } = params;
  const themeResponse = await fetchTenantTheme(tenantId);
  const theme = themeResponse.theme ?? {};
  const colors = theme.colors ?? {};
  const saved = searchParams?.saved === '1';

  async function saveTheme(formData: FormData) {
    'use server';
    const payload = buildThemePayload(formData);
    await serverPut(`/tenants/${encodeURIComponent(tenantId)}/theme`, payload);
    revalidatePath(`/tenants/${tenantId}/theme`);
    redirect(`/tenants/${tenantId}/theme?saved=1`);
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-gray-500">
          Tenant {tenantId}
        </p>
        <h1 className="text-2xl font-semibold text-gray-900">Brand theme</h1>
        <p className="text-sm text-gray-600">
          Control the colors, logo, and domains applied to the booking widget and marketing
          experiences for this tenant.
        </p>
      </header>

      {saved && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Theme saved successfully.
        </div>
      )}

      <form action={saveTheme} className="space-y-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Colors</h2>
            <p className="text-sm text-gray-600">
              Provide hex or CSS-supported color values. Leave blank to fall back to the default palette.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ColorField name="colorPrimary" label="Primary color" defaultValue={colors.primary} />
            <ColorField name="colorSecondary" label="Secondary color" defaultValue={colors.secondary} />
            <ColorField name="colorBackground" label="Background" defaultValue={colors.background} />
            <ColorField name="colorForeground" label="Foreground" defaultValue={colors.foreground} />
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Brand assets</h2>
            <p className="text-sm text-gray-600">
              Optional logo URL (PNG/SVG) and a custom font stack (e.g. &ldquo;Inter, sans-serif&rdquo;).
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-gray-700 sm:col-span-2">
              <span className="font-medium text-gray-900">Logo URL</span>
              <input
                type="url"
                name="logoUrl"
                defaultValue={theme.logoUrl ?? ''}
                placeholder="https://cdn.example.com/logo.svg"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-gray-700 sm:col-span-2">
              <span className="font-medium text-gray-900">Font stack</span>
              <input
                type="text"
                name="font"
                defaultValue={theme.font ?? ''}
                placeholder='e.g. "Inter", "Helvetica", sans-serif'
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
              />
            </label>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Custom domains</h2>
            <p className="text-sm text-gray-600">
              Add one hostname per line. Host headers that match here will automatically resolve the tenant.
            </p>
          </div>
          <label className="flex flex-col gap-2 text-sm text-gray-700">
            <span className="font-medium text-gray-900">Domains</span>
            <textarea
              name="domains"
              rows={Math.max(3, (themeResponse.domains?.length ?? 0) || 3)}
              defaultValue={themeResponse.domains?.join('\n') ?? ''}
              placeholder="demo.example.com&#10;demo.localhost"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
            />
            <span className="text-xs text-gray-500">Wildcards are not supported. Ports are stripped automatically.</span>
          </label>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
          >
            Save theme
          </button>
        </div>
      </form>
    </div>
  );
}

function buildThemePayload(formData: FormData) {
  const colors = {
    primary: readInput(formData, 'colorPrimary'),
    secondary: readInput(formData, 'colorSecondary'),
    background: readInput(formData, 'colorBackground'),
    foreground: readInput(formData, 'colorForeground'),
  };

  const theme = {
    colors,
    logoUrl: readInput(formData, 'logoUrl'),
    font: readInput(formData, 'font'),
  };

  const domainsRaw = readMultiline(formData, 'domains');

  return {
    theme,
    domains: domainsRaw,
  };
}

function readInput(formData: FormData, key: string) {
  const raw = formData.get(key);
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed || undefined;
}

function readMultiline(formData: FormData, key: string) {
  const raw = formData.get(key);
  if (typeof raw !== 'string') {
    return [];
  }
  return raw
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function ColorField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-gray-700">
      <span className="font-medium text-gray-900">{label}</span>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue ?? ''}
        placeholder="#111827"
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
      />
    </label>
  );
}
