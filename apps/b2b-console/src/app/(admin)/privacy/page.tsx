import type { Metadata } from 'next';
import { serverGet, serverPost } from '@/lib/serverApi';
import { isApiError } from '@/lib/api';
import type {
  PrivacyEraseResponse,
  PrivacyExportResponse,
} from '@/lib/types';
import {
  ActionForm,
  defaultFormState,
  type PrivacyFormState,
} from './ActionForm';

export const metadata: Metadata = {
  title: 'Privacy tools',
};

async function exportAction(
  _prevState: PrivacyFormState,
  formData: FormData,
): Promise<PrivacyFormState> {
  'use server';
  const email = normalizeEmail(formData.get('email'));
  if (!email) {
    return { status: 'error', message: 'Email is required.' };
  }
  try {
    const payload = await serverGet<PrivacyExportResponse>(
      `/privacy/guest/export?email=${encodeURIComponent(email)}`,
    );
    const count = payload.guest.reservations.length;
    return {
      status: 'success',
      message: `Export generated for ${payload.guest.email}.`,
      details: `${count} reservation${count === 1 ? '' : 's'} included.`,
    };
  } catch (error) {
    return { status: 'error', message: formatError(error) };
  }
}

async function eraseAction(
  _prevState: PrivacyFormState,
  formData: FormData,
): Promise<PrivacyFormState> {
  'use server';
  const email = normalizeEmail(formData.get('email'));
  if (!email) {
    return { status: 'error', message: 'Email is required.' };
  }
  try {
    const payload = await serverPost<PrivacyEraseResponse>(
      `/privacy/guest/erase`,
      { email },
    );
    return {
      status: 'success',
      message: `Erase request processed for ${payload.email}.`,
      details: `${payload.anonymized.length} anonymized / ${payload.skipped.length} skipped.`,
    };
  } catch (error) {
    return { status: 'error', message: formatError(error) };
  }
}

export default function PrivacyToolsPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">
          Compliance
        </p>
        <h1 className="text-2xl font-semibold text-gray-900">Privacy tools</h1>
        <p className="text-sm text-gray-600">
          Run GDPR export or erasure workflows without leaving the console.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <PrivacyCard
          title="Export guest data"
          description="Returns a JSON payload of every reservation tied to the guest email."
          confirmLabel="Request export"
          action={exportAction}
        />
        <PrivacyCard
          title="Erase guest data"
          description="Anonymizes historical reservations for the selected guest email."
          confirmLabel="Erase guest"
          action={eraseAction}
        />
      </section>
    </div>
  );
}

type CardProps = {
  title: string;
  description: string;
  confirmLabel: string;
  action: (
    state: PrivacyFormState,
    formData: FormData,
  ) => Promise<PrivacyFormState>;
};

function PrivacyCard({ title, description, confirmLabel, action }: CardProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
      <ActionForm
        action={action}
        confirmLabel={confirmLabel}
        initialState={defaultFormState}
      />
    </div>
  );
}

function normalizeEmail(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function formatError(error: unknown): string {
  if (isApiError(error)) {
    return error.message || 'Request failed.';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Request failed.';
}
