import { expect, test, type Locator, type Page } from '@playwright/test';

async function inspectCoverage(page: Page) {
  return page.locator('.buffer-coverage-story').evaluate(story => {
    const art = story.querySelector('.buffer-coverage-art')!;
    const card = art.querySelector('.buffer-coverage-card')!;
    const copy = story.querySelector('.buffer-coverage-copy')!;
    const artBounds = art.getBoundingClientRect();
    const storyBounds = story.getBoundingClientRect();
    const cardBounds = card.getBoundingClientRect();
    const copyBounds = copy.getBoundingClientRect();
    const inside = (bounds: DOMRect, container: DOMRect) => bounds.left >= container.left - 1
      && bounds.right <= container.right + 1 && bounds.top >= container.top - 1 && bounds.bottom <= container.bottom + 1;
    const clippedText: string[] = [];
    for (const [element, containers] of [[card, [artBounds]], [copy, [copyBounds, storyBounds]]] as const) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        if (Array.from(range.getClientRects()).some(bounds => containers.some(container => !inside(bounds, container)))) {
          clippedText.push(node.textContent.trim());
        }
      }
    }
    return {
      gap: storyBounds.top - document.querySelector('#features')!.getBoundingClientRect().bottom,
      cardInside: inside(cardBounds, artBounds),
      panelsOverlap: Math.min(artBounds.right, copyBounds.right) - Math.max(artBounds.left, copyBounds.left) > 1
        && Math.min(artBounds.bottom, copyBounds.bottom) - Math.max(artBounds.top, copyBounds.top) > 1,
      clippedText,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
}

async function center(element: Locator) {
  await element.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + bounds.top + bounds.height / 2 - window.innerHeight / 2, behavior: 'instant' });
  });
}

async function expectCoverageFits(page: Page) {
  const layout = await inspectCoverage(page);
  expect(layout.gap, 'Coverage should have a visible section break after the features').toBeGreaterThanOrEqual(24);
  expect(layout.cardInside, 'The rotated coverage card should remain inside its art panel').toBe(true);
  expect(layout.panelsOverlap, 'The illustration and copy panels should not overlap').toBe(false);
  expect(layout.clippedText, 'Coverage labels and copy should not be clipped').toEqual([]);
  expect(layout.overflow, 'The page should not overflow horizontally').toBe(false);
}

for (const width of [320, 375, 652, 768, 800, 801, 1280]) {
  test(`coverage retains breathing room and readable content at ${width}px during motion and at rest`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await expect(page.locator('.buffer-site')).toHaveAttribute('data-scroll-motion', 'active');
    const art = page.locator('.buffer-coverage-art');
    const reveal = art.locator('[data-scroll-reveal]');
    await expect(reveal).toHaveAttribute('data-scroll-state', 'pending');
    await expectCoverageFits(page);

    // Sample real animation frames while the panel crosses the viewport. Page
    // width alone cannot detect content clipped by a rounded overflow surface.
    const movement = await art.evaluate(async element => {
      const card = element.querySelector('.buffer-coverage-card')!;
      const revealElement = element.querySelector<HTMLElement>('[data-scroll-reveal]')!;
      const depth = element.querySelector<HTMLElement>('[data-scroll-depth]')!;
      const startY = window.scrollY + element.getBoundingClientRect().top - window.innerHeight * .75;
      const violations: string[] = [];
      const depthPositions = new Set<string>();
      let samples = 0;
      let revealingSamples = 0;
      let start: number | undefined;
      await new Promise<void>(resolve => {
        const sample = (now: number) => {
          start ??= now;
          const progress = Math.min((now - start) / 950, 1);
          window.scrollTo({ top: startY + progress * window.innerHeight * .85, behavior: 'instant' });
          const panel = element.getBoundingClientRect();
          const inside = (bounds: DOMRect) => bounds.left >= panel.left - 1 && bounds.right <= panel.right + 1
            && bounds.top >= panel.top - 1 && bounds.bottom <= panel.bottom + 1;
          if (!inside(card.getBoundingClientRect())) violations.push('card');
          const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!node.textContent?.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            if (Array.from(range.getClientRects()).some(bounds => !inside(bounds))) violations.push(node.textContent.trim());
          }
          samples++;
          if (revealElement.dataset.scrollState === 'revealing') revealingSamples++;
          const y = depth.style.getPropertyValue('--scroll-depth-y');
          if (y) depthPositions.add(y);
          if (progress < 1) requestAnimationFrame(sample);
          else resolve();
        };
        requestAnimationFrame(sample);
      });
      return { violations: [...new Set(violations)], samples, revealingSamples, depthPositions: depthPositions.size };
    });
    expect(movement.samples).toBeGreaterThan(2);
    expect(movement.revealingSamples, 'The bounds check must include the actual entrance').toBeGreaterThan(0);
    expect(movement.depthPositions, 'The bounds check must include moving scroll depth').toBeGreaterThan(1);
    expect(movement.violations, 'Motion must not crop the card or its labels').toEqual([]);
    await expect(reveal).toHaveAttribute('data-scroll-state', 'shown');
    await expectCoverageFits(page);

    await page.locator('.buffer-coverage-copy').getByRole('link', { name: 'Read the method', exact: true }).click();
    await expect(page).toHaveURL(/\/#method$/);
    await expect.poll(() => page.locator('#method').evaluate(element => {
      const margin = Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
      return Math.abs(element.getBoundingClientRect().top - margin);
    })).toBeLessThan(3);

    await page.locator('#install').getByRole('button', { name: 'Pause page animations', exact: true }).click();
    await expect(page.locator('.buffer-site')).toHaveAttribute('data-scroll-motion', 'paused');
    await center(art);
    await expectCoverageFits(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.buffer-site')).toHaveAttribute('data-scroll-motion', 'reduced');
    await expectCoverageFits(page);
    await expect(page.getByRole('heading', { name: 'Clarity is knowing what’s left out.', exact: true })).toBeVisible();
  });
}
