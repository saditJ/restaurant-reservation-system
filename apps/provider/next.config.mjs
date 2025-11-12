const isProd = process.env.NODE_ENV === 'production';

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: buildSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;

function buildSecurityHeaders() {
  const frameAncestors = ["'self'"];
  const connectSrc = ["'self'"];
  if (!isProd) {
    connectSrc.push('ws:', 'http://localhost:*', 'https://localhost:*');
  }
  const scriptSrc = ["'self'", "'unsafe-inline'"];
  if (!isProd) {
    scriptSrc.push("'unsafe-eval'");
  }

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors.join(' ')}`,
    "object-src 'none'",
    "img-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(' ')}`,
    `script-src ${scriptSrc.join(' ')}`,
  ];

  const headers = [
    { key: 'Content-Security-Policy', value: directives.join('; ') },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'X-DNS-Prefetch-Control', value: 'off' },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  ];

  if (isProd) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    });
  }

  return headers;
}
