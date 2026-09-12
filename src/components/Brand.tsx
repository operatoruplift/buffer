import { Mark } from '@/components/Icons';
import styles from './Brand.module.css';

type BrandProps = {
  large?: boolean;
  className?: string;
};

export function Brand({ large = false, className }: BrandProps) {
  return (
    <span data-brand="buffer" className={[styles.brand, large ? styles.large : '', className].filter(Boolean).join(' ')}>
      <Mark size={33} />
      <span>Buffer</span>
    </span>
  );
}
