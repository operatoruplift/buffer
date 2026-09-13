import type { Position } from '@/lib/types';
import { formatDecimal } from '@/lib/format';
import { TokenIcon } from './TokenIcon';
import styles from './JupiterPositions.module.css';

export function JupiterPositions({ positions }: { positions: Position[] }) {
  return <div className={styles.list}>{positions.map(position => {
    const row = position.inventory;
    if (!row) return null;
    return <article className={styles.card} key={position.id}>
      <header><TokenIcon asset={position.asset} size={32} /><div><strong>{position.market}</strong><span>{row.direction === 'long' ? '↗ Long' : '↘ Short'}</span></div><small>Inventory only</small></header>
      <dl>
        <div><dt>Position size</dt><dd>{formatDecimal(row.sizeUsd, 6)} <small>USD</small></dd></div>
        <div><dt>Entry price</dt><dd>{formatDecimal(row.entryPriceUsd, 6)} <small>USD</small></dd></div>
        <div><dt>Recorded collateral</dt><dd>{formatDecimal(row.collateralUsd, 6)} <small>USD</small></dd></div>
        <div><dt>Tokens reserved for profit cap</dt><dd>{formatDecimal(row.lockedAmount, 9)} <small>{row.lockedToken}</small></dd></div>
      </dl>
      <p>{position.exclusionReason}</p>
      <details><summary>Position sources</summary><dl>
        <div><dt>Position updated</dt><dd>{row.updatedAt.replace('T', ' ').replace('.000Z', ' UTC')}</dd></div>
        <div><dt>Position / custody / collateral read slots</dt><dd>{row.positionSlot} / {row.custodySlot} / {row.collateralCustodySlot}</dd></div>
        <div><dt>Position account</dt><dd><a href={`https://explorer.solana.com/address/${row.positionAddress}`} target="_blank" rel="noreferrer">{row.positionAddress} ↗</a></dd></div>
        <div><dt>Custody</dt><dd>{row.custody}</dd></div>
        <div><dt>Collateral custody</dt><dd>{row.collateralCustody}</dd></div>
        <div><dt>Configured oracle · current price unavailable</dt><dd>{row.oracleAddress}</dd></div>
        <div><dt>Locked token mint / exact atomic amount</dt><dd>{row.lockedTokenMint}<br />{row.lockedAmountAtomic}</dd></div>
      </dl></details>
    </article>;
  })}</div>;
}
