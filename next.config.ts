import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /*
   * The end-to-end suites drive the dev server over 127.0.0.1 while it reports
   * its own origin as localhost. Next treats that as a cross-origin request for
   * /_next/* assets and warns that a future version will reject it; in the
   * meantime it makes Fast Refresh fall back to full reloads, which is what put
   * a 2,200-module rebuild in the middle of a form redirect and produced the
   * "Unexpected end of JSON input" failures the suites had to retry through.
   *
   * Development only — it has no effect on a production build.
   */
  allowedDevOrigins: ['127.0.0.1'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default config
