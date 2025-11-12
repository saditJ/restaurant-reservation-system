import Link from 'next/link';
import HealthBadge from './components/HealthBadge';

export default function Home() {
  return (
    <main className="min-h-screen px-6 py-8">
      <header className="flex items-center justify-between">
        <div className="text-xl font-semibold">Restaurant Console</div>
        <div className="flex items-center gap-4">
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="hover:underline">
              Dashboard
            </Link>
            <Link href="/reservations" className="hover:underline">
              Reservations
            </Link>
            <Link href="/floor" className="hover:underline">
              Floor
            </Link>
            <Link href="/notifications" className="hover:underline">
              Notifications
            </Link>
            <Link href="/settings" className="hover:underline">
              Settings
            </Link>
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link href="/audit" className="hover:underline">
              Audit
            </Link>
          </nav>
          <HealthBadge />
        </div>
      </header>

      <section className="mt-10 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-600">Today</div>
          <div className="text-2xl font-semibold">0 covers</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-600">Upcoming holds</div>
          <div className="text-2xl font-semibold">0</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-600">Reservations</div>
          <div className="text-2xl font-semibold">0</div>
        </div>
      </section>

      <p className="mt-6 text-sm text-gray-500">
        Placeholder dashboard - no data yet. We will wire it up later.
      </p>
    </main>
  );
}

