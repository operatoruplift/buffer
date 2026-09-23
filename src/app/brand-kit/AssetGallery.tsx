'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Icon } from '@/components/Icons';
import type { BrandAsset } from '@/lib/brand-assets';
import styles from './page.module.css';

const categories = ['All', 'Profiles', 'Wallpapers', 'Headers', 'Social', 'Backgrounds'] as const;
type Category = (typeof categories)[number];

export function AssetGallery({ assets }: { assets: readonly BrandAsset[] }) {
  const [category, setCategory] = useState<Category>('All');
  const [selected, setSelected] = useState<BrandAsset | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const visibleAssets = category === 'All' ? assets : assets.filter(asset => asset.category === category);

  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [selected]);

  function openPreview(asset: BrandAsset, event: MouseEvent<HTMLButtonElement>) {
    openerRef.current = event.currentTarget;
    setSelected(asset);
    dialogRef.current?.showModal();
  }

  function restoreFocus() {
    setSelected(null);
    openerRef.current?.focus();
  }

  function closeFromBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
      event.currentTarget.close();
    }
  }

  return (
    <>
      <div className={styles.galleryToolbar}>
        <div className={styles.filters} role="group" aria-label="Filter artwork by category">
          {categories.map(item => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
        </div>
        <span className={styles.assetCount} role="status" aria-label="Artwork count" aria-live="polite">{visibleAssets.length} {visibleAssets.length === 1 ? 'composition' : 'compositions'}</span>
      </div>
      <div className={styles.assetGrid}>
        {visibleAssets.map(asset => <article className={styles.assetCard} key={asset.id} aria-labelledby={`${asset.id}-title`}>
          <button className={`${styles.preview} ${asset.collection === 'After hours' ? styles.nightPreview : ''}`} type="button" aria-label={`Preview ${asset.name}`} onClick={event => openPreview(asset, event)}>
            <Image src={asset.preview} alt={asset.description} width={asset.width} height={asset.height} loading="lazy" unoptimized />
            <span className={styles.previewHint}>View artwork <Icon name="external" size={14} /></span>
          </button>
          <div className={styles.assetMeta}>
            <span className={styles.assetCollection}>{asset.collection} / {asset.category}</span>
            <h3 id={`${asset.id}-title`}>{asset.name}</h3>
            <span className={styles.dimensions}>{asset.width.toLocaleString('en-US')} × {asset.height.toLocaleString('en-US')} px</span>
          </div>
          <div className={styles.assetActions}>
            <a href={asset.src} download aria-label={`Download ${asset.name} PNG`}>Save PNG <Icon name="download" size={14} /></a>
            <a href={asset.src} target="_blank" rel="noopener noreferrer" aria-label={`Open ${asset.name} original image`}>Open image <Icon name="external" size={13} /></a>
          </div>
        </article>)}
      </div>

      <dialog className={styles.dialog} ref={dialogRef} aria-labelledby="asset-preview-title" aria-describedby="asset-preview-description" onClose={restoreFocus} onClick={closeFromBackdrop}>
        <button type="button" className={styles.closePreview} onClick={() => dialogRef.current?.close()} aria-label="Close artwork preview"><Icon name="close" size={21} /></button>
        <div className={`${styles.dialogArt} ${selected?.collection === 'After hours' ? styles.nightPreview : ''}`}>
          {selected && <Image src={selected.src} alt={selected.description} width={selected.width} height={selected.height} unoptimized />}
        </div>
        <div className={styles.dialogDetails}>
          <span className={styles.eyebrow}>{selected?.collection} / {selected?.category}</span>
          <h2 id="asset-preview-title">{selected?.name ?? 'Artwork preview'}</h2>
          <p id="asset-preview-description">{selected?.description}</p>
          {selected && <>
            <span className={styles.dialogDimensions}>{selected.width.toLocaleString('en-US')} × {selected.height.toLocaleString('en-US')} px · Full-resolution PNG</span>
            <div className={styles.dialogActions}>
              <a className={styles.primaryAction} href={selected.src} download>Save PNG <Icon name="download" size={16} /></a>
              <a className={styles.textLink} href={selected.src} target="_blank" rel="noopener noreferrer">Open original image <Icon name="external" size={15} /></a>
              {selected.svgSrc && <a className={styles.textLink} href={selected.svgSrc} download>Download source SVG <Icon name="download" size={15} /></a>}
            </div>
            <p className={styles.saveTip}>Saving on your phone? Open the original image, then press and hold to save it to Photos.</p>
          </>}
        </div>
      </dialog>
    </>
  );
}
