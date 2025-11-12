'use client';

import { useFormState, useFormStatus } from 'react-dom';

export type PrivacyFormState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  details?: string;
};

export const defaultFormState: PrivacyFormState = { status: 'idle' };

type Props = {
  action: (
    state: PrivacyFormState,
    formData: FormData,
  ) => Promise<PrivacyFormState>;
  confirmLabel: string;
  initialState?: PrivacyFormState;
};

export function ActionForm({
  action,
  confirmLabel,
  initialState = defaultFormState,
}: Props) {
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form className="space-y-3" action={formAction}>
      <div className="flex flex-col gap-1 text-sm">
        <label className="font-medium text-gray-700">Guest email</label>
        <input
          type="email"
          name="email"
          required
          placeholder="guest@example.com"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-black focus:outline-none focus:ring-2 focus:ring-black/10"
        />
      </div>
      <StatusToast state={state} />
      <SubmitButton label={confirmLabel} />
    </form>
  );
}

function StatusToast({ state }: { state: PrivacyFormState }) {
  if (state.status === 'idle') return null;
  const isSuccess = state.status === 'success';
  const styles = isSuccess
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : 'border-rose-200 bg-rose-50 text-rose-800';
  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-lg border px-3 py-2 text-sm ${styles}`}
    >
      <p className="font-medium">
        {state.message ?? (isSuccess ? 'Request complete.' : 'Request failed.')}
      </p>
      {state.details ? (
        <p className="mt-1 text-xs opacity-90">{state.details}</p>
      ) : null}
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90 disabled:opacity-60"
    >
      {pending ? 'Working…' : label}
    </button>
  );
}
