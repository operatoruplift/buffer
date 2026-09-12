import Image from 'next/image';
import { TOKEN_LOGOS } from '@/lib/token-logos';
import styles from './TokenIcon.module.css';

/** Decorative artwork: the adjacent market label supplies the accessible name. */
export function TokenIcon({ asset, size = 32 }: { asset: string; size?: number }) {
  const source = TOKEN_LOGOS[asset];
  return <span aria-hidden="true" className={`${styles.token} ${asset === 'HYPE' ? styles.hype : ''}`} style={{ width: size, height: size }}>
    {source
      ? <Image src={source} alt="" width={size} height={size} unoptimized className={styles.image} />
      : <span className={styles.symbol}>{asset}</span>}
  </span>;
}
