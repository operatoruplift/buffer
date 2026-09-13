'use client';

import { useEffect, useRef } from 'react';
import { coverTransform, createRefractionMap, refractFrame, type RefractionMap } from '@/lib/liquid-glass';
import styles from './LiquidGlass.module.css';

type LiquidGlassProps = {
  video: HTMLVideoElement | null;
  paused: boolean;
  reducedMotion: boolean;
};

export function LiquidGlass({ video, paused, reducedMotion }: LiquidGlassProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const surface = surfaceRef.current;
    const canvas = canvasRef.current;
    if (!surface || !canvas) return;
    surface.dataset.refraction = reducedMotion ? 'reduced' : 'waiting';
    if (!video || reducedMotion) return;
    const context = canvas.getContext('2d');
    const sourceCanvas = document.createElement('canvas');
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!context || !sourceContext) {
      surface.dataset.refraction = 'unavailable';
      return;
    }

    let map: RefractionMap | null = null;
    let output: ImageData | null = null;
    let disposed = false;
    let failed = false;
    let visible = !('IntersectionObserver' in window);
    let videoFrame: number | null = null;
    let animationFrame: number | null = null;
    let redrawTimer: number | null = null;
    let lastPaint = -Infinity;
    let lastMediaTime = -1;
    let frames = Number(canvas.dataset.frames || 0);
    const canPaint = () => !disposed && !failed && visible && !document.hidden;
    const canAnimate = () => canPaint() && !paused && !video.paused && !video.ended;

    function cancelFrame() {
      if (videoFrame !== null) video!.cancelVideoFrameCallback(videoFrame);
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      videoFrame = null;
      animationFrame = null;
    }

    function paint(now: number, force = false) {
      if (!canPaint() || video!.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video!.videoWidth) return;
      if (!force && (now - lastPaint < 1000 / 24 || video!.currentTime === lastMediaTime)) return;
      const cardRect = surface!.getBoundingClientRect();
      const videoRect = video!.getBoundingClientRect();
      if (cardRect.width < 1 || cardRect.height < 1 || videoRect.width < 1 || videoRect.height < 1) return;
      try {
        if (!map || Math.abs(map.width / map.scaleX - cardRect.width) > 0.5 || Math.abs(map.height / map.scaleY - cardRect.height) > 0.5) {
          map = createRefractionMap(cardRect.width, cardRect.height);
          canvas!.width = map.width;
          canvas!.height = map.height;
          sourceCanvas.width = map.sourceWidth;
          sourceCanvas.height = map.sourceHeight;
          output = context!.createImageData(map.width, map.height);
        }
        const cover = coverTransform(video!.videoWidth, video!.videoHeight, videoRect.width, videoRect.height);
        sourceContext!.clearRect(0, 0, map.sourceWidth, map.sourceHeight);
        sourceContext!.drawImage(video!,
          (videoRect.left - cardRect.left + cover.left) * map.scaleX + map.paddingX,
          (videoRect.top - cardRect.top + cover.top) * map.scaleY + map.paddingY,
          cover.width * map.scaleX, cover.height * map.scaleY);
        // getImageData verifies that the decoded source is actually canvas-readable.
        const source = sourceContext!.getImageData(0, 0, map.sourceWidth, map.sourceHeight);
        refractFrame(source.data, map, output!.data);
        context!.putImageData(output!, 0, 0);
        surface!.dataset.refraction = paused || video!.paused ? 'still' : 'active';
        canvas!.dataset.frames = String(++frames);
        lastPaint = now;
        lastMediaTime = video!.currentTime;
      } catch {
        failed = true;
        surface!.dataset.refraction = 'unavailable';
        cancelFrame();
      }
    }

    function scheduleFrame() {
      if (!canAnimate() || videoFrame !== null || animationFrame !== null) return;
      if (typeof video!.requestVideoFrameCallback === 'function') {
        videoFrame = video!.requestVideoFrameCallback(now => {
          videoFrame = null;
          paint(now);
          scheduleFrame();
        });
      } else {
        animationFrame = requestAnimationFrame(now => {
          animationFrame = null;
          paint(now);
          scheduleFrame();
        });
      }
    }

    function update() {
      cancelFrame();
      if (redrawTimer !== null) window.clearTimeout(redrawTimer);
      redrawTimer = null;
      if (!canPaint()) return;
      const redraw = () => {
        redrawTimer = null;
        paint(performance.now(), true);
        scheduleFrame();
      };
      const remaining = 1000 / 24 - (performance.now() - lastPaint);
      if (remaining > 0) redrawTimer = window.setTimeout(redraw, remaining);
      else redraw();
    }

    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      update();
    }) : null;
    observer?.observe(surface);
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    resizeObserver?.observe(surface);
    resizeObserver?.observe(video);
    const events = ['loadeddata', 'playing', 'pause', 'seeked', 'resize'] as const;
    events.forEach(event => video.addEventListener(event, update));
    document.addEventListener('visibilitychange', update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      disposed = true;
      cancelFrame();
      if (redrawTimer !== null) window.clearTimeout(redrawTimer);
      observer?.disconnect();
      resizeObserver?.disconnect();
      events.forEach(event => video.removeEventListener(event, update));
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update);
      map = null;
      output = null;
    };
  }, [video, paused, reducedMotion]);

  return <div className={styles.surface} ref={surfaceRef} data-refraction="waiting" aria-hidden="true"><canvas ref={canvasRef} /></div>;
}
