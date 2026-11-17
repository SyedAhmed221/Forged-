import type { NextConfig } from 'next';
const contentSecurityPolicy = `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' https://*.supabase.co https://*.r2.cloudflarestorage.com${process.env.NODE_ENV === 'development' ? ' ws://127.0.0.1:3000 ws://localhost:3000' : ''}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`;
const config: NextConfig = {
  transpilePackages: ['@tikquick/shared'],
  serverExternalPackages: ['pg'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
};
export default config;
