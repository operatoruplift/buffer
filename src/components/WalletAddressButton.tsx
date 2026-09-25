'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import styles from './WalletAddressButton.module.css';

type ConnectFeature = { connect(input?: { silent?: boolean }): Promise<{ accounts: readonly WalletAccount[] }> };

// Buffer stays read-only: this asks a Wallet Standard wallet for its public
// address and nothing else. No message or transaction is ever signed. On
// Android and Seeker the Mobile Wallet Adapter appears here as one choice,
// so Seed Vault Wallet can fill the address in one tap.
function solanaWallets(): Wallet[] {
  return getWallets().get().filter((wallet) => 'standard:connect' in wallet.features && wallet.chains.some((chain) => chain.startsWith('solana:')));
}

export default function WalletAddressButton({ onAddress, disabled }: { onAddress: (address: string, walletName: string) => void; disabled?: boolean }) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const registry = getWallets();
    const sync = () => setWallets(solanaWallets());
    sync();
    const offRegister = registry.on('register', sync);
    const offUnregister = registry.on('unregister', sync);
    return () => { offRegister(); offUnregister(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!menu.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [open]);

  const connect = useCallback(async (wallet: Wallet) => {
    setBusy(wallet.name); setNote('');
    try {
      const feature = wallet.features['standard:connect'] as ConnectFeature | undefined;
      if (!feature) throw new Error('This wallet does not support the standard connection flow.');
      const result = await feature.connect();
      const account = result.accounts.find((item) => item.chains.some((chain) => chain.startsWith('solana:'))) ?? result.accounts[0];
      if (!account) throw new Error('The wallet did not share a Solana address.');
      setOpen(false);
      onAddress(account.address, wallet.name);
    } catch (error) {
      setNote(error instanceof Error && error.message ? error.message : 'The wallet did not share an address. Paste it instead.');
    } finally { setBusy(null); }
  }, [onAddress]);

  function toggle() {
    const current = solanaWallets();
    setWallets(current);
    if (current.length === 1) { void connect(current[0]); return; }
    setNote(current.length ? '' : 'No wallet was detected in this browser. Paste a public address instead.');
    setOpen((value) => !value);
  }

  return (
    <div className={styles.root} ref={menu}>
      <button type="button" className="button" onClick={toggle} disabled={disabled || Boolean(busy)} aria-haspopup="menu" aria-expanded={open}>
        {busy ? `Waiting for ${busy}…` : 'Use my wallet'}
      </button>
      {open && (
        <div className={styles.menu} role="menu" aria-label="Choose a wallet">
          {wallets.map((wallet) => (
            <button key={wallet.name} type="button" role="menuitem" className={styles.item} onClick={() => void connect(wallet)} disabled={Boolean(busy)}>
              {/* Wallet icons are data: URIs supplied by the wallet itself; next/image cannot optimize them. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {wallet.icon ? <img src={wallet.icon} alt="" width={20} height={20} /> : null}
              <span>{wallet.name}</span>
            </button>
          ))}
          {note ? <p className={styles.note} role="status">{note}</p> : <p className={styles.note}>Shares your public address only. Nothing is signed.</p>}
        </div>
      )}
      {!open && note ? <p className={styles.note} role="status">{note}</p> : null}
    </div>
  );
}
