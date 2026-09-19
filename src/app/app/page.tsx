import Dashboard from '@/components/Dashboard';
import { parseLiveLink } from '@/lib/live-link';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Position explorer — Buffer' };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  }
  return <Dashboard liveConfigured={Boolean(process.env.SOLANA_RPC_URL?.trim())} initialLiveLink={parseLiveLink(params)} />;
}
