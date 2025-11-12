import type { NextRequest } from 'next/server';

import { getVenueSlugs } from '@/lib/api';

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const slugs = await getVenueSlugs().catch(() => []);
  const urls = [
    {
      loc: `${origin}/`,
      changefreq: 'daily',
      priority: '1.0',
    },
    ...slugs.map((slug) => ({
      loc: `${origin}/venue/${slug}`,
      changefreq: 'daily',
      priority: '0.8',
    })),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (entry) => `
  <url>
    <loc>${entry.loc}</loc>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
    ),
    '</urlset>',
  ].join('\n');

  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
}
