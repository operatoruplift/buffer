export type ProtocolId = 'velocity' | 'pacifica' | 'drift' | 'jupiter';
export interface ProtocolInfo {
  id: ProtocolId; label: string; programId: string | null; legacy: boolean;
  // Omitted for the original RPC deployments to preserve historical reports.
  transport?: 'rpc' | 'api'; apiOrigin?: string;
}

// Fixed deployment identities from the official migration reference:
// https://docs.velocity.exchange/developers/migrate-from-drift
// Public API identity: https://docs.pacifica.fi/api-documentation/api
export const PROTOCOLS = {
  jupiter: { id: 'jupiter', label: 'Jupiter Perps', programId: 'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu', legacy: false },
  velocity: { id: 'velocity', label: 'Velocity', programId: 'vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P', legacy: false },
  pacifica: { id: 'pacifica', label: 'Pacifica', programId: null, legacy: false, transport: 'api', apiOrigin: 'https://api.pacifica.fi' },
  drift: { id: 'drift', label: 'Drift (legacy)', programId: 'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH', legacy: true },
} as const satisfies Record<ProtocolId, ProtocolInfo>;

/** Verify a known deployment or public API identity before modeling or rendering it. */
export function isCanonicalProtocol(value: unknown): value is ProtocolInfo {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== 'string' || !Object.hasOwn(PROTOCOLS, candidate.id)) return false;
  const expected: ProtocolInfo = PROTOCOLS[candidate.id as ProtocolId];
  return candidate.label === expected.label && candidate.programId === expected.programId &&
    candidate.legacy === expected.legacy && candidate.transport === expected.transport && candidate.apiOrigin === expected.apiOrigin;
}
