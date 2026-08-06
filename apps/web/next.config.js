/** @type {import('next').NextConfig} */
const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

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
