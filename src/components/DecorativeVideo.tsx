'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMotionPreference } from '@/lib/use-motion-preference';

type Props = {
  src: string; poster: string; paused?: boolean; className?: string; media?: string; name?: string;
  onVideoElement?: (element: HTMLVideoElement | null) => void;
};

/** Loads only when visible and eligible. Offscreen/hidden/reduced-motion scenes never keep playing. */
export function DecorativeVideo({ src, poster, paused = false, className, media, name, onVideoElement }: Props) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const { paused: preferencePaused, reducedMotion } = useMotionPreference();
  const [state, setState] = useState('poster');
  const attach = useCallback((element: HTMLVideoElement | null) => {
    ref.current = element;
    onVideoElement?.(element);
  }, [onVideoElement]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let disposed = false;
    let visible = false;
    let active = false;
    const query = media ? window.matchMedia(media) : null;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const eligible = () => visible && !document.hidden && !paused && !preferencePaused && !motion.matches && (!query || query.matches);
    const synchronize = () => {
      const matches = !query || query.matches;
      if (matches) video.poster = poster;
      else video.removeAttribute('poster');
      active = eligible();
      if (!active) {
        video.pause();
        if ((motion.matches || !matches) && video.hasAttribute('src')) { video.removeAttribute('src'); video.load(); }
        return;
      }
      // crossOrigin is set by React before this imperative lazy source assignment.
      if (video.getAttribute('src') !== src || video.error) { video.src = src; video.load(); }
      const playing = video.play();
      playing?.then(() => {
        if (!disposed && !eligible()) video.pause();
      }).catch(() => {
        if (!disposed && active) setState(video.error ? 'unavailable' : 'poster');
      });
    };
    const onReady = () => { if (!disposed && active && video.paused) synchronize(); };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; synchronize(); }, { threshold: 0.01 });
    if (observer) observer.observe(video);
    else { visible = true; synchronize(); }
    document.addEventListener('visibilitychange', synchronize);
    query?.addEventListener('change', synchronize);
    motion.addEventListener('change', synchronize);
    video.addEventListener('loadeddata', onReady);
    return () => {
      disposed = true;
      observer?.disconnect();
      document.removeEventListener('visibilitychange', synchronize);
      query?.removeEventListener('change', synchronize);
      motion.removeEventListener('change', synchronize);
      video.removeEventListener('loadeddata', onReady);
      video.pause();
      if (ref.current !== video) { video.removeAttribute('src'); video.load(); }
    };
  }, [src, poster, paused, preferencePaused, reducedMotion, media]);

  return <video ref={attach} crossOrigin="anonymous" poster={media ? undefined : poster} preload="none" muted loop playsInline
    aria-hidden="true" tabIndex={-1} className={className} data-media={name ?? src}
    data-video-state={state} data-reduced-motion={reducedMotion}
    onPlaying={() => setState('playing')} onPause={() => setState(current => current === 'unavailable' ? current : 'paused')}
    onError={() => setState('unavailable')}
  />;
}
