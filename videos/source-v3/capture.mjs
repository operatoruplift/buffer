/** Actual public UI recordings. Optional public-read passthrough; no fabricated data. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const origin = process.env.BUFFER_CAPTURE_URL || 'http://127.0.0.1:3001';
const readOrigin = process.env.BUFFER_CAPTURE_READ_ORIGIN || origin;
const selected = process.env.BUFFER_CAPTURE_ONLY?.split(',');
const live = '/app?protocol=velocity&authority=DxoRJ4f5XRMvXU9SGuM4ZziBFUxbhB3ubur5sVZEvue2';
const wait = (page, ms) => page.waitForTimeout(ms);
async function frame(page, selector, offset = 142, smooth = true) {
  console.log(JSON.stringify({ event: 'frame', selector, url: page.url() }));
  await page.locator(selector).first().evaluate((el, { offset, smooth }) => {
    window.scrollTo({ top: Math.max(0, window.scrollY + el.getBoundingClientRect().top - offset), behavior: smooth ? 'smooth' : 'instant' });
  }, { offset, smooth });
  await wait(page, smooth ? 1300 : 350);
}
async function liveReady(page) {
  await page.locator('.risk-context[data-risk-status="clear"], .risk-context[data-risk-status="maintenance"], .risk-context[data-risk-status="liquidating"]').waitFor({ timeout: 60_000 });
  const value = (await page.getByTestId('current-headroom').innerText()).trim();
  if (!/USD$/.test(value)) throw new Error('A current eligible mainnet risk observation is required');
}
async function presentationReady(page) {
  const warning = page.getByText('Live reads require server RPC configuration. Explore the presets below.', { exact: true });
  if (!await warning.count()) return;
  const box = await warning.first().boundingBox();
  if (box && box.y < page.viewportSize().height && box.y + box.height > 0) {
    throw new Error('The recording exposes local-only RPC setup copy. Configure the production-build server before capturing this view.');
  }
}
const clips = [
  { id: 'hero', route: '/', kind: 'landing', setup: async p => {
    await p.waitForFunction(() => Array.from(document.querySelectorAll('video')).some(v => !v.paused && v.currentTime > .3));
  }, action: async p => { await wait(p, 7000); await p.mouse.wheel(0, 210); } },
  { id: 'overview', kind: 'illustrative', action: async p => {
    await wait(p, 3500); await p.locator('a[href="#app-positions"]').click(); await wait(p, 5000);
    await p.locator('a[href="#app-overview"]').click();
  } },
  { id: 'scenario', kind: 'illustrative', setup: p => frame(p, '#app-scenario', 160, false), action: async p => {
    await wait(p, 2800); await p.getByRole('button', { name: '-10%', exact: true }).click();
    await wait(p, 5500); await frame(p, '.contributions', 172); await wait(p, 4500);
    await frame(p, '#app-scenario', 160);
  } },
  { id: 'editor', kind: 'illustrative', setup: p => frame(p, '#app-positions', 152, false), action: async p => {
    await wait(p, 2000); await p.getByRole('button', { name: 'Add perps', exact: false }).click();
    await p.getByLabel('Search perpetuals', { exact: true }).fill('HYPE'); await wait(p, 3500);
    await p.getByRole('button', { name: 'Add HYPE-PERP', exact: true }).click(); await wait(p, 4000);
    await p.getByRole('button', { name: 'Done', exact: true }).click(); await wait(p, 3000);
  } },
  { id: 'live', route: live, kind: 'public-mainnet', setup: async p => { await liveReady(p); await frame(p, '#app-overview', 145, false); }, action: async p => {
    await wait(p, 6500); await frame(p, '.risk-context', 165);
  } },
  { id: 'risk', route: live, kind: 'public-mainnet', setup: async p => { await liveReady(p); await frame(p, '.risk-context', 158, false); }, action: async p => {
    await wait(p, 6000); await p.locator('.liquidation-assumptions > summary').click();
    await wait(p, 5000); await frame(p, '.liquidation-estimate', 170);
  } },
  { id: 'method', route: live, kind: 'public-mainnet', setup: async p => { await liveReady(p); }, action: async p => {
    await wait(p, 1800); await p.getByRole('button', { name: 'Method', exact: true }).click(); await wait(p, 6500);
    await p.getByRole('dialog', { name: 'Method & coverage' }).evaluate(el => el.scrollBy({ top: 440, behavior: 'smooth' }));
  } },
  { id: 'providers', kind: 'capabilities', setup: async p => {
    await p.getByRole('combobox', { name: 'Protocol', exact: true }).click(); await wait(p, 6000);
    await p.getByRole('option', { name: /^Pacifica/ }).click();
    await frame(p, '.address-panel', 152, false);
  }, action: async p => {
    await wait(p, 4500); await p.getByRole('combobox', { name: 'Protocol', exact: true }).click(); await wait(p, 6000);
    await p.getByRole('option', { name: /^Jupiter Perps/ }).click();
  } },
  { id: 'monitoring', route: live, kind: 'public-mainnet', setup: async p => {
    await liveReady(p); await p.locator('a[href="#monitoring"]').click(); await wait(p, 1400);
  }, action: async p => {
    await wait(p, 6500); await frame(p, '.risk-context', 164); await wait(p, 4000);
    await p.locator('a[href="#monitoring"]').click(); await wait(p, 1400);
  } },
  { id: 'report', kind: 'illustrative', setup: async p => { await p.getByRole('button', { name: '-10%', exact: true }).click(); }, action: async p => {
    await p.getByRole('button', { name: 'My reports', exact: true }).click(); await wait(p, 2000);
    await p.getByRole('button', { name: 'Save current scenario', exact: true }).click(); await wait(p, 6500);
    const event = p.waitForEvent('download'); await p.getByRole('button', { name: 'Download JSON', exact: true }).click();
    await (await event).saveAs(path.join(root, 'illustrative-report.json'));
    await wait(p, 5500);
  } },
  { id: 'mobile', kind: 'illustrative', mobile: true, action: async p => {
    await wait(p, 2500); await p.locator('a[href="#app-scenario"]').click(); await wait(p, 3000);
    await p.getByRole('button', { name: '-10%', exact: true }).click(); await wait(p, 5000);
    await p.locator('a[href="#app-positions"]').click();
  } },
];

const manifestFile = path.join(root, 'capture-metadata.json');
let manifest = { revision: '20260930', origin, readOrigin, recordedAt: new Date().toISOString(), clips: [] };
try { manifest = { ...JSON.parse(await fs.readFile(manifestFile, 'utf8')), origin, readOrigin, recordedAt: new Date().toISOString() }; } catch (error) { if (error.code !== 'ENOENT') throw error; }
const browser = await chromium.launch();
try {
  for (const clip of clips.filter(clip => !selected || selected.includes(clip.id))) {
    const viewport = clip.mobile ? { width: 390, height: 844 } : { width: 1600, height: 900 };
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: !!clip.mobile, hasTouch: !!clip.mobile, reducedMotion: 'no-preference', recordVideo: { dir: root, size: viewport } });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.setDefaultNavigationTimeout(60_000);
    const errors = []; const observations = [];
    const navigations = [];
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
    if (readOrigin !== origin) await page.route('**/api/{accounts,snapshot}?**', async route => {
      const incoming = new URL(route.request().url());
      if (route.request().method() !== 'GET' || !['/api/accounts', '/api/snapshot'].includes(incoming.pathname)) throw new Error('Only public provider reads may use the production read origin');
      const response = await context.request.get(`${readOrigin}${incoming.pathname}${incoming.search}`, { timeout: 60_000 });
      await route.fulfill({ response });
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', async response => {
      if (!/\/api\/snapshot\?/.test(response.url())) return;
      try {
        const body = await response.json();
        observations.push({ status: response.status(), readOrigin, network: body.network, source: body.source, protocol: body.protocol?.id, authority: body.authority, retrievedAt: body.retrievedAt, expiresAt: body.expiresAt });
      } catch { observations.push({ status: response.status(), error: 'Snapshot response did not decode' }); }
    });
    let saved = false;
    try {
      await page.goto(`${origin}${clip.route || '/app'}`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => document.fonts.ready);
      if (clip.id !== 'hero') await page.locator('#app-overview').waitFor();
      await clip.setup?.(page); await page.mouse.move(viewport.width - 5, viewport.height - 5); await wait(page, 700);
      await presentationReady(page);
      const start = Date.now();
      await page.screenshot({ path: path.join(root, `${clip.id}-start.png`) });
      await clip.action?.(page);
      await wait(page, Math.max(1200, 25_000 - (Date.now() - start)));
      await presentationReady(page);
      await page.screenshot({ path: path.join(root, `${clip.id}-end.png`) });
      await fs.writeFile(path.join(root, `${clip.id}-visible.txt`), await page.locator('body').innerText());
      if (errors.length) throw new Error(`${clip.id}: ${errors.join('; ')}`);
      if (clip.kind === 'public-mainnet' && !observations.some(o => o.status === 200 && o.network === 'mainnet-beta' && o.source === 'live')) throw new Error(`${clip.id}: verified mainnet snapshot response is missing`);
      const end = Date.now(); const video = page.video(); await context.close();
      await video.saveAs(path.join(root, `${clip.id}.webm`)); await video.delete(); saved = true;
      const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', path.join(root, `${clip.id}.webm`)]);
      const totalSeconds = Number(JSON.parse(stdout).format.duration);
      const usableSeconds = (end - start) / 1000;
      const item = { id: clip.id, path: `${clip.id}.webm`, kind: clip.kind, origin, readOrigin, viewport, totalSeconds, trimStartSeconds: Math.max(0, totalSeconds - usableSeconds + .1), usableSeconds: usableSeconds - .2, capturedAt: new Date(start).toISOString(), observations, errors };
      manifest.clips = manifest.clips.filter(item => item.id !== clip.id).concat(item);
      await fs.writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
      console.log(JSON.stringify(item));
    } catch (error) {
      const diagnostic = { id: clip.id, url: page.url(), errors, navigations, message: String(error), body: (await page.locator('body').innerText().catch(() => '')).slice(0,12_000) };
      await fs.writeFile(path.join(root, `${clip.id}-failure.json`), JSON.stringify(diagnostic, null, 2));
      await page.screenshot({ path: path.join(root, `${clip.id}-failure.png`) }).catch(() => {});
      console.error(JSON.stringify({ ...diagnostic, body: diagnostic.body.slice(0,1800) }));
      throw error;
    } finally { if (!saved) { const video = page.video(); await context.close(); await video?.delete(); } }
  }
} finally { await browser.close(); }
