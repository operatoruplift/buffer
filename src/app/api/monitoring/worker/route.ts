import { headScheduledMonitoring, scheduledMonitoring } from '@/server/monitoring/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const GET = scheduledMonitoring;
export const POST = scheduledMonitoring;
export const HEAD = headScheduledMonitoring;
