import { mutateMonitoring } from '@/server/monitoring/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) { return mutateMonitoring(request, 'update', (await context.params).id); }
export async function DELETE(request: Request, context: Context) { return mutateMonitoring(request, 'delete', (await context.params).id); }
