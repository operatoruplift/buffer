import type { NextConfig } from "next";

/**
 * The browser talks only to this origin and, when accounts are configured, to
 * Supabase. Velocity, Pacifica and RPC reads all happen server-side, so
 * connect-src stays tight. The Supabase origin is derived rather than
 * hardcoded so a project change cannot silently break sign-in.
 */
function contentSecurityPolicy(): string {
  const supabase = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  let supabaseOrigin = '';
  try {
    if (supabase) supabaseOrigin = new URL(supabase).origin;
  } catch {
    supabaseOrigin = '';
  }
  const connect = ["'self'", supabaseOrigin].filter(Boolean).join(' ');
  return [
    "default-src 'self'",
    // Next.js ships an inline bootstrap script; styles are inlined by the build.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self'",
    "font-src 'self' data:",
    // The PWA registers a service worker from this origin.
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    `connect-src ${connect}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

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
        { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
      ] },
    ];
  },
};
export default config;
