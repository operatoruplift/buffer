export type ProtocolId = 'velocity' | 'drift';
export interface ProtocolInfo { id: ProtocolId; label: string; programId: string; legacy: boolean }

// Fixed deployment identities from the official migration reference:
// https://docs.velocity.exchange/developers/migrate-from-drift
export const PROTOCOLS: Record<ProtocolId, ProtocolInfo> = {
  velocity: { id: 'velocity', label: 'Velocity', programId: 'vELoC1audYbSYVRXn1vPaV8Axoa9oU6BYmNGZZBDZ1P', legacy: false },
  drift: { id: 'drift', label: 'Drift (legacy)', programId: 'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH', legacy: true },
};
