import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: [
    "@drift-labs/sdk",
    "@solana/web3.js",
    "@solana/spl-token",
  ],
  poweredByHeader: false,
  devIndicators: false,
  turbopack: { root: process.cwd() },
  agentRules: false,
};
export default config;
