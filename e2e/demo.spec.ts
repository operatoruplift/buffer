import { expect, test } from '@playwright/test';

test('all three narrated videos decode, play and seek with captions available', async ({ page, request }) => {
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Meet Buffer. Find your perspective.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Watch the walkthrough' })).toHaveAttribute('href', '#demo');
  const videos = page.getByRole('region', { name: 'Narrated walkthroughs', exact: true }).locator('video');
  await expect(videos).toHaveCount(3);
  // The product prepares every native track without displaying captions or
  // waiting for a later film to compete with earlier media range downloads.
  await expect.poll(() => videos.evaluateAll((elements) => elements.map((element) => {
    const video = element as HTMLVideoElement;
    return { ready: video.querySelector('track')?.readyState, mode: video.textTracks[0].mode };
  }))).toEqual(Array.from({ length: 3 }, () => ({ ready: 2, mode: 'hidden' })));
  for (const video of await videos.all()) {
    await video.scrollIntoViewIfNeeded();
    await video.evaluate((element: HTMLVideoElement) => {
      element.muted = true;
      element.textTracks[0].mode = 'showing';
    });
    // Caption loading is independent of video playback and seeking. Wait for the
    // browser's track loader before checking active cues at the seek destination.
    await expect.poll(() => video.locator('track').evaluate((element: HTMLTrackElement) => element.readyState)).toBe(2);
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.textTracks[0].cues?.length ?? 0)).toBeGreaterThan(0);
    await video.evaluate((element: HTMLVideoElement) => element.play());
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
    await video.evaluate((element: HTMLVideoElement) => new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Video seek did not complete')), 10_000);
      element.addEventListener('seeked', () => { clearTimeout(timeout); resolve(); }, { once: true });
      element.currentTime = 10;
    }));
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(10);
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.textTracks[0].activeCues?.length ?? 0)).toBeGreaterThan(0);
    const state = await video.evaluate((element: HTMLVideoElement) => ({ width: element.videoWidth, height: element.videoHeight, error: element.error?.message }));
    expect(state).toEqual({ width: 1920, height: 1080, error: undefined });
    await video.evaluate((element: HTMLVideoElement) => element.pause());
    const track = await video.locator('track').getAttribute('src');
    const response = await request.get(track!);
    expect(response.ok()).toBe(true);
    const captions = await response.text();
    expect(captions).toMatch(/^WEBVTT/);
    expect(captions).toContain('Jupiter');
  }
  const transcripts = page.getByRole('link', { name: 'Read transcript', exact: true });
  await expect(transcripts).toHaveCount(3);
  for (const link of await transcripts.all()) {
    const response = await request.get((await link.getAttribute('href'))!);
    expect(response.ok()).toBe(true);
    const transcript = await response.text();
    expect(transcript).toMatch(/^# Buffer /);
    expect(transcript).toContain('Jupiter');
    expect(transcript).toContain('September 30, 2026');
    expect(transcript).toContain('Niki');
    expect(transcript).toContain('Public Solana mainnet observation');
  }
  const width = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(width.document).toBeLessThanOrEqual(width.viewport);
});

test('the landing launch-film link opens an optional player that decodes, plays and seeks', async ({ page, request }) => {
  await page.goto('/');
  const launchLink = page.getByRole('link', { name: 'Watch the launch film 30 sec', exact: true });
  await expect(launchLink).toHaveAttribute('href', '/demo#launch');
  await launchLink.click();
  await expect(page).toHaveURL(/\/demo#launch$/);
  const launch = page.getByRole('region', { name: 'A clearer picture. In thirty seconds.', exact: true });
  const video = launch.locator('video');
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute('preload', 'none');
  await expect(video).toHaveAttribute('controls', '');
  await expect(video).toHaveAttribute('playsinline', '');
  await expect(video).not.toHaveAttribute('autoplay');
  await expect(video).toHaveAccessibleDescription(/Illustrative positions and fixed prices, with music and interface sounds/);
  expect(await video.evaluate((element: HTMLVideoElement) => ({ paused: element.paused, muted: element.muted, time: element.currentTime }))).toEqual({ paused: true, muted: false, time: 0 });
  await expect(video.locator('track')).toHaveCount(0);
  await video.evaluate((element: HTMLVideoElement) => {
    element.muted = true;
    return element.play();
  });
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
  await video.evaluate((element: HTMLVideoElement) => new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Launch-film seek did not complete')), 10_000);
    element.addEventListener('seeked', () => { clearTimeout(timeout); resolve(); }, { once: true });
    element.currentTime = 24;
  }));
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(24);
  const state = await video.evaluate((element: HTMLVideoElement) => ({ width: element.videoWidth, height: element.videoHeight, duration: element.duration, error: element.error?.message }));
  expect(state).toEqual({ width: 1920, height: 1080, duration: 30, error: undefined });
  await video.evaluate((element: HTMLVideoElement) => element.pause());
  await launch.getByText('Read the visual story', { exact: false }).click();
  await expect(launch.getByText(/Four illustrative positions show a combined \+1,000 USDC/)).toBeVisible();
  const download = launch.getByRole('link', { name: 'Download launch film', exact: false });
  await expect(download).toHaveAttribute('download', '');
  await expect(download).toHaveAttribute('href', '/videos/buffer-launch.mp4?v=20261001');
  const response = await request.get((await download.getAttribute('href'))!, { headers: { Range: 'bytes=0-1023' } });
  expect(response.status()).toBe(206);
  expect(response.headers()['content-type']).toContain('video/mp4');
  const geometry = await video.evaluate((element: HTMLVideoElement) => ({ videoWidth: element.getBoundingClientRect().width, documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth }));
  expect(geometry.videoWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
});
