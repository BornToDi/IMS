/** @type {import('next').NextConfig} */
// Browser requests stay on the website origin; proxy to the private API, not
// NEXT_PUBLIC_API_URL (which may be this website itself or an old HTTP URL).
const apiUrl = process.env.API_URL || 'http://127.0.0.1:5000';

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  experimental: { proxyTimeout: 300000 },
  async headers() {
    return [
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] },
      { source: '/offline.html', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
    ]
  },
  async rewrites() {
    return apiUrl ? [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`
      },
      {
        source: '/uploads/:path*',
        destination: `${apiUrl}/uploads/:path*`
      },
      {
        source: '/socket.io/:path*',
        destination: `${apiUrl}/socket.io/:path*`
      }
    ] : []
  }
};

module.exports = nextConfig;
