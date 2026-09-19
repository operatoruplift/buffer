/** Shared public contracts. No worker credential or provider token belongs in these types. */
export type MonitoringDeliveryState = 'queued' | 'sending' | 'accepted_by_provider' | 'delivered' | 'failed' | 'suppressed' | 'unknown_outcome';
export interface MonitoringDestination { id: string; label: string; provider: 'discord'; verifiedAt: string | null; enabled: boolean; maskedDestination: string }
export interface MonitoringRule {
  id: string; version: number; authority: string; subaccountId: number;
  provider: 'velocity'; network: 'mainnet-beta'; metric: 'maintenance_headroom'; unit: 'USD';
  direction: 'below' | 'above'; threshold: string; cadenceMinutes: number; timezone: string;
  cooldownMinutes: number; hysteresis: string; destinationId: string; enabled: boolean;
  monitoringState: 'configured' | 'fresh' | 'unavailable' | 'paused';
  lastAttemptAt: string | null; lastFreshCheck: string | null; inputExpiresAt: string | null;
  nextCheckAt: string | null; lastError: string | null; breached: boolean;
  createdAt: string; updatedAt: string;
}
export interface MonitoringEvent {
  id: string; ruleId: string | null; ruleVersion: number; state: MonitoringDeliveryState;
  observedAt: string; value: string; threshold: string; reason: string;
  acceptedAt: string | null; deliveredAt: string | null; messageId: string | null;
  lastError: string | null; attempts: number; preview: string | null;
}
export interface MonitoringOverview {
  capability: { configured: boolean; sendEnabled: boolean; destinationAvailable: boolean; message: string };
  heartbeat: { lastRunAt: string | null; lastCompletedAt: string | null; status: 'awaiting_activation' | 'healthy' | 'unavailable'; mode: 'dry_run' | 'send' };
  destinations: MonitoringDestination[]; rules: MonitoringRule[]; events: MonitoringEvent[];
}
export interface MonitoringRuleInput {
  authority: string; subaccountId: number; direction: 'below' | 'above'; threshold: string;
  cadenceMinutes: number; timezone: string; cooldownMinutes: number; hysteresis: string;
  destinationId: string; enabled: boolean;
}
export type MonitoringRulePatch = Partial<Omit<MonitoringRuleInput, 'authority' | 'subaccountId'>>;
export interface MonitoringError { error: { code: string; message: string; retryable: boolean } }
export const MONITORING_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
