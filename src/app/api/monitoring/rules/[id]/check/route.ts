import { freshMonitoringCheck } from '@/server/monitoring/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return freshMonitoringCheck(request, (await context.params).id); }
