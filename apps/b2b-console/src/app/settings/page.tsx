import Link from 'next/link';

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <header className="flex items-center justify-between">
        <div className="text-xl font-semibold text-gray-900">Restaurant Console</div>
        <nav className="text-sm text-gray-600">
          <Link href="/" className="mr-4 hover:text-gray-900">
            Dashboard
          </Link>
          <Link href="/reservations" className="mr-4 hover:text-gray-900">
            Reservations
          </Link>
          <Link href="/floor" className="mr-4 hover:text-gray-900">
            Floor
          </Link>
          <Link href="/notifications" className="mr-4 hover:text-gray-900">
            Notifications
          </Link>
          <Link href="/settings" className="font-medium text-gray-900 hover:text-gray-900">
            Settings
          </Link>
        </nav>
      </header>

      <section className="mt-10 max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Settings</h1>
          <p className="mt-2 text-sm text-gray-600">
            Configure venue preferences, booking defaults, and integrations from this workspace.
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Venue</h2>
          <p className="mt-1 text-sm text-gray-600">
            Update business hours, booking defaults, and cancellation policies.
          </p>
          <Link
            href="/settings/venue"
            className="mt-4 inline-flex items-center rounded-lg border border-gray-900 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-900 hover:text-white"
          >
            Manage venue settings
          </Link>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Developers</h2>
          <p className="mt-1 text-sm text-gray-600">
            Manage webhook endpoints, inspect deliveries, and copy your signing secret for integrations.
          </p>
          <Link
            href="/settings/developer"
            className="mt-4 inline-flex items-center rounded-lg border border-gray-900 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-900 hover:text-white"
          >
            Open developer console
          </Link>
        </div>
      </section>
    </main>
  );
}
