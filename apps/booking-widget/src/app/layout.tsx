import './globals.css';
import type { CSSProperties, ReactNode } from 'react';
import type { Metadata } from 'next';
import { LocaleProvider } from '@/lib/i18n';
import { fetchResolvedTheme, type TenantThemeResponse } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'Book a table',
  description: 'Simple booking widget (demo).',
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const theme = await fetchResolvedTheme();
  const cssVars = buildCssVariables(theme);
  const logoUrl = theme?.theme?.logoUrl ?? null;

  return (
    <html lang="en-GB">
      <body
        className="bg-background text-foreground antialiased"
        style={cssVars}
      >
        <LocaleProvider>
          <div className="min-h-screen bg-background text-foreground">
            <WidgetHeader logoUrl={logoUrl} />
            {children}
          </div>
        </LocaleProvider>
      </body>
    </html>
  );
}

function WidgetHeader({ logoUrl }: { logoUrl: string | null }) {
  return (
    <header
      className="flex items-center justify-center border-b border-black/5 px-4 py-3"
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
        <span className="text-sm font-semibold uppercase tracking-[0.3em] text-[color:rgba(17,24,39,0.65)]">
          Reserve
        </span>
      )}
    </header>
  );
}

function buildCssVariables(
  theme: TenantThemeResponse | null,
): CSSProperties {
  const styles: Record<string, string> = {};
  const colors = theme?.theme?.colors ?? {};
  assignVar(styles, '--background', colors.background);
  assignVar(styles, '--foreground', colors.foreground);
  assignVar(styles, '--primary', colors.primary);
  assignVar(styles, '--secondary', colors.secondary);
  assignVar(styles, '--accent', colors.primary);
  assignVar(styles, '--theme-font', theme?.theme?.font);
  if (!styles['--background']) {
    styles['--background'] = '#ffffff';
  }
  if (!styles['--foreground']) {
    styles['--foreground'] = '#171717';
  }
  return styles as CSSProperties;
}

function assignVar(
  styles: Record<string, string>,
  key: string,
  value: string | null | undefined,
) {
  if (value && value.trim()) {
    styles[key] = value.trim();
  }
}
