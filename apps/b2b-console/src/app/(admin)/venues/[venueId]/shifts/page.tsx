import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { serverDelete, serverGet, serverPatch, serverPost } from '@/lib/serverApi';
import { isApiError } from '@/lib/api';
import type { ShiftListResponse } from '@/lib/types';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

async function fetchShifts(venueId: string) {
  try {
    return await serverGet<ShiftListResponse>(
      `/admin/shifts?venueId=${encodeURIComponent(venueId)}`,
    );
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      return { items: [] };
    }
    throw error;
  }
}

type ShiftsPageProps = {
  params: { venueId: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function VenueShiftsPage({ params, searchParams }: ShiftsPageProps) {
  const { venueId } = params;
  const basePath = `/venues/${venueId}/shifts`;
  const { items: shifts } = await fetchShifts(venueId);

  const status = Array.isArray(searchParams?.status)
    ? searchParams?.status[0]
    : searchParams?.status;

  async function createShift(formData: FormData) {
    'use server';
    const payload = {
      venueId,
      dow: Number(formData.get('dow') ?? 0),
      startsAt: String(formData.get('startsAt') ?? '00:00'),
      endsAt: String(formData.get('endsAt') ?? '00:00'),
      capacitySeats: Number(formData.get('capacitySeats') ?? 0),
      capacityCovers: Number(formData.get('capacityCovers') ?? 0),
      isActive: formData.get('isActive') === 'on',
    };
    await serverPost('/admin/shifts', payload);
    revalidatePath(basePath);
    redirect(`${basePath}?status=created`);
  }

  async function updateShift(formData: FormData) {
    'use server';
    const id = String(formData.get('id') ?? '');
    if (!id) return;
    const payload = {
      dow: Number(formData.get('dow') ?? 0),
      startsAt: String(formData.get('startsAt') ?? '00:00'),
      endsAt: String(formData.get('endsAt') ?? '00:00'),
      capacitySeats: Number(formData.get('capacitySeats') ?? 0),
      capacityCovers: Number(formData.get('capacityCovers') ?? 0),
      isActive: formData.get('isActive') === 'on',
    };
    await serverPatch(`/admin/shifts/${encodeURIComponent(id)}`, payload);
    revalidatePath(basePath);
    redirect(`${basePath}?status=updated`);
  }

  async function deleteShift(formData: FormData) {
    'use server';
    const id = String(formData.get('id') ?? '');
    if (!id) return;
    await serverDelete(`/admin/shifts/${encodeURIComponent(id)}`);
    revalidatePath(basePath);
    redirect(`${basePath}?status=deleted`);
  }

  const statusMessage =
    status === 'created'
      ? 'Shift created.'
      : status === 'updated'
        ? 'Shift updated.'
        : status === 'deleted'
          ? 'Shift deleted.'
          : null;

  const createFormId = 'create-shift';

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-gray-900">Service shifts</h1>
        <p className="text-sm text-gray-600">
          Manage per-day service windows and capacity limits for availability generation.
        </p>
      </header>

      {statusMessage && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {statusMessage}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Day</th>
              <th className="px-4 py-3">Starts</th>
              <th className="px-4 py-3">Ends</th>
              <th className="px-4 py-3">Seats</th>
              <th className="px-4 py-3">Covers</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-800">
            <tr className="bg-gray-50/60">
              <td className="px-4 py-3">
                <select
                  name="dow"
                  form={createFormId}
                  defaultValue="5"
                  className="w-full rounded-lg border border-gray-300 px-2 py-1"
                >
                  {DAYS.map((label, value) => (
                    <option key={label} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-4 py-3">
                <input
                  type="time"
                  name="startsAt"
                  form={createFormId}
                  defaultValue="18:00"
                  className="w-full rounded-lg border border-gray-300 px-2 py-1"
                />
              </td>
              <td className="px-4 py-3">
                <input
                  type="time"
                  name="endsAt"
                  form={createFormId}
                  defaultValue="23:00"
                  className="w-full rounded-lg border border-gray-300 px-2 py-1"
                />
              </td>
              <td className="px-4 py-3">
                <input
                  type="number"
                  name="capacitySeats"
                  form={createFormId}
                  min={1}
                  defaultValue={40}
                  className="w-full rounded-lg border border-gray-300 px-2 py-1"
                />
              </td>
              <td className="px-4 py-3">
                <input
                  type="number"
                  name="capacityCovers"
                  form={createFormId}
                  min={1}
                  defaultValue={50}
                  className="w-full rounded-lg border border-gray-300 px-2 py-1"
                />
              </td>
              <td className="px-4 py-3">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="isActive"
                    form={createFormId}
                    defaultChecked
                    className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black/30"
                  />
                  <span className="text-xs text-gray-500">Active</span>
                </label>
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  type="submit"
                  form={createFormId}
                  className="inline-flex items-center rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-black/90"
                >
                  Add shift
                </button>
              </td>
            </tr>

            {shifts.map((shift) => {
              const formId = `shift-${shift.id}`;
              const deleteFormId = `${formId}-delete`;
              return (
                <tr key={shift.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <select
                      name="dow"
                      form={formId}
                      defaultValue={String(shift.dow)}
                      className="w-full rounded-lg border border-gray-300 px-2 py-1"
                    >
                      {DAYS.map((label, value) => (
                        <option key={label} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="time"
                      name="startsAt"
                      form={formId}
                      defaultValue={shift.startsAt}
                      className="w-full rounded-lg border border-gray-300 px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="time"
                      name="endsAt"
                      form={formId}
                      defaultValue={shift.endsAt}
                      className="w-full rounded-lg border border-gray-300 px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      name="capacitySeats"
                      form={formId}
                      min={1}
                      defaultValue={shift.capacitySeats}
                      className="w-full rounded-lg border border-gray-300 px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      name="capacityCovers"
                      form={formId}
                      min={1}
                      defaultValue={shift.capacityCovers}
                      className="w-full rounded-lg border border-gray-300 px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="isActive"
                        form={formId}
                        defaultChecked={shift.isActive}
                        className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black/30"
                      />
                      <span className="text-xs text-gray-500">
                        {shift.isActive ? 'Enabled' : 'Disabled'}
                      </span>
                    </label>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="submit"
                        form={formId}
                        className="inline-flex items-center rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                      >
                        Save
                      </button>
                      <button
                        type="submit"
                        form={deleteFormId}
                        className="inline-flex items-center rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="hidden">
        <form id={createFormId} action={createShift}>
          <input type="hidden" name="venueId" value={venueId} />
        </form>
        {shifts.map((shift) => (
          <form key={`update-${shift.id}`} id={`shift-${shift.id}`} action={updateShift}>
            <input type="hidden" name="id" value={shift.id} />
          </form>
        ))}
        {shifts.map((shift) => (
          <form key={`delete-${shift.id}`} id={`shift-${shift.id}-delete`} action={deleteShift}>
            <input type="hidden" name="id" value={shift.id} />
          </form>
        ))}
      </div>
    </div>
  );
}
