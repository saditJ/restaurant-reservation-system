'use client';

import { FormEvent, useState } from 'react';
import { useLocale } from '@/lib/i18n';

export default function WaitlistClient({ enabled }: { enabled: boolean }) {
  const { t } = useLocale();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  if (!enabled) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-10 text-center">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            {t('waitlist.heading')}
          </h1>
          <p className="text-sm text-gray-600">
            {t('waitlist.disabled')}
          </p>
        </header>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-10">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          {t('waitlist.heading')}
        </h1>
        <p className="text-sm text-gray-600">
          {t('waitlist.description')}
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4"
      >
        <div>
          <label
            htmlFor="waitlist-name"
            className="text-sm font-medium text-gray-700"
          >
            {t('waitlist.name')}
          </label>
          <input
            id="waitlist-name"
            className="mt-1 w-full rounded-lg border px-3 py-2"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setSubmitted(false);
            }}
            autoComplete="name"
            required
          />
        </div>
        <div>
          <label
            htmlFor="waitlist-phone"
            className="text-sm font-medium text-gray-700"
          >
            {t('waitlist.phone')}
          </label>
          <input
            id="waitlist-phone"
            className="mt-1 w-full rounded-lg border px-3 py-2"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setSubmitted(false);
            }}
            autoComplete="tel"
            inputMode="tel"
            required
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
        >
          {t('waitlist.submit')}
        </button>
        {submitted && (
          <p
            role="status"
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          >
            {t('waitlist.success')}
          </p>
        )}
      </form>
    </div>
  );
}
