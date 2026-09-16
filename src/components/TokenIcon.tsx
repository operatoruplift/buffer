import Image from 'next/image';
import { TOKEN_LOGOS } from '@/lib/token-logos';
import styles from './TokenIcon.module.css';

/** Decorative artwork: the adjacent market label supplies the accessible name. */
export function TokenIcon({ asset, size = 32 }: { asset: string; size?: number }) {
  const source = TOKEN_LOGOS[asset];
  return <span aria-hidden="true" className={`${styles.token} ${asset === 'HYPE' ? styles.hype : ''} ${asset === 'SOL' ? styles.sol : ''}`} style={{ width: size, height: size }}>
    {source
      // Eager: these are a handful of 32px icons that sit below the fold at
      // phone width, where next/image's lazy default leaves them undecoded
      // until the user scrolls, so the market list renders without its art.
      ? <Image src={source} alt="" width={size} height={size} unoptimized loading="eager" className={styles.image} />
      : <span className={styles.symbol}>{asset}</span>}
  </span>;
}
