'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Brand } from './Brand';
import { Icon } from './Icons';
import { useMotionPreference } from '@/lib/use-motion-preference';
import styles from './MobileNavigation.module.css';

export function MobileNavigation() {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { paused } = useMotionPreference();
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  const close = () => dialog.current?.close();
  return <>
    <button ref={opener} className={styles.opener} type="button" aria-label="Open navigation" aria-expanded={open} aria-controls="buffer-mobile-navigation" onClick={() => { dialog.current?.showModal(); setOpen(true); }}><span /><span /></button>
    <dialog id="buffer-mobile-navigation" className={styles.sheet} ref={dialog} aria-label="Navigation" data-motion-paused={paused}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'));
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}
      onClose={() => { setOpen(false); opener.current?.focus({ preventScroll: true }); }}
      onCancel={event => { event.preventDefault(); close(); }}
      onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className={styles.top}><Brand /><button autoFocus type="button" aria-label="Close navigation" onClick={close}><Icon name="close" size={22} /></button></div>
      <nav aria-label="Mobile navigation" onClick={event => { if ((event.target as Element).closest('a')) close(); }}>
        <a href="#features">Features <Icon name="arrow" /></a>
        <a href="#method">How it works <Icon name="arrow" /></a>
        <Link href="/demo">Demo <Icon name="arrow" /></Link>
        <a href="#install">Get the app <Icon name="arrow" /></a>
        <Link href="/auth">Sign in <Icon name="arrow" /></Link>
        <Link href="/app" className={styles.primary}>Open Buffer <Icon name="arrow" /></Link>
      </nav>
      <p>More perspective. No trading permissions.</p>
    </dialog>
  </>;
}
