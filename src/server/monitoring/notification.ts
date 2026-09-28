import 'server-only';
import { createDiscordAdapter, type DiscordAdapter, type DiscordEvent, type DiscordPermanent } from './discord';
import { createWebhookAdapter, type WebhookAdapter } from './webhook';

export type NotificationProvider = 'discord' | 'webhook';
export interface NotificationDestination { id: string; provider: NotificationProvider; label: string; maskedDestination: string; fingerprint: string }
export interface NotificationPreview { destination: NotificationDestination; content: string; contentHash: string }
/** One dispatch surface for every server-configured destination kind. The coordinator never learns a URL or credential. */
export interface NotificationAdapter {
  listDestinations(ownerId: string): NotificationDestination[];
  preview(ownerId: string, destinationId: string, event: DiscordEvent): NotificationPreview;
  verifyDestination: DiscordAdapter['verifyDestination'];
  send: DiscordAdapter['send'];
  receipt: DiscordAdapter['receipt'];
}
interface Options { discord?: DiscordAdapter; webhook?: WebhookAdapter }

export function createNotificationAdapter(options: Options = {}): NotificationAdapter {
  const discord = options.discord ?? createDiscordAdapter();
  const webhook = options.webhook ?? createWebhookAdapter();
  const unavailable: DiscordPermanent = { kind: 'permanent', errorCode: 'DESTINATION_UNAVAILABLE' };
  const pick = (ownerId: string, id: string): DiscordAdapter | WebhookAdapter | null => {
    if (discord.listDestinations(ownerId).some(item => item.id === id)) return discord;
    if (webhook.listDestinations(ownerId).some(item => item.id === id)) return webhook;
    return null;
  };
  return {
    listDestinations(ownerId) { return [...discord.listDestinations(ownerId), ...webhook.listDestinations(ownerId)]; },
    preview(ownerId, id, event) {
      const adapter = pick(ownerId, id);
      if (!adapter) throw new Error('Notification destination is not configured for this owner.');
      return adapter.preview(ownerId, id, event);
    },
    async verifyDestination(ownerId, id) { return (await pick(ownerId, id)?.verifyDestination(ownerId, id)) ?? unavailable; },
    async send(ownerId, id, event, beforePost) { return (await pick(ownerId, id)?.send(ownerId, id, event, beforePost)) ?? unavailable; },
    async receipt(ownerId, id, event, messageId) { return (await pick(ownerId, id)?.receipt(ownerId, id, event, messageId)) ?? unavailable; },
  };
}
