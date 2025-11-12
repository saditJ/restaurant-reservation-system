import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { serverGet, serverPut } from '@/lib/serverApi';
import { isApiError } from '@/lib/api';
import type { VenueSettings } from '@/lib/types';

type SettingsResponse = VenueSettings;

async function fetchSettings(venueId: string) {
  try {
    return await serverGet<SettingsResponse>(`/venues/${encodeURIComponent(venueId)}/settings`);
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      notFound();
    }
    throw error;
  }
}

type SettingsPageProps = {
  params: { venueId: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function VenueSettingsPage({ params, searchParams }: SettingsPageProps) {
  const { venueId } = params;
  const settings = await fetchSettings(venueId);
  const saved = searchParams?.saved === '1';

  async function updateSettings(formData: FormData) {
    'use server';
    const payload = {
      name: String(formData.get('name') ?? '').trim(),
      city: String(formData.get('city') ?? '').trim() || null,
      timezone: String(formData.get('timezone') ?? '').trim(),
      turnTimeMin: Number(formData.get('turnTimeMin') ?? 0),
      defaultDurationMin: Number(formData.get('defaultDurationMin') ?? 0),
      holdTtlMin: Number(formData.get('holdTtlMin') ?? 0),
      phone: String(formData.get('phone') ?? '').trim() || null,
      website: String(formData.get('website') ?? '').trim() || null,
    };

    await serverPut(`/venues/${encodeURIComponent(venueId)}/settings`, payload);
    revalidatePath(`/venues/${venueId}/settings`);
    redirect(`/venues/${venueId}/settings?saved=1`);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-gray-900">Venue settings</h1>
        <p className="text-sm text-gray-600">
          Update core venue details and booking defaults for downstream systems.
        </p>
      </header>

      {saved && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          Settings saved successfully.
        </div>
      )}

      <form action={updateSettings} className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span className="font-medium text-gray-900">Name</span>
            <input
              type="text"
              name="name"
              required
              defaultValue={settings.name ?? ''}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span className="font-medium text-gray-900">City</span>
            <input
              type="text"
              name="city"
              defaultValue={settings.city ?? ''}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span className="font-medium text-gray-900">Timezone</span>
            <input
              type="text"
              name="timezone"
              required
              defaultValue={settings.timezone}
              placeholder="Europe/Tirane"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span className="font-medium text-gray-900">Phone</span>
            <input
              type="tel"
              name="phone"
              defaultValue={settings.phone ?? ''}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700 sm:col-span-2">
            <span className="font-medium text-gray-900">Website</span>
            <input
              type="url"
              name="website"
              defaultValue={settings.website ?? ''}
              placeholder="https://example.com"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
            />
          </label>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span className="font-medium text-gray-900">Turn time (minutes)</span>
            <input
              type="number"
              name="turnTimeMin"
              min={0}
              step={5}
              required
              defaultValue={settings.turnTimeMin}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span className="font-medium text-gray-900">Default duration (minutes)</span>
            <input
              type="number"
              name="defaultDurationMin"
              min={15}
              step={15}
              required
              defaultValue={settings.defaultDurationMin}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span className="font-medium text-gray-900">Hold TTL (minutes)</span>
            <input
              type="number"
              name="holdTtlMin"
              min={1}
              step={5}
              required
              defaultValue={settings.holdTtlMin}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
            />
          </label>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
          >
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}
