'use client';

import Link from 'next/link';

export default function SignupPage() {
  return (
    <main className="min-h-screen flex flex-col items-center px-6 py-10">
      <div className="w-full max-w-xl">
        <Link href="/" className="text-sm text-gray-600 hover:underline">
          ← Back
        </Link>

        <h1 className="mt-4 text-2xl md:text-3xl font-bold">
          Create your restaurant account
        </h1>

        <p className="mt-2 text-gray-600">
          Fill the details below. (This is a demo form for now — no account is created yet.)
        </p>

        <form className="mt-6 space-y-4">
          <div>
            <label className="text-sm block">Restaurant name</label>
            <input
              className="mt-1 w-full border rounded-xl px-3 py-2"
              placeholder="Tribe Tirana"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm block">Your full name</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                placeholder="John Doe"
              />
            </div>
            <div>
              <label className="text-sm block">Email</label>
              <input
                type="email"
                className="mt-1 w-full border rounded-xl px-3 py-2"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm block">Phone</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                placeholder="+355 6x xxx xxxx"
              />
            </div>
            <div>
              <label className="text-sm block">City</label>
              <input
                className="mt-1 w-full border rounded-xl px-3 py-2"
                placeholder="Tirana"
              />
            </div>
          </div>

          <div>
            <label className="text-sm block">Website (optional)</label>
            <input
              className="mt-1 w-full border rounded-xl px-3 py-2"
              placeholder="https://example.al"
            />
          </div>

          <button
            type="button"
            className="mt-4 w-full rounded-xl px-4 py-3 bg-black text-white"
            onClick={() => alert('Demo only — next step will save this!')}
          >
            Create account
          </button>
        </form>

        <p className="mt-4 text-xs text-gray-500">
          By continuing you agree to our Terms & Privacy (placeholders).
        </p>
      </div>
    </main>
  );
}
