'use client';

import { useEffect, useRef, type RefObject } from 'react';

/** Progressive decoration: HTML stays readable before observers or JavaScript run. */
export function useLandingMotion(rootRef: RefObject<HTMLDivElement | null>, paused: boolean, reduced: boolean) {
  const seen = useRef(new WeakSet<HTMLElement>());

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reveals = Array.from(root.querySelectorAll<HTMLElement>('[data-scroll-reveal]'));
    const depths = Array.from(root.querySelectorAll<HTMLElement>('[data-scroll-depth]'));
    const supported = typeof IntersectionObserver === 'function';
    const enabled = !paused && !reduced && supported;
    root.dataset.scrollMotion = reduced ? 'reduced' : paused ? 'paused' : supported ? 'active' : 'fallback';
    root.dataset.scrollVisible = String(!document.hidden);

    const settle = (element: HTMLElement) => { element.dataset.scrollState = 'shown'; };
    if (!enabled) {
      reveals.forEach(settle);
      depths.forEach(element => {
        element.style.removeProperty('--scroll-depth-y');
        element.style.removeProperty('--scroll-depth-rotate');
      });
      return;
    }

    const documentRoot = document.documentElement;
    const previousScroll = documentRoot.getAttribute('data-buffer-scroll');
    documentRoot.dataset.bufferScroll = 'smooth';
    const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
    const visibleDepths = new Set<HTMLElement>();
    let frame = 0;
    let disposed = false;

    const finish = (element: HTMLElement) => {
      const timer = timers.get(element);
      if (timer !== undefined) clearTimeout(timer);
      timers.delete(element);
      settle(element);
    };

    const revealObserver = new IntersectionObserver(entries => {
      if (disposed) return;
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        if (!entry.isIntersecting || document.hidden || seen.current.has(element)) continue;
        seen.current.add(element);
        revealObserver.unobserve(element);
        if (element.contains(document.activeElement)) {
          settle(element);
          continue;
        }
        element.dataset.scrollState = 'revealing';
        // A bounded timeout also settles fast-scroll and interrupted animations.
        timers.set(element, setTimeout(() => finish(element), 1100));
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });

    for (const element of reveals) {
      element.dataset.scrollState = seen.current.has(element) ? 'shown' : 'pending';
      if (!seen.current.has(element)) revealObserver.observe(element);
    }

    const updateDepth = () => {
      frame = 0;
      if (disposed || document.hidden) return;
      const viewport = window.innerHeight;
      const compact = window.innerWidth < 768;
      // Read stable parents together, then write only decorative transforms.
      const values = Array.from(visibleDepths, element => {
        const bounds = element.parentElement!.getBoundingClientRect();
        const progress = Math.max(-1, Math.min(1, (viewport / 2 - bounds.top - bounds.height / 2) / (viewport / 2 + bounds.height / 2)));
        const distance = element.dataset.scrollDepth === 'install' ? 28 : 20;
        return { element, y: progress * distance * (compact ? 0.5 : 1), rotation: progress * 0.8 };
      });
      for (const { element, y, rotation } of values) {
        element.style.setProperty('--scroll-depth-y', `${y.toFixed(2)}px`);
        element.style.setProperty('--scroll-depth-rotate', `${rotation.toFixed(3)}deg`);
      }
    };
    const scheduleDepth = () => {
      if (!disposed && !document.hidden && visibleDepths.size > 0 && !frame) frame = requestAnimationFrame(updateDepth);
    };
    const depthObserver = new IntersectionObserver(entries => {
      if (disposed) return;
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        if (entry.isIntersecting) visibleDepths.add(element);
        else visibleDepths.delete(element);
      }
      scheduleDepth();
    }, { rootMargin: '80px 0px', threshold: 0 });
    depths.forEach(element => depthObserver.observe(element));

    const onFocus = (event: FocusEvent) => {
      let element = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-scroll-reveal]') : null;
      while (element && root.contains(element)) {
        seen.current.add(element);
        revealObserver.unobserve(element);
        finish(element);
        element = element.parentElement?.closest<HTMLElement>('[data-scroll-reveal]') ?? null;
      }
    };
    const onVisibility = () => {
      root.dataset.scrollVisible = String(!document.hidden);
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
        for (const element of timers.keys()) finish(element);
      } else {
        for (const element of reveals) {
          if (!seen.current.has(element)) {
            revealObserver.unobserve(element);
            revealObserver.observe(element);
          }
        }
        scheduleDepth();
      }
    };
    root.addEventListener('focusin', onFocus);
    window.addEventListener('scroll', scheduleDepth, { passive: true });
    window.addEventListener('resize', scheduleDepth, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      revealObserver.disconnect();
      depthObserver.disconnect();
      cancelAnimationFrame(frame);
      for (const element of timers.keys()) finish(element);
      root.removeEventListener('focusin', onFocus);
      window.removeEventListener('scroll', scheduleDepth);
      window.removeEventListener('resize', scheduleDepth);
      document.removeEventListener('visibilitychange', onVisibility);
      if (documentRoot.dataset.bufferScroll === 'smooth') {
        if (previousScroll === null) documentRoot.removeAttribute('data-buffer-scroll');
        else documentRoot.setAttribute('data-buffer-scroll', previousScroll);
      }
    };
  }, [rootRef, paused, reduced]);
}
