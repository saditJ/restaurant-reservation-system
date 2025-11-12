import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Provider Console',
  description: 'Usage insights and administration for partners.',
};

const navigation = [
  { href: '/', label: 'Dashboard' },
  { href: '/onboarding', label: 'Onboarding' },
  { href: '/tenants', label: 'Tenants' },
  { href: '/api-keys', label: 'API Keys' },
  { href: '/webhooks', label: 'Webhooks' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100">
        <div className="flex min-h-screen">
          <aside className="w-64 bg-slate-900 text-slate-100">
            <div className="px-6 py-6">
              <span className="text-lg font-semibold">Provider Console</span>
            </div>
            <nav className="mt-4 flex flex-col gap-1 px-4">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-2 text-sm font-medium text-slate-100/80 hover:bg-slate-800 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="flex-1 overflow-y-auto bg-white shadow-inner">
            <div className="mx-auto w-full max-w-6xl px-8 py-10">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
