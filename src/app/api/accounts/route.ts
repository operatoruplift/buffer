import { serveRead } from '@/server/boundary';
import { resolveProvider } from '@/server/providers';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export async function GET(request: Request) { return serveRead(request, 'discovery', resolveProvider); }
