'use client';

import { useEffect, useRef } from 'react';

/** Prepare native captions before playback without enabling their display. */
export default function CaptionTrack({ src }: { src: string }) {
  const ref = useRef<HTMLTrackElement>(null);

  useEffect(() => {
    const track = ref.current?.track;
    // Preserve a browser or viewer preference that already enabled captions.
    if (track?.mode === 'disabled') track.mode = 'hidden';
  }, [src]);

  return <track ref={ref} kind="captions" src={src} srcLang="en" label="English" />;
}
