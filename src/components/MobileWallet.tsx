'use client';

import { useEffect } from 'react';

// Registers the Solana Mobile Wallet Adapter as a Wallet Standard wallet so
// "Use my wallet" can fill the address from Seed Vault Wallet, Phantom or
// Solflare on Android and Seeker. Buffer never requests a signature.
// The adapter only registers itself in a secure context on a device with local
// association; desktop, iOS and in-wallet browsers are left untouched.
let registered = false;

export default function MobileWallet() {
  useEffect(() => {
    if (registered || typeof window === 'undefined') return;
    registered = true;
    import('@solana-mobile/wallet-standard-mobile')
      .then((mwa) => {
        mwa.registerMwa({
          appIdentity: { name: 'Buffer', uri: window.location.origin, icon: 'icons/icon-192.png' },
          authorizationCache: mwa.createDefaultAuthorizationCache(),
          chains: ['solana:mainnet'],
          chainSelector: mwa.createDefaultChainSelector(),
          onWalletNotFound: mwa.createDefaultWalletNotFoundHandler(),
        });
      })
      .catch(() => { registered = false; });
  }, []);
  return null;
}
