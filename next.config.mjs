import path from 'node:path';

/** @type {import('next').NextConfig} */
const config = {
 experimental: { cpus: 1 },
 serverExternalPackages: ['better-sqlite3'],
 webpack(webpackConfig) {
  webpackConfig.resolve.alias['@'] = path.resolve(process.cwd(), 'src');
  return webpackConfig;
 },
 async headers() { return [{ source: '/:path*', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }, { key: 'X-Frame-Options', value: 'DENY' }] }, { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] }]; }
};
export default config;
