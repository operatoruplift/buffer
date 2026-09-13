import { expect, test } from '@playwright/test';

test('all three hosted videos decode, play and seek with captions available', async ({ page, request }) => {
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Meet Buffer.' })).toBeVisible();
  const videos = page.locator('video');
  await expect(videos).toHaveCount(3);
  for (const video of await videos.all()) {
    await video.scrollIntoViewIfNeeded();
    await video.evaluate(async (element: HTMLVideoElement) => {
      element.muted = true;
      element.textTracks[0].mode = 'showing';
      await element.play();
    });
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
    await video.evaluate((element: HTMLVideoElement) => new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Video seek did not complete')), 10_000);
      element.addEventListener('seeked', () => { clearTimeout(timeout); resolve(); }, { once: true });
      element.currentTime = 10;
    }));
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(10);
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.textTracks[0].activeCues?.length ?? 0)).toBeGreaterThan(0);
    const state = await video.evaluate((element: HTMLVideoElement) => ({ width: element.videoWidth, height: element.videoHeight, error: element.error?.message }));
    expect(state).toEqual({ width: 1600, height: 900, error: undefined });
    await video.evaluate((element: HTMLVideoElement) => element.pause());
    const track = await video.locator('track').getAttribute('src');
    const response = await request.get(track!);
    expect(response.ok()).toBe(true);
    const captions = await response.text();
    expect(captions).toMatch(/^WEBVTT/);
    expect(captions).toContain('Jupiter');
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.textTracks[0].cues?.length ?? 0)).toBeGreaterThan(0);
  }
  const transcripts = page.getByRole('link', { name: 'Read transcript', exact: true });
  await expect(transcripts).toHaveCount(3);
  for (const link of await transcripts.all()) {
    const response = await request.get((await link.getAttribute('href'))!);
    expect(response.ok()).toBe(true);
    const transcript = await response.text();
    expect(transcript).toMatch(/^# Buffer /);
    expect(transcript).toContain('Jupiter');
    expect(transcript).toContain('September 13, 2026');
  }
  const width = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
});
