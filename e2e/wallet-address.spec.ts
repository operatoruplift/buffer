import { expect, test, type Page } from '@playwright/test';
import type { Wallet, WindowAppReadyEventAPI } from '@wallet-standard/base';
import { PROTOCOLS } from '../src/lib/protocols';

const SOLANA_ADDRESS = '11111111111111111111111111111111';
const PREVIOUS_ADDRESS = 'So11111111111111111111111111111111111111112';

type FixtureAccount = { address: string; chains: `${string}:${string}`[] };
type FixtureWallet = {
  name: string;
  chains?: `${string}:${string}`[];
  responses: ({ accounts: FixtureAccount[] } | { error: string })[];
};
type WalletCalls = { connections: string[]; signing: string[] };
type FixtureWindow = Window & { bufferWalletCalls?: WalletCalls };

// Exercise the real Wallet Standard registration and connection path. These
// synthetic wallets cannot sign, submit transactions, or access an extension.
async function registerWallets(page: Page, fixtures: FixtureWallet[]) {
  await page.addInitScript((definitions: FixtureWallet[]) => {
    const calls: WalletCalls = { connections: [], signing: [] };
    (window as FixtureWindow).bufferWalletCalls = calls;
    const wallets: Wallet[] = definitions.map(definition => {
      let attempts = 0;
      const refuseSigning = async () => {
        calls.signing.push(definition.name);
        throw new Error('The address-only flow must not request a signature.');
      };
      return {
        version: '1.0.0',
        name: definition.name,
        icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
        chains: definition.chains ?? ['solana:mainnet'],
        accounts: [],
        features: {
          'standard:connect': {
            version: '1.0.0',
            connect: async () => {
              calls.connections.push(definition.name);
              const response = definition.responses[Math.min(attempts++, definition.responses.length - 1)];
              if ('error' in response) throw new Error(response.error);
              return { accounts: response.accounts.map(account => ({
                ...account,
                publicKey: new Uint8Array(32),
                features: [],
              })) };
            },
          },
          'solana:signMessage': { version: '1.0.0', signMessage: refuseSigning },
          'solana:signTransaction': { version: '1.0.0', signTransaction: refuseSigning },
          'solana:signAndSendTransaction': { version: '1.0.0', signAndSendTransaction: refuseSigning },
        },
      };
    });
    const register = (api: WindowAppReadyEventAPI) => {
      for (const wallet of wallets) api.register(wallet);
    };
    window.addEventListener('wallet-standard:app-ready', event => {
      register((event as CustomEvent<WindowAppReadyEventAPI>).detail);
    });
    window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: register }));
  }, fixtures);
}

async function openAccountForm(page: Page) {
  const reads: string[] = [];
  await page.route('**/api/accounts?*', route => {
    const authority = new URL(route.request().url()).searchParams.get('authority');
    reads.push(authority ?? '');
    return route.fulfill({ json: {
      authority, protocol: PROTOCOLS.velocity, retrievedAt: new Date().toISOString(), subaccounts: [],
    } });
  });
  await page.goto('/app');
  await page.getByRole('link', { name: 'Choose an account', exact: true }).click();
  const address = page.getByRole('textbox', { name: 'Solana wallet address', exact: true });
  await expect(address).toBeFocused();
  await address.fill(PREVIOUS_ADDRESS);
  return { reads, address, connect: page.getByRole('button', { name: 'Use my wallet', exact: true }) };
}

async function walletCalls(page: Page) {
  return page.evaluate(() => {
    const calls = (window as FixtureWindow).bufferWalletCalls;
    if (!calls) throw new Error('The test wallet did not register its call recorder.');
    return calls;
  });
}

test('wallet connection selects a Solana account and reads its public address without signing', async ({ page }) => {
  await registerWallets(page, [{ name: 'Multi-chain wallet', responses: [{ accounts: [
    { address: '0x1234567890', chains: ['eip155:1'] },
    { address: SOLANA_ADDRESS, chains: ['solana:mainnet'] },
  ] }] }]);
  const { reads, address, connect } = await openAccountForm(page);
  expect(reads).toEqual([]);
  await connect.click();
  await expect(page.getByRole('heading', { name: 'No Velocity subaccounts found', exact: true })).toBeVisible();
  await expect(address).toHaveValue(SOLANA_ADDRESS);
  expect(reads).toEqual([SOLANA_ADDRESS]);
  expect(await walletCalls(page)).toEqual({ connections: ['Multi-chain wallet'], signing: [] });
});

for (const result of ['unsupported chain', 'no accounts'] as const) {
  test(`wallet returning ${result} preserves the current address and does not read an account`, async ({ page }) => {
    await registerWallets(page, [{ name: 'Unavailable Solana wallet', responses: [{
      // A valid-looking address must not bypass the chain requirement.
      accounts: result === 'unsupported chain' ? [{ address: SOLANA_ADDRESS, chains: ['eip155:1'] }] : [],
    }] }]);
    const { reads, address, connect } = await openAccountForm(page);
    await connect.click();
    await expect(page.getByRole('status').filter({ hasText: 'The wallet did not share a Solana address.' })).toBeVisible();
    await expect(address).toHaveValue(PREVIOUS_ADDRESS);
    await expect(connect).toBeEnabled();
    expect(reads).toEqual([]);
    expect(await walletCalls(page)).toEqual({ connections: ['Unavailable Solana wallet'], signing: [] });
  });
}

test('a rejected wallet connection can be retried without losing the entered address', async ({ page }) => {
  await registerWallets(page, [{ name: 'Retry wallet', responses: [
    { error: 'You cancelled the wallet connection.' },
    { accounts: [{ address: SOLANA_ADDRESS, chains: ['solana:mainnet'] }] },
  ] }]);
  const { reads, address, connect } = await openAccountForm(page);
  await connect.click();
  const rejection = page.getByRole('status').filter({ hasText: 'You cancelled the wallet connection.' });
  await expect(rejection).toBeVisible();
  await expect(address).toHaveValue(PREVIOUS_ADDRESS);
  expect(reads).toEqual([]);
  await expect(connect).toBeEnabled();
  await connect.click();
  await expect(page.getByRole('heading', { name: 'No Velocity subaccounts found', exact: true })).toBeVisible();
  await expect(address).toHaveValue(SOLANA_ADDRESS);
  await expect(rejection).toHaveCount(0);
  expect(reads).toEqual([SOLANA_ADDRESS]);
  expect(await walletCalls(page)).toEqual({ connections: ['Retry wallet', 'Retry wallet'], signing: [] });
});

test('multiple compatible wallets require a choice and exclude non-Solana wallets', async ({ page }) => {
  await registerWallets(page, [
    { name: 'First wallet', responses: [{ accounts: [{ address: PREVIOUS_ADDRESS, chains: ['solana:mainnet'] }] }] },
    { name: 'Second wallet', responses: [{ accounts: [{ address: SOLANA_ADDRESS, chains: ['solana:mainnet'] }] }] },
    { name: 'Other-chain wallet', chains: ['eip155:1'], responses: [{ accounts: [] }] },
  ]);
  const { reads, address, connect } = await openAccountForm(page);
  await connect.click();
  const menu = page.getByRole('menu', { name: 'Choose a wallet', exact: true });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveCount(2);
  await expect(menu.getByRole('menuitem', { name: 'Other-chain wallet', exact: true })).toHaveCount(0);
  expect(await walletCalls(page)).toEqual({ connections: [], signing: [] });
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(address).toHaveValue(PREVIOUS_ADDRESS);
  expect(reads).toEqual([]);

  await connect.click();
  await menu.getByRole('menuitem', { name: 'Second wallet', exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(address).toHaveValue(SOLANA_ADDRESS);
  await expect(page.getByRole('heading', { name: 'No Velocity subaccounts found', exact: true })).toBeVisible();
  expect(reads).toEqual([SOLANA_ADDRESS]);
  expect(await walletCalls(page)).toEqual({ connections: ['Second wallet'], signing: [] });
});
