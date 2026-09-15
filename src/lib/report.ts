import { ASSUMPTIONS, FRESHNESS_SECONDS } from './scenario';
import type { Scenario, Snapshot } from './types';

/** JSON export keeps financial values as precise decimal strings. */
export function createReport(snapshot: Snapshot, scenario: Scenario) {
  return {
    report: 'Buffer perpetual price scenario',
    version: 1,
    sourceMode: snapshot.source,
    network: snapshot.network,
    ...(snapshot.protocol ? { protocol: { ...snapshot.protocol } } : {}),
    sampleName: snapshot.sampleName,
    authority: snapshot.authority,
    selectedSubaccount: { ...snapshot.subaccount },
    snapshotTime: snapshot.retrievedAt,
    snapshotExpiresAt: snapshot.expiresAt,
    observedSlots: {
      account: snapshot.accountSlot,
      observed: snapshot.observedSlot,
      atomicSameSlotRead: false,
    },
    scenario: {
      label: 'Perp price P&L change',
      shockPercent: scenario.shockPercent,
      disabledReason: scenario.disabledReason,
      modeledPositions: scenario.eligible,
      totalPositions: scenario.totalPositions,
      includedPositions: scenario.included.map((position) => ({ ...position })),
      excludedPositions: scenario.excluded.map((position) => ({ ...position })),
      totalsByQuoteCurrency: scenario.totals.map((total) => ({ ...total })),
    },
    baselineMetrics: snapshot.metrics.map((metric) => ({ ...metric })),
    ...(snapshot.risk ? { riskContext: { ...snapshot.risk } } : {}),
    positions: snapshot.positions.map((position) => ({ ...position, oracle: { ...position.oracle } })),
    inventoryOutsideScenario: {
      available: snapshot.inventoryAvailable,
      spotBalances: snapshot.spots.map((spot) => ({ ...spot })),
      openOrdersByMarket: snapshot.orders.map((orders) => ({ ...orders })),
    },
    assumptions: [...ASSUMPTIONS],
    appFreshnessSeconds: FRESHNESS_SECONDS,
    provenance: [...snapshot.provenance],
    warnings: [...snapshot.warnings],
    numericEncoding: 'Financial values are decimal strings. No presentation rounding is applied to scenario contributions or totals.',
  };
}
