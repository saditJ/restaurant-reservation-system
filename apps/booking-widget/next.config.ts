import type { NextConfig } from "next";

type Header = {
  key: string;
  value: string;
};

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: buildSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;

function buildSecurityHeaders(): Header[] {
  const isProd = process.env.NODE_ENV === "production";
  const frameAncestors = buildFrameAncestors(isProd);
  const connectSrc = ["'self'"];
  if (!isProd) {
    connectSrc.push("ws:", "http://localhost:*", "https://localhost:*");
  }

  const scriptSrc = ["'self'", "'unsafe-inline'"];
  if (!isProd) {
    scriptSrc.push("'unsafe-eval'");
  }

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors.join(" ")}`,
    "object-src 'none'",
    "img-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    `script-src ${scriptSrc.join(" ")}`,
  ];

  const headers: Header[] = [
    {
      key: "Content-Security-Policy",
      value: directives.join("; "),
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
    {
      key: "X-DNS-Prefetch-Control",
      value: "off",
    },
    {
      key: "X-Frame-Options",
      value: buildFrameOptionsHeader(frameAncestors, isProd),
    },
  ];

  if (isProd) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return headers;
}

function buildFrameAncestors(isProd: boolean) {
  const configured = [
    process.env.BOOKING_WIDGET_FRAME_ANCESTORS,
    process.env.MARKET_ORIGIN,
    process.env.NEXT_PUBLIC_MARKET_ORIGIN,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .flatMap((value) => value.split(","));

  const normalized = configured
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (!isProd) {
    normalized.push("http://localhost:3000");
  }

  return Array.from(new Set(["'self'", ...normalized]));
}

function buildFrameOptionsHeader(frameAncestors: string[], isProd: boolean) {
  if (!isProd) {
    return "ALLOWALL";
  }
  const external = frameAncestors.filter((value) => value !== "'self'");
  if (external.length === 1) {
    return `ALLOW-FROM ${external[0]}`;
  }
  return "SAMEORIGIN";
}
