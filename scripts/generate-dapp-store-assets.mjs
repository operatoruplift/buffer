/**
 * Rebuild the Solana dApp Store listing kit in docs/dapp-store/.
 *
 *   node scripts/generate-dapp-store-assets.mjs [banner|screenshots|verify|all]
 *     --base-url=https://bufferonsolana.vercel.app   site to capture (default: production)
 *     --velocity=<public address>                    Velocity mainnet account with open positions
 *     --pacifica=<public address>                    Pacifica account with open positions
 *
 * banner       Renders scripts/dapp-store/banner.html at 1200x600, deviceScaleFactor 1. The
 *              scenario card is the app's own 'long-short' preset run through src/lib/scenario.ts.
 * screenshots  Reads the live site as a 360x640 phone at deviceScaleFactor 3, so every capture is
 *              1080x1920. It opens public pages and public example accounts only: it never signs in
 *              or sends a form. The report shot saves to the throwaway browser profile's storage.
 * verify       Checks real PNG dimensions and file sizes against the store limits.
 *
 * Live reads count against the site's per-IP limit (about 30 a minute); one run makes four.
 */
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'docs/dapp-store');
const screenshotDir = path.join(output, 'screenshots');
const bannerFile = path.join(output, 'banner-1200x600.png');

const BANNER = { width: 1200, height: 600 };
const PHONE = { width: 360, height: 640, scale: 3 };
const SCREENSHOT = { width: PHONE.width * PHONE.scale, height: PHONE.height * PHONE.scale };
const STORE = { minScreenshots: 4, maxScreenshots: 8, maxBytes: 3_000_000 };
// Portal text limits; listing.md states each count, and verify keeps those statements true.
const TEXT = { name: { label: 'App name', max: 25 }, subtitle: { label: 'Subtitle', max: 30 }, description: { label: 'Description', max: 10_000 } };
const SHOCK_PERCENT = -10;
// Live calculations expire after 120 seconds; finish each account's captures well inside that.
const FRESH_MS = 100_000;
const DEFAULTS = {
  baseUrl: 'https://bufferonsolana.vercel.app',
  // The app's own public examples (src/lib/live-link.ts). Balances can change or close.
  velocity: 'DxoRJ4f5XRMvXU9SGuM4ZziBFUxbhB3ubur5sVZEvue2',
  pacifica: 'Ep1d8JdFw4FnB85XDgXGVabYutro4JzK285HQqW6TZE2',
};

function options(argv) {
  const values = { ...DEFAULTS, command: 'all' };
  for (const arg of argv) {
    const match = /^--(base-url|velocity|pacifica)=(.+)$/.exec(arg);
    if (match) values[match[1] === 'base-url' ? 'baseUrl' : match[1]] = match[2];
    else if (['banner', 'screenshots', 'verify', 'all'].includes(arg)) values.command = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  const base = new URL(values.baseUrl);
  if (base.protocol !== 'https:' && base.hostname !== '127.0.0.1' && base.hostname !== 'localhost') throw new Error('Capture an https deployment or a local server.');
  values.baseUrl = base.origin;
  for (const key of ['velocity', 'pacifica']) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(values[key])) throw new Error(`--${key} must be a public Solana address.`);
  }
  return values;
}

/** The banner's numbers come from the app's own modules, so they cannot drift from the product. */
async function presetScenario() {
  const { build } = await import('rolldown');
  const id = 'virtual:dapp-store-banner';
  const source = (file) => JSON.stringify(path.join(root, file));
  const entry = `export { getSampleSnapshot, SAMPLE_ACCOUNTS } from ${source('src/lib/samples.ts')};
export { calculateScenario } from ${source('src/lib/scenario.ts')};
export { formatDecimal } from ${source('src/lib/format.ts')};`;
  const bundle = await build({
    cwd: root, input: id, write: false, platform: 'node', logLevel: 'silent',
    resolve: { alias: { '@': path.join(root, 'src') } },
    plugins: [{ name: 'dapp-store-entry', resolveId: (spec) => (spec === id ? id : null), load: (spec) => (spec === id ? entry : null) }],
    output: { format: 'esm' },
  });
  const app = await import(`data:text/javascript;base64,${Buffer.from(bundle.output[0].code).toString('base64')}`);
  const snapshot = app.getSampleSnapshot('long-short');
  const scenario = app.calculateScenario(snapshot, SHOCK_PERCENT, Date.parse(snapshot.retrievedAt));
  if (scenario.disabledReason || scenario.totals.length !== 1 || scenario.included.length !== snapshot.positions.length) {
    throw new Error('The long-short preset no longer produces a single-currency scenario; update the banner card.');
  }
  const signedPercent = `${SHOCK_PERCENT > 0 ? '+' : SHOCK_PERCENT < 0 ? '−' : ''}${Math.abs(SHOCK_PERCENT)}%`;
  return {
    preset: `${app.SAMPLE_ACCOUNTS.find((item) => item.id === 'long-short').name} preset`,
    total: app.formatDecimal(scenario.totals[0].delta, 2, true),
    quote: scenario.totals[0].quote,
    shock: signedPercent,
    move: `If supported perp prices move ${signedPercent} together.`,
    position: ((SHOCK_PERCENT + 20) / 40) * 100,
    positions: scenario.included.map((item) => {
      const asset = snapshot.positions.find((position) => position.id === item.id).asset;
      const short = item.size.startsWith('-');
      return {
        market: item.market,
        icon: `../../public/tokens/${asset.toLowerCase()}.png`,
        detail: `${short ? 'Short' : 'Long'} · ${app.formatDecimal(item.size.replace('-', ''), 2)} at ${app.formatDecimal(item.baselinePrice, 2)} ${item.quote}`,
        delta: app.formatDecimal(item.delta, 2, true),
        direction: item.delta.startsWith('-') ? 'down' : 'up',
      };
    }),
  };
}

const BANNER_ORIGIN = 'https://dapp-store-banner.invalid';
const SERVED = ['scripts/dapp-store/', 'design/brand-kit/masters/', 'public/tokens/', 'src/app/fonts/'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

async function renderBanner(browser) {
  const data = await presetScenario();
  const context = await browser.newContext({ viewport: { width: BANNER.width, height: BANNER.height }, deviceScaleFactor: 1, colorScheme: 'light' });
  // Serve the composition and its brand sources from disk under a private origin; nothing is fetched.
  await context.route(`${BANNER_ORIGIN}/**`, async (route) => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, '');
    const file = path.join(root, relative);
    if (!SERVED.some((dir) => relative.startsWith(dir)) || !file.startsWith(root) || !TYPES[path.extname(file)]) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)], body: await readFile(file) });
  });
  await context.route((url) => !url.href.startsWith(BANNER_ORIGIN), (route) => route.abort());
  const page = await context.newPage();
  await page.goto(`${BANNER_ORIGIN}/scripts/dapp-store/banner.html`, { waitUntil: 'load' });
  await page.evaluate((card) => {
    const slot = (name) => document.querySelector(`[data-slot="${name}"]`);
    for (const key of ['preset', 'total', 'quote', 'shock', 'move']) slot(key).textContent = card[key];
    slot('fill').style.width = `${card.position}%`;
    slot('thumb').style.left = `${card.position}%`;
    const list = slot('positions');
    list.replaceChildren(...card.positions.map((item) => {
      const row = document.createElement('div'); row.className = 'position';
      const icon = document.createElement('img'); icon.src = item.icon; icon.alt = '';
      const label = document.createElement('span');
      const market = document.createElement('strong'); market.textContent = item.market;
      const detail = document.createElement('small'); detail.textContent = item.detail;
      label.append(market, detail);
      const delta = document.createElement('strong'); delta.className = item.direction; delta.textContent = item.delta;
      row.append(icon, label, delta);
      return row;
    }));
  }, data);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
    if (!document.fonts.check('600 16px Inter')) throw new Error('Inter did not load for the banner.');
  });
  const png = await page.screenshot({ type: 'png' });
  await context.close();
  await mkdir(output, { recursive: true });
  await writeFile(bannerFile, await sharp(png).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer());
  console.log(`banner: ${path.relative(root, bannerFile)} · ${data.preset} at ${data.shock}: ${data.total} ${data.quote}`);
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].filter((image) => image.loading !== 'lazy' || image.complete).map((image) => image.decode().catch(() => undefined)));
  });
  // Toasts confirm actions for 4.5 seconds; never capture one mid-fade.
  await page.waitForFunction(() => !document.querySelector('.toast span'), null, { timeout: 15_000 });
  await page.waitForTimeout(350);
}

/** Put a target just under the sticky app header, leaving `gap` pixels of air above it. */
async function scrollUnderHeader(page, selector, gap = 12) {
  await page.evaluate(([target, space]) => {
    const element = document.querySelector(target);
    if (!element) throw new Error(`Missing ${target}`);
    const header = document.querySelector('.header')?.getBoundingClientRect().height ?? 0;
    window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - header - space, behavior: 'instant' });
  }, [selector, gap]);
}

async function capture(page, name, startedAt) {
  if (startedAt && Date.now() - startedAt > FRESH_MS) throw new Error(`${name}: the live snapshot is too old to show a current calculation. Run again.`);
  await settle(page);
  const png = await page.screenshot({ type: 'png' });
  const file = path.join(screenshotDir, name);
  await writeFile(file, await sharp(png).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer());
  console.log(`screenshot: ${path.relative(root, file)}`);
}

async function captureScreenshots(browser, settings) {
  const context = await browser.newContext({
    viewport: { width: PHONE.width, height: PHONE.height }, deviceScaleFactor: PHONE.scale,
    isMobile: true, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce',
    colorScheme: 'light', locale: 'en-US', timezoneId: 'UTC',
  });
  const page = await context.newPage();
  await rm(screenshotDir, { recursive: true, force: true });
  await mkdir(screenshotDir, { recursive: true });
  const live = (protocol, authority) => `${settings.baseUrl}/app?${new URLSearchParams({ protocol, authority })}`;

  // 1. The landing hero, as a first-time visitor sees it.
  await page.goto(`${settings.baseUrl}/`, { waitUntil: 'networkidle' });
  await capture(page, '01-landing-hero.png');

  // 2, 3, 5 and 6. One fresh read of the public Velocity mainnet example serves four views.
  await page.goto(live('velocity', settings.velocity), { waitUntil: 'networkidle' });
  const estimate = page.locator('[data-testid="liquidation-estimate"]');
  await estimate.waitFor({ timeout: 60_000 });
  const velocityReadAt = Date.now();
  if (await estimate.getAttribute('data-liquidation-state') !== 'estimated') throw new Error('The Velocity account has no current liquidation estimate. Pass --velocity=<address with open positions>.');
  // Keep the observation time above the estimate in frame: it dates the numbers.
  await scrollUnderHeader(page, '[data-testid="liquidation-estimate"]', 96);
  await capture(page, '02-velocity-liquidation-estimate.png', velocityReadAt);

  const scenario = page.locator('#app-scenario');
  await scenario.getByRole('button', { name: `${SHOCK_PERCENT}%`, exact: true }).click();
  await page.waitForFunction(() => !/^0\.00/.test(document.querySelector('[data-testid="scenario-total"]')?.textContent ?? '0.00'));
  await scrollUnderHeader(page, '#app-scenario', 12);
  await capture(page, '03-velocity-price-scenario.png', velocityReadAt);

  // The device library: save this scenario and open its dated explanation.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.getByRole('button', { name: 'My reports', exact: true }).click();
  const library = page.getByRole('dialog', { name: 'Saved perspectives.' });
  await library.getByRole('button', { name: 'Save current scenario' }).click();
  await library.getByText('Saved on this device').waitFor();
  await library.getByText('View saved explanation').click();
  // Start the frame on the saved item, with a little air above its divider and no clipped line.
  await page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]');
    const item = dialog.querySelector('li');
    dialog.scrollTo({ top: item.offsetTop - 18, behavior: 'instant' });
  });
  await capture(page, '05-saved-report.png', velocityReadAt);
  await library.getByRole('button', { name: 'Close saved reports' }).click();

  await scrollUnderHeader(page, '#monitoring', 8);
  await capture(page, '06-alerts-panel.png', velocityReadAt);

  // 4. The public Pacifica example: equity, commodity and FX perps beside crypto.
  await page.goto(live('pacifica', settings.pacifica), { waitUntil: 'networkidle' });
  await page.locator('#positions-heading').waitFor({ timeout: 60_000 });
  const pacificaReadAt = Date.now();
  await scrollUnderHeader(page, '#app-positions', 12);
  await capture(page, '04-pacifica-positions.png', pacificaReadAt);
  await context.close();
}

/** Real dimensions from each PNG's IHDR chunk, never from file names. */
async function pngInfo(file) {
  const bytes = await readFile(file);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((byte, index) => bytes[index] !== byte) || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`${file} is not a PNG.`);
  return { file: path.relative(root, file), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: (await stat(file)).size };
}

/** Each Portal field is a ```text <field> block in listing.md; count characters, not bytes. */
async function listingText(problems) {
  const markdown = await readFile(path.join(output, 'listing.md'), 'utf8');
  const fields = Object.fromEntries([...markdown.matchAll(/^```text ([a-z-]+)\n([\s\S]*?)\n```$/gm)].map((match) => [match[1], match[2]]));
  const counts = {};
  for (const [field, { label, max }] of Object.entries(TEXT)) {
    if (!fields[field]?.trim()) { problems.push(`listing.md has no ${label} block.`); continue; }
    const characters = [...fields[field]].length;
    counts[field] = { characters, max };
    if (characters > max) problems.push(`${label} has ${characters} characters; the limit is ${max}.`);
    const stated = new RegExp(`\\*\\*${label}\\*\\* \\(([\\d,]+) of ${max.toLocaleString('en-US')} characters\\)`).exec(markdown);
    if (!stated || Number(stated[1].replaceAll(',', '')) !== characters) problems.push(`listing.md must state "${label} (${characters.toLocaleString('en-US')} of ${max.toLocaleString('en-US')} characters)".`);
  }
  return counts;
}

async function verify() {
  const problems = [];
  const banner = await pngInfo(bannerFile);
  if (banner.width !== BANNER.width || banner.height !== BANNER.height) problems.push(`Banner is ${banner.width}x${banner.height}, not ${BANNER.width}x${BANNER.height}.`);
  const names = (await readdir(screenshotDir)).filter((name) => name.endsWith('.png')).sort();
  const screenshots = await Promise.all(names.map((name) => pngInfo(path.join(screenshotDir, name))));
  if (screenshots.length < STORE.minScreenshots || screenshots.length > STORE.maxScreenshots) problems.push(`${screenshots.length} screenshots; the store accepts ${STORE.minScreenshots}-${STORE.maxScreenshots}.`);
  for (const shot of screenshots) {
    if (shot.width !== SCREENSHOT.width || shot.height !== SCREENSHOT.height) problems.push(`${shot.file} is ${shot.width}x${shot.height}, not ${SCREENSHOT.width}x${SCREENSHOT.height}.`);
    if (shot.bytes >= STORE.maxBytes) problems.push(`${shot.file} is ${shot.bytes} bytes; keep each screenshot under ${STORE.maxBytes}.`);
  }
  if (new Set(screenshots.map((shot) => `${shot.width}x${shot.height}`)).size > 1) problems.push('Screenshots differ in size.');
  // Every capture listing.md describes must exist, and nothing unlisted may ship.
  const listed = [...new Set([...(await readFile(path.join(output, 'listing.md'), 'utf8')).matchAll(/`screenshots\/([\w-]+\.png)`/g)].map((match) => match[1]))].sort();
  for (const name of listed.filter((name) => !names.includes(name))) problems.push(`listing.md lists screenshots/${name}, which is missing.`);
  for (const name of names.filter((name) => !listed.includes(name))) problems.push(`screenshots/${name} is not described in listing.md.`);
  const listing = await listingText(problems);
  const summary = { result: problems.length ? 'FAIL' : 'PASS', banner, screenshots, listing, limits: { banner: `${BANNER.width}x${BANNER.height}`, screenshot: `${SCREENSHOT.width}x${SCREENSHOT.height} portrait`, count: `${STORE.minScreenshots}-${STORE.maxScreenshots}`, maxBytes: STORE.maxBytes }, problems };
  console.log(JSON.stringify(summary, null, 2));
  if (problems.length) process.exitCode = 1;
}

const settings = options(process.argv.slice(2));
if (settings.command !== 'verify') {
  const browser = await chromium.launch();
  try {
    if (settings.command === 'banner' || settings.command === 'all') await renderBanner(browser);
    if (settings.command === 'screenshots' || settings.command === 'all') await captureScreenshots(browser, settings);
  } finally { await browser.close(); }
}
if (settings.command === 'verify' || settings.command === 'all') await verify();
