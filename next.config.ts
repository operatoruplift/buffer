import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: [
    "@drift-labs/sdk",
    "@solana/web3.js",
    "@solana/spl-token",
    "@velocity-exchange/sdk",
    "velocity-web3",
  ],
  poweredByHeader: false,
  devIndicators: false,
  turbopack: { root: process.cwd() },
  agentRules: false,
  async headers() {
    return [
      { source: '/sw.js', headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Content-Type', value: 'application/javascript' },
        { key: 'Service-Worker-Allowed', value: '/' },
      ] },
      { source: '/:path*', headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ] },
    ];
  },
};
export default config;
