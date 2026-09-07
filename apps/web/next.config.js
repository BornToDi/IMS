/** @type {import('next').NextConfig} */
// Browser requests stay on the website origin; proxy to the private API, not
// NEXT_PUBLIC_API_URL (which may be this website itself or an old HTTP URL).
const apiUrl = process.env.API_URL || 'http://127.0.0.1:5000';

const nextConfig = {
  reactStrictMode: true,
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
