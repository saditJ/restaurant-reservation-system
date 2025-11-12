import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  serverDelete,
  serverGet,
  serverPatch,
  serverPost,
} from '@/lib/serverApi';
import { isApiError } from '@/lib/api';
import type { MenuSection, MenuItem } from '@/lib/types';

type PageProps = {
  params: { venueId: string };
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function fetchSections(venueId: string): Promise<MenuSection[]> {
  try {
    const response = await serverGet<{ sections: MenuSection[] }>(
      `/admin/menus/${encodeURIComponent(venueId)}/sections`,
    );
    return response.sections ?? [];
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      return [];
    }
    throw error;
  }
}

function parseStringParam(value?: string | string[]): string | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value[value.length - 1];
  return value;
}

function formatTags(tags: string[]): string {
  return tags.join(', ');
}

function parseTags(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function parsePrice(value: FormDataEntryValue | null): number {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw < 0) {
    return 0;
  }
  return Math.floor(raw);
}

export default async function VenueMenuPage({ params, searchParams }: PageProps) {
  const { venueId } = params;
  const resolvedSearch = (await searchParams) ?? {};
  const statusParam = parseStringParam(resolvedSearch.status);
  const errorParam = parseStringParam(resolvedSearch.error);
  const basePath = `/venues/${venueId}/menu`;

  const sections = await fetchSections(venueId);

  async function createSection(formData: FormData) {
    'use server';
    const payload = {
      title: String(formData.get('title') ?? '').trim(),
      description: String(formData.get('description') ?? '').trim() || undefined,
      position: Number(formData.get('position') ?? 0) || 0,
    };
    await serverPost(`/admin/menus/${encodeURIComponent(venueId)}/sections`, payload);
    revalidatePath(basePath);
    redirect(`${basePath}?status=section-created`);
  }

  async function updateSection(formData: FormData) {
    'use server';
    const sectionId = String(formData.get('sectionId') ?? '');
    if (!sectionId) return;
    const payload = {
      title: String(formData.get('title') ?? '').trim() || undefined,
      description: String(formData.get('description') ?? '').trim() || undefined,
      position: Number(formData.get('position') ?? 0),
    };
    await serverPatch(
      `/admin/menus/${encodeURIComponent(venueId)}/sections/${encodeURIComponent(sectionId)}`,
      payload,
    );
    revalidatePath(basePath);
    redirect(`${basePath}?status=section-updated`);
  }

  async function deleteSection(formData: FormData) {
    'use server';
    const sectionId = String(formData.get('sectionId') ?? '');
    if (!sectionId) return;
    await serverDelete(
      `/admin/menus/${encodeURIComponent(venueId)}/sections/${encodeURIComponent(sectionId)}`,
    );
    revalidatePath(basePath);
    redirect(`${basePath}?status=section-deleted`);
  }

  async function createItem(formData: FormData) {
    'use server';
    const sectionId = String(formData.get('sectionId') ?? '');
    if (!sectionId) return;
    const payload = {
      name: String(formData.get('name') ?? '').trim(),
      short: String(formData.get('short') ?? '').trim() || undefined,
      price: parsePrice(formData.get('price')),
      currency: (formData.get('currency') ?? 'ALL') as 'ALL' | 'EUR',
      isAvailable: formData.get('isAvailable') === 'on',
      imageUrl: String(formData.get('imageUrl') ?? '').trim() || undefined,
      tags: parseTags(String(formData.get('tags') ?? '')),
      position: Number(formData.get('position') ?? 0) || 0,
    };
    await serverPost(
      `/admin/menus/${encodeURIComponent(venueId)}/sections/${encodeURIComponent(sectionId)}/items`,
      payload,
    );
    revalidatePath(basePath);
    redirect(`${basePath}?status=item-created`);
  }

  async function updateItem(formData: FormData) {
    'use server';
    const sectionId = String(formData.get('sectionId') ?? '');
    const itemId = String(formData.get('itemId') ?? '');
    if (!sectionId || !itemId) return;
    const payload = {
      name: String(formData.get('name') ?? '').trim() || undefined,
      short: String(formData.get('short') ?? '').trim() || undefined,
      price: parsePrice(formData.get('price')),
      currency: (formData.get('currency') ?? 'ALL') as 'ALL' | 'EUR',
      isAvailable: formData.get('isAvailable') === 'on',
      imageUrl: String(formData.get('imageUrl') ?? '').trim() || undefined,
      tags: parseTags(String(formData.get('tags') ?? '')),
      position: Number(formData.get('position') ?? 0),
    };
    await serverPatch(
      `/admin/menus/${encodeURIComponent(venueId)}/sections/${encodeURIComponent(sectionId)}/items/${encodeURIComponent(itemId)}`,
      payload,
    );
    revalidatePath(basePath);
    redirect(`${basePath}?status=item-updated`);
  }

  async function deleteItem(formData: FormData) {
    'use server';
    const sectionId = String(formData.get('sectionId') ?? '');
    const itemId = String(formData.get('itemId') ?? '');
    if (!sectionId || !itemId) return;
    await serverDelete(
      `/admin/menus/${encodeURIComponent(venueId)}/sections/${encodeURIComponent(sectionId)}/items/${encodeURIComponent(itemId)}`,
    );
    revalidatePath(basePath);
    redirect(`${basePath}?status=item-deleted`);
  }

  const statusMessage =
    statusParam === 'section-created'
      ? 'Section created successfully.'
      : statusParam === 'section-updated'
        ? 'Section updated.'
        : statusParam === 'section-deleted'
          ? 'Section deleted.'
          : statusParam === 'item-created'
            ? 'Menu item created.'
            : statusParam === 'item-updated'
              ? 'Menu item updated.'
              : statusParam === 'item-deleted'
                ? 'Menu item deleted.'
                : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-gray-900">Menu management</h1>
        <p className="text-sm text-gray-600">
          Create sections, manage availability, and keep pricing up to date for the public menu.
        </p>
      </header>

      {statusMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {statusMessage}
        </div>
      )}

      {errorParam && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {errorParam}
        </div>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Add a section</h2>
        <p className="text-sm text-gray-600">
          Sections are displayed in ascending order by position. Use them to group similar dishes.
        </p>
        <form action={createSection} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm text-gray-700">
            <span>Title</span>
            <input
              name="title"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder="e.g., Starters"
            />
          </label>
          <label className="space-y-1 text-sm text-gray-700">
            <span>Position</span>
            <input
              type="number"
              name="position"
              min={0}
              defaultValue={sections.length}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="md:col-span-2 space-y-1 text-sm text-gray-700">
            <span>Description</span>
            <textarea
              name="description"
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder="Optional helper text shown internally"
            />
          </label>
          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Create section
            </button>
          </div>
        </form>
      </section>

      {sections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-gray-600 shadow-sm">
          No sections yet. Create one to start building your menu.
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((section) => {
            const updateFormId = `update-section-${section.id}`;
            const deleteFormId = `delete-section-${section.id}`;
            return (
              <section
                key={section.id}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <form id={updateFormId} action={updateSection} className="grid gap-3 md:grid-cols-3">
                  <input type="hidden" name="sectionId" value={section.id} />
                  <label className="space-y-1 text-sm text-gray-700">
                    <span>Title</span>
                    <input
                      name="title"
                      defaultValue={section.title}
                      required
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    />
                  </label>
                  <label className="space-y-1 text-sm text-gray-700">
                    <span>Position</span>
                    <input
                      type="number"
                      name="position"
                      min={0}
                      defaultValue={section.position}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    />
                  </label>
                  <label className="space-y-1 text-sm text-gray-700 md:col-span-3">
                    <span>Description</span>
                    <textarea
                      name="description"
                      rows={2}
                      defaultValue={section.description ?? ''}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    />
                  </label>
                </form>
                <form id={deleteFormId} action={deleteSection}>
                  <input type="hidden" name="sectionId" value={section.id} />
                </form>
                <div className="mt-3 flex gap-3 border-b border-gray-100 pb-4">
                  <button
                    type="submit"
                    form={updateFormId}
                    className="inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                  >
                    Save section
                  </button>
                  <button
                    type="submit"
                    form={deleteFormId}
                    className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-4 space-y-4">
                  <h3 className="text-base font-semibold text-gray-900">Items</h3>
                  {section.items.length === 0 ? (
                    <p className="text-sm text-gray-500">No items in this section yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {section.items.map((item) => {
                        const updateItemFormId = `update-item-${item.id}`;
                        const deleteItemFormId = `delete-item-${item.id}`;
                        return (
                          <div
                            key={item.id}
                            className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 text-sm text-gray-800"
                          >
                            <form id={updateItemFormId} action={updateItem}>
                              <input type="hidden" name="sectionId" value={section.id} />
                              <input type="hidden" name="itemId" value={item.id} />
                              <div className="grid gap-3 md:grid-cols-5">
                                <label className="space-y-1">
                                  <span>Name</span>
                                  <input
                                    name="name"
                                    defaultValue={item.name}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                                  />
                                </label>
                                <label className="space-y-1 md:col-span-2">
                                  <span>Short description</span>
                                  <input
                                    name="short"
                                    defaultValue={item.short ?? ''}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                                  />
                                </label>
                                <label className="space-y-1">
                                  <span>Price (integer)</span>
                                  <input
                                    type="number"
                                    name="price"
                                    min={0}
                                    defaultValue={item.price}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                                  />
                                </label>
                                <label className="space-y-1">
                                  <span>Currency</span>
                                  <select
                                    name="currency"
                                    defaultValue={item.currency}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                                  >
                                    <option value="ALL">ALL</option>
                                    <option value="EUR">EUR</option>
                                  </select>
                                </label>
                                <label className="space-y-1 md:col-span-2">
                                  <span>Image URL</span>
                                  <input
                                    name="imageUrl"
                                    defaultValue={item.imageUrl ?? ''}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                                  />
                                </label>
                                <label className="space-y-1 md:col-span-2">
                                  <span>Tags (comma separated)</span>
                                  <input
                                    name="tags"
                                    defaultValue={formatTags(item.tags)}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                                  />
                                </label>
                                <label className="space-y-1">
                                  <span>Position</span>
                                  <input
                                    type="number"
                                    name="position"
                                    min={0}
                                    defaultValue={item.position}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                                  />
                                </label>
                                <label className="flex items-center gap-2 text-sm text-gray-700">
                                  <input
                                    type="checkbox"
                                    name="isAvailable"
                                    defaultChecked={item.isAvailable}
                                    className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                  />
                                  <span>Available</span>
                                </label>
                              </div>
                            </form>
                            <form id={deleteItemFormId} action={deleteItem}>
                              <input type="hidden" name="sectionId" value={section.id} />
                              <input type="hidden" name="itemId" value={item.id} />
                            </form>
                            <div className="mt-3 flex gap-3">
                              <button
                                type="submit"
                                form={updateItemFormId}
                                className="inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                              >
                                Save item
                              </button>
                              <button
                                type="submit"
                                form={deleteItemFormId}
                                className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm">
                  <h4 className="font-semibold text-gray-800">Add item</h4>
                  <form action={createItem} className="mt-3 grid gap-3 md:grid-cols-4">
                    <input type="hidden" name="sectionId" value={section.id} />
                    <label className="space-y-1">
                      <span>Name</span>
                      <input
                        name="name"
                        required
                        className="w-full rounded-lg border border-gray-300 px-3 py-2"
                        placeholder="e.g., Burrata"
                      />
                    </label>
                    <label className="space-y-1 md:col-span-2">
                      <span>Short description</span>
                      <input
                        name="short"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2"
                        placeholder="Optional"
                      />
                    </label>
                    <label className="space-y-1">
                      <span>Price (integer)</span>
                      <input
                        type="number"
                        name="price"
                        min={0}
                        required
                        className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      />
                    </label>
                    <label className="space-y-1">
                      <span>Currency</span>
                      <select
                        name="currency"
                        defaultValue="ALL"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      >
                        <option value="ALL">ALL</option>
                        <option value="EUR">EUR</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span>Position</span>
                      <input
                        type="number"
                        name="position"
                        min={0}
                        defaultValue={section.items.length}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      />
                    </label>
                    <label className="space-y-1 md:col-span-2">
                      <span>Image URL</span>
                      <input
                        name="imageUrl"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      />
                    </label>
                    <label className="space-y-1 md:col-span-2">
                      <span>Tags (comma separated)</span>
                      <input
                        name="tags"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        name="isAvailable"
                        defaultChecked
                        className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                      />
                      <span>Available</span>
                    </label>
                    <div className="md:col-span-4 flex justify-end">
                      <button
                        type="submit"
                        className="inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
                      >
                        Add item
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
