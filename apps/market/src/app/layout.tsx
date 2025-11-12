import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';
import './globals.css';
import type { TenantThemeResponse } from '@/lib/api';
import { getTenantTheme } from '@/lib/api';

const siteOrigin =
  process.env.MARKET_ORIGIN ??
  process.env.NEXT_PUBLIC_MARKET_ORIGIN ??
  'http://localhost:3000';
const metadataBase = (() => {
  try {
    return new URL(siteOrigin);
  } catch {
    return new URL('http://localhost:3000');
  }
})();

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: 'Reserve Market',
    template: '%s - Reserve Market',
  },
  description:
    'Discover venues on Reserve Market and jump straight into booking with live availability.',
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const themeResponse = await getTenantTheme();
  const cssVars = buildCssVariables(themeResponse);
  const logoUrl = themeResponse?.theme?.logoUrl ?? null;

  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased" style={cssVars}>
        <div className="min-h-screen flex flex-col bg-background text-foreground">
          <SiteHeader logoUrl={logoUrl} />
          <div className="flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}

function SiteHeader({ logoUrl }: { logoUrl: string | null }) {
  return (
    <header
      className="flex items-center justify-between border-b border-black/5 px-6 py-4"
      style={{
        backgroundColor: 'var(--background)',
        color: 'var(--foreground)',
      }}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt="Tenant logo"
          className="h-8 w-auto object-contain"
        />
      ) : (
        <span className="text-base font-semibold tracking-tight">Reserve Market</span>
      )}
      <span className="text-xs font-semibold uppercase tracking-[0.35em] text-[color:rgba(15,23,42,0.45)]">
        Reserve
      </span>
    </header>
  );
}

function buildCssVariables(themeResponse: TenantThemeResponse | null): CSSProperties {
  const styles: Record<string, string> = {};
  const colors = themeResponse?.theme?.colors ?? {};
  assignCssVar(styles, '--background', colors.background);
  assignCssVar(styles, '--foreground', colors.foreground);
  assignCssVar(styles, '--accent', colors.primary);
  assignCssVar(styles, '--secondary', colors.secondary);
  if (!styles['--background']) {
    styles['--background'] = '#f7f8fb';
  }
  if (!styles['--foreground']) {
    styles['--foreground'] = '#111827';
  }
  if (!styles['--accent'] && styles['--foreground']) {
    styles['--accent'] = styles['--foreground'];
  }
  assignCssVar(styles, '--font-family', themeResponse?.theme?.font);
  return styles as CSSProperties;
}

function assignCssVar(
  styles: Record<string, string>,
  key: string,
  value: string | null | undefined,
) {
  if (value && value.trim().length > 0) {
    styles[key] = value.trim();
  }
}
