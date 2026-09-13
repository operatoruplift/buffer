import type { JupiterInventory } from './jupiter-inventory';
import type { ProtocolInfo } from './protocols';
export type SourceMode = 'sample' | 'live';
export interface Subaccount { id: number; name: string; address: string | null }
export interface Metric { label: string; value: string | null; unit: string; explanation: string }
export interface OracleObservation {
  slot: number | null; readSlot: number | null; valid: boolean; reason: string | null;
  /** Provider-reported price timestamp, when exposed by a public API. */
  observedAt?: string | null;
}
export interface Position {
  id: string; marketIndex: number; market: string; asset: string;
  size: string; price: string | null; quote: string; notional: string | null;
  modeled: boolean; exclusionReason: string | null; isolated: boolean;
  oracle: OracleObservation;
  /** Explicit inventory only; size is a zero placeholder and must not be displayed as base quantity. */
  inventory?: JupiterInventory;
}
export interface SpotExposure { market: string; kind: 'Collateral' | 'Debt'; amount: string | null; explanation?: string }
export interface OrderInventory { market: string; count: number }
export interface Snapshot {
  protocol?: ProtocolInfo;
  source: SourceMode; network: 'mainnet-beta' | 'fixture'; authority: string | null;
  sampleName: string | null; subaccount: Subaccount;
  retrievedAt: string; expiresAt: string | null; accountSlot: number | null; observedSlot: number | null;
  metrics: Metric[]; positions: Position[]; spots: SpotExposure[]; orders: OrderInventory[];
  inventoryAvailable: boolean; warnings: string[]; provenance: string[];
}
export interface Discovery { authority: string; subaccounts: Subaccount[]; retrievedAt: string; protocol?: ProtocolInfo }
export interface ApiError { code: string; message: string; retryable: boolean }
export interface Contribution { id: string; market: string; quote: string; size: string; baselinePrice: string; hypotheticalPrice: string; delta: string }
export interface Scenario { shockPercent: number; included: Contribution[]; excluded: {id: string; market: string; reason: string}[]; totals: {quote: string; delta: string}[]; eligible: number; totalPositions: number; disabledReason: string | null }
