import Dashboard from "@/components/Dashboard";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <Dashboard liveConfigured={Boolean(process.env.SOLANA_RPC_URL?.trim())} />
  );
}
