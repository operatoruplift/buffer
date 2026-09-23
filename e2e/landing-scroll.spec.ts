import { expect, test, type Locator, type Page } from '@playwright/test';

async function expectReadable(elements: Locator) {
  await expect.poll(() => elements.evaluateAll(nodes => nodes.every(element => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return Number(style.opacity) === 1 && style.visibility === 'visible' && bounds.width > 0 && bounds.height > 0;
  }))).toBe(true);
}

async function scrollToCenter(element: Locator, offset = 0) {
  await element.evaluate((node, shift) => {
    const bounds = node.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + bounds.top + bounds.height / 2 - window.innerHeight / 2 + shift, behavior: 'instant' });
  }, offset);
}

async function depthValue(element: Locator) {
  return element.evaluate(node => ({
    y: Number.parseFloat((node as HTMLElement).style.getPropertyValue('--scroll-depth-y')),
    rotation: Number.parseFloat((node as HTMLElement).style.getPropertyValue('--scroll-depth-rotate')),
  }));
}

async function expectAnchorAligned(section: Locator) {
  await expect.poll(() => section.evaluate(element => {
    const margin = Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
    return Math.abs(element.getBoundingClientRect().top - margin);
  })).toBeLessThan(3);
}

test('native section links scroll smoothly, unlock the mobile sheet and clean up on route exit', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('.buffer-site')).toHaveAttribute('data-scroll-motion', 'active');
  await expect(page.locator('html')).toHaveAttribute('data-buffer-scroll', 'smooth');
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'smooth');
  await page.evaluate(() => {
    const state = window as Window & { bufferScrollSamples?: number[] };
    state.bufferScrollSamples = [window.scrollY];
    window.addEventListener('scroll', () => {
      if (state.bufferScrollSamples!.length < 240) state.bufferScrollSamples!.push(window.scrollY);
    }, { passive: true });
  });
  const opener = page.getByRole('button', { name: 'Open navigation', exact: true });
  if (await opener.isVisible()) {
    await opener.click();
    const sheet = page.getByRole('dialog', { name: 'Navigation', exact: true });
    await expect(sheet).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    await sheet.getByRole('link', { name: 'How it works', exact: true }).click();
    await expect(sheet).not.toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  } else {
    await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'How it works', exact: true }).click();
  }
  await expect(page).toHaveURL(/\/#method$/);
  await expectAnchorAligned(page.locator('#method'));
  const samples = await page.evaluate(() => (window as Window & { bufferScrollSamples?: number[] }).bufferScrollSamples ?? []);
  const start = samples[0];
  const end = await page.evaluate(() => window.scrollY);
  expect(new Set(samples.filter(value => value > start + 2 && value < end - 2)).size).toBeGreaterThan(2);
  await expect(page.locator('.buffer-site')).toHaveCSS('transform', 'none');
  await page.locator('.buffer-last-call').getByRole('link', { name: 'Explore Buffer', exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator('html')).not.toHaveAttribute('data-buffer-scroll', 'smooth');
  await expect(page.locator('html')).not.toHaveCSS('scroll-behavior', 'smooth');
});

test('decorative depth follows the viewport within its bounds and stops when motion is paused', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('.buffer-site')).toHaveAttribute('data-scroll-motion', 'active');
  for (const [name, distance] of [['coverage', 20], ['install', 28]] as const) {
    const decoration = page.locator(`[data-scroll-depth="${name}"]`);
    const parent = decoration.locator('..');
    await scrollToCenter(parent, -100);
    await expect.poll(async () => Number.isFinite((await depthValue(decoration)).y)).toBe(true);
    const before = await depthValue(decoration);
    await scrollToCenter(parent, 100);
    await expect.poll(async () => Math.abs((await depthValue(decoration)).y - before.y)).toBeGreaterThan(.5);
    const after = await depthValue(decoration);
    const maximum = distance * (page.viewportSize()!.width < 768 ? .5 : 1);
    for (const sample of [before, after]) {
      expect(Math.abs(sample.y)).toBeLessThanOrEqual(maximum);
      expect(Math.abs(sample.rotation)).toBeLessThanOrEqual(.8);
    }
  }
  await page.locator('#install').getByRole('button', { name: 'Pause page animations', exact: true }).click();
  await expect(page.locator('.buffer-site')).toHaveAttribute('data-scroll-motion', 'paused');
  await expect(page.locator('html')).not.toHaveAttribute('data-buffer-scroll', 'smooth');
  await scrollToCenter(page.locator('.buffer-coverage-art'));
  const decorations = page.locator('[data-scroll-depth]');
  await expect.poll(() => decorations.evaluateAll(nodes => nodes.every(node => {
    const style = (node as HTMLElement).style;
    return style.getPropertyValue('--scroll-depth-y') === '' && style.getPropertyValue('--scroll-depth-rotate') === '';
  }))).toBe(true);
  await expectReadable(page.locator('[data-scroll-reveal]'));
});

test('rapid forward and reverse scrolling completes editorial reveals without replaying or hiding content', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('.buffer-site')).toHaveAttribute('data-scroll-motion', 'active');
  const finalTitle = page.locator('.buffer-last-call h2');
  await expect(finalTitle).toHaveAttribute('data-scroll-state', 'pending');
  expect(await finalTitle.evaluate(node => node.getAnimations().length)).toBe(0);
  const reveals = page.locator('[data-scroll-reveal]');
  const count = await reveals.count();
  expect(count).toBeGreaterThan(8);
  // Two native frames deliver each intersection, without waiting for the
  // entrance duration before immediately moving to the next section.
  for (let index = 0; index < count; index++) {
    await scrollToCenter(reveals.nth(index));
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  }
  for (const index of [count - 1, Math.floor(count / 2), 0, count - 1]) {
    await scrollToCenter(reveals.nth(index));
  }
  await expect.poll(() => reveals.evaluateAll(nodes => nodes.every(node => (node as HTMLElement).dataset.scrollState === 'shown'))).toBe(true);
  await expectReadable(reveals);
  await scrollToCenter(page.locator('#method'));
  await scrollToCenter(finalTitle);
  await expect(finalTitle).toHaveAttribute('data-scroll-state', 'shown');
  expect(await finalTitle.evaluate(node => node.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const fallback of ['reduced motion', 'missing IntersectionObserver'] as const) {
  test(`${fallback} keeps every section readable and native links usable`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: fallback === 'reduced motion' ? 'reduce' : 'no-preference' });
    if (fallback === 'missing IntersectionObserver') {
      await page.addInitScript(() => { Object.defineProperty(window, 'IntersectionObserver', { value: undefined, configurable: true }); });
    }
    await page.goto('/');
    await expect(page.locator('.buffer-site')).toHaveAttribute('data-scroll-motion', fallback === 'reduced motion' ? 'reduced' : 'fallback');
    await expect(page.locator('html')).not.toHaveAttribute('data-buffer-scroll', 'smooth');
    await expectReadable(page.locator('[data-scroll-reveal]'));
    await page.getByRole('navigation', { name: 'Footer product navigation', exact: true }).getByRole('link', { name: 'Method', exact: true }).click();
    await expect(page).toHaveURL(/\/#method$/);
    await expectAnchorAligned(page.locator('#method'));
    await page.locator('#faq summary').filter({ hasText: 'What does Buffer calculate?' }).click();
    await expect(page.locator('#faq details').first()).toHaveAttribute('open');
    await expect(page.locator('#faq details').first().locator('p')).toBeVisible();
  });
}

test.describe('server-rendered landing without JavaScript', () => {
  test.use({ javaScriptEnabled: false, reducedMotion: 'no-preference' });
  test('editorial content, native anchors and disclosure answers remain available', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectReadable(page.locator('[data-scroll-reveal]'));
    await expect(page.locator('html')).not.toHaveAttribute('data-buffer-scroll', 'smooth');
    await page.getByRole('navigation', { name: 'Footer product navigation', exact: true }).getByRole('link', { name: 'Method', exact: true }).click();
    await expect(page).toHaveURL(/\/#method$/);
    await expectAnchorAligned(page.locator('#method'));
    await page.locator('#faq summary').filter({ hasText: 'Do I need a wallet or an account?' }).click();
    await expect(page.locator('#faq details').nth(1)).toHaveAttribute('open');
    await expect(page.locator('#faq details').nth(1).locator('p')).toBeVisible();
    await page.locator('.buffer-last-call').getByRole('link', { name: 'Explore Buffer', exact: true }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('main')).toBeVisible();
  });
});

async function holdFeatureEntrance(page: Page, card: Locator) {
  // Hold the controller's completion timer while leaving browser focus,
  // intersection delivery and the real CSS animation intact.
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 1000));
  await card.evaluate(element => {
    const state = window as Window & { bufferHeldFeature?: boolean; bufferFeatureHoldError?: string };
    const observer = new MutationObserver(() => {
      if ((element as HTMLElement).dataset.scrollState !== 'revealing') return;
      observer.disconnect();
      const animations = element.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSAnimation);
      if (!animations.some(animation => (animation.effect as KeyframeEffect | null)?.target === element)) {
        state.bufferFeatureHoldError = 'The feature card entrance did not start.';
        return;
      }
      for (const animation of animations) {
        animation.pause();
        animation.currentTime = Number(animation.effect!.getTiming().delay);
      }
      state.bufferHeldFeature = true;
    });
    observer.observe(element, { attributes: true, attributeFilter: ['data-scroll-state'] });
  });
  await scrollToCenter(card);
  await expect.poll(() => page.evaluate(() => {
    const state = window as Window & { bufferHeldFeature?: boolean; bufferFeatureHoldError?: string };
    return state.bufferFeatureHoldError ?? state.bufferHeldFeature;
  })).toBe(true);
}

test('feature links keep a stable hitbox during entrance and activate on the first pointer or keyboard attempt', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install();
  for (const input of ['pointer', 'keyboard'] as const) {
    await page.goto('/');
    await expect(page.locator('.buffer-site')).toHaveAttribute('data-scroll-motion', 'active');
    const card = page.locator('[data-feature-card]').first();
    const link = card.getByRole('link', { name: 'Explore positions', exact: true });
    await holdFeatureEntrance(page, card);
    await expect(card).toHaveCSS('transform', 'none');
    await expect(link).toHaveCSS('transform', 'none');
    if (input === 'pointer') {
      await link.click();
    } else {
      // Begin at the preceding real control; the first Tab must expose the
      // feature CTA and its content, then the first Enter must follow it.
      await page.locator('.buffer-hero-stage').getByRole('button', { name: 'Pause page animations', exact: true }).focus();
      await page.keyboard.press('Tab');
      await expect(link).toBeFocused();
      await expect(card).toHaveCSS('opacity', '1');
      await expect(link).toHaveCSS('opacity', '1');
      await page.keyboard.press('Enter');
    }
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.locator('html')).not.toHaveAttribute('data-buffer-scroll', 'smooth');
    await page.clock.resume();
  }
});
