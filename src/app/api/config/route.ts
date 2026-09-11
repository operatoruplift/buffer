export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json({ liveConfigured: Boolean(process.env.SOLANA_RPC_URL?.trim()) }, { headers: { 'Cache-Control': 'no-store' } });
}
