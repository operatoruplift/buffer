import { serveRead } from '@/server/boundary';
import { liveProvider } from '@/server/drift';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return serveRead(request, 'snapshot', liveProvider); }
