import type { NextConfig } from 'next';

const WEBMCP_HEADERS = [
  { key: 'Origin-Agent-Cluster', value: '?1' },
  { key: 'Permissions-Policy', value: 'tools=(self)' },
];

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  async headers() {
    return [{ source: '/:path*', headers: WEBMCP_HEADERS }];
  },
};

export default nextConfig;
