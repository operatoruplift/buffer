import { mutateMonitoring } from '@/server/monitoring/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export async function POST(request: Request) { return mutateMonitoring(request, 'create'); }
