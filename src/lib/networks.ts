/** Networks a live read can use. Presets use the fixture catalog instead. */
export type LiveNetwork = 'mainnet-beta' | 'devnet';
export const LIVE_NETWORKS: readonly LiveNetwork[] = ['mainnet-beta', 'devnet'];
export const NETWORK_LABELS: Record<LiveNetwork, string> = { 'mainnet-beta': 'Solana mainnet', devnet: 'Solana devnet' };
/** Solana's published genesis hashes; an RPC must answer with the one for its network. */
export const GENESIS_HASHES: Record<LiveNetwork, string> = {
  'mainnet-beta': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
  devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
};
export const isLiveNetwork = (value: unknown): value is LiveNetwork => value === 'mainnet-beta' || value === 'devnet';
