import type { NextRequest } from 'next/server';

export function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /_next/',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
