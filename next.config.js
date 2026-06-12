/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
    // Puppeteer + native binaries break webpack bundling. They're invoked only
    // from node scripts (via child_process.spawn), never imported from app code,
    // so exclude them from Next.js bundling.
    serverComponentsExternalPackages: ['puppeteer-real-browser', 'puppeteer-core'],
  },
  async headers() {
    // CSP kept compatible with Next.js App Router (which injects inline
    // hydration scripts) and the single inline theme script in layout.tsx —
    // both require 'unsafe-inline' on script-src; it still blocks loading
    // external script *files*. img-src allows https/data/blob for remote
    // photos, Telegram media, and html2canvas/jsPDF exports.
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' https: data: blob:",
      // accounts.google.com + gstatic: Google Identity Services (Sign in with Google)
      "script-src 'self' 'unsafe-inline' https://accounts.google.com https://www.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://accounts.google.com",
      "font-src 'self' data:",
      "connect-src 'self' https://accounts.google.com",
      "frame-src https://accounts.google.com",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
