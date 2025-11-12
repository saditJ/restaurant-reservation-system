'use client';

import { useEffect } from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
        Reserve Market
      </p>
      <h1 className="text-2xl font-semibold text-slate-900">
        Something went wrong
      </h1>
      <p className="max-w-xl text-sm text-slate-600">
        We ran into an unexpected issue loading this page. Try again, or head
        back to the marketplace to keep browsing.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          onClick={() => reset()}
          className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
        >
          Back to home
        </a>
      </div>
    </div>
  );
}
