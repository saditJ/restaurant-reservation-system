'use client';

import { useFormState, useFormStatus } from 'react-dom';
import type { ReservationWebhookEvent } from '../../src/lib/types';

type FormState = {
  ok: boolean;
  error?: string;
  secret?: string | null;
  endpointId?: string;
};

const initialState: FormState = { ok: false };

type EventOption = {
  value: ReservationWebhookEvent;
  label: string;
  description: string;
};

export function CreateEndpointForm({
  action,
  eventOptions,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  eventOptions: EventOption[];
}) {
  const [state, formAction] = useFormState(action, initialState);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <form action={formAction} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Endpoint URL
          </label>
          <input
            type="url"
            name="url"
            required
            placeholder="https://example.com/webhooks"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Description
          </label>
          <input
            type="text"
            name="description"
            placeholder="Integration notes (optional)"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">
            Events
          </legend>
          <p className="text-xs text-slate-500">
            Select the webhook events this endpoint should receive.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {eventOptions.map((event) => (
              <label
                key={event.value}
                className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-sm"
              >
                <input
                  type="checkbox"
                  name="events"
                  value={event.value}
                  defaultChecked
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900/40"
                />
                <span>
                  <span className="font-medium text-slate-900">
                    {event.label}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {event.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {state.error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {state.error}
          </div>
        ) : null}

        {state.ok && state.secret ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Secret generated</p>
            <p className="mt-1 text-xs">
              Copy this value now; it will not be shown again.
            </p>
            <code className="mt-2 block rounded bg-amber-900/90 px-3 py-2 font-mono text-amber-50">
              {state.secret}
            </code>
          </div>
        ) : null}

        <div className="flex justify-end">
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
    >
      {pending ? 'Creating…' : 'Create endpoint'}
    </button>
  );
}
