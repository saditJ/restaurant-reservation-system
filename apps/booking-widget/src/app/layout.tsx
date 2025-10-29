import './globals.css';
import type { Metadata } from 'next';
import { LocaleProvider } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Book a table',
  description: 'Simple booking widget (demo).',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
