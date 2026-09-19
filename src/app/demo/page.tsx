import Link from 'next/link';
import CaptionTrack from '@/components/CaptionTrack';
import { LIVE_RISK_LINK } from '@/lib/live-link';
import { Brand } from '@/components/Brand';
import styles from './page.module.css';

export const metadata = { title: 'Watch Buffer — Demo, pitch and technical walkthrough', description: 'See Buffer in action with narrated product and technical walkthroughs.' };
const mediaRevision = '20260913';
const mediaPath = (id: string, extension: string) => `/videos/buffer-${id}${extension}?v=${mediaRevision}`;
const videos = [
  { id: 'demo', title: 'A little more perspective.', label: 'PRODUCT DEMO · 1:22', description: 'Explore a preset, move prices, inspect coverage, and export a scenario report.' },
  { id: 'pitch', title: 'Make room for understanding.', label: 'THE PITCH · 0:52', description: 'Why Buffer exists, with the redesigned experience and real product footage.' },
  { id: 'technical', title: 'Behind the numbers.', label: 'TECHNICAL WALKTHROUGH · 1:46', description: 'Velocity, Pacifica, Jupiter inventory, precise arithmetic, and the boundaries behind every result.' },
];
export default function DemoPage() {
  return <main className={styles.page}>
    <nav className={styles.nav}><Link href="/" className={styles.brand} aria-label="Buffer home"><Brand /></Link><Link href="/app" className="button primary">Try the app →</Link></nav>
    <header className={styles.header}><span className="eyebrow">SEE THE WHOLE PICTURE</span><h1>Meet Buffer.</h1><p>A few minutes. A clearer view.</p></header>
    <section className={styles.currentBuild} aria-labelledby="current-build-heading">
      <div className={styles.currentBuildMarker}>CURRENT BUILD · SEPTEMBER 20, 2026</div>
      <div className={styles.currentBuildBody}>
        <div>
          <h2 id="current-build-heading">The product keeps the context attached.</h2>
          <p>The films below capture the core scenario journey. Explore a public Velocity account in the current app to see fresh maintenance headroom beside the price scenario, with the source and observation time attached.</p>
        </div>
        <Link href={LIVE_RISK_LINK} className="button secondary">Explore live risk →</Link>
      </div>
      <ul className={styles.currentBuildList}>
        <li><strong>Risk context</strong><span>Current collateral, maintenance requirement, headroom, and provider status stay separate from price-effect math.</span></li>
        <li><strong>Threshold monitor</strong><span>Live rules use protected cloud storage and fresh provider checks. Example alerts stay in a separate local rehearsal.</span></li>
        <li><strong>Honest boundaries</strong><span>Discord delivery needs a verified destination and sending activation. Provider acceptance and a matching message receipt are shown separately.</span></li>
      </ul>
    </section>
    {videos.map(video => <section key={video.id} className={styles.film} id={video.id}>
      <div><span className="eyebrow">{video.label}</span><h2>{video.title}</h2><p>{video.description}</p></div>
      <video controls playsInline preload="metadata" poster={mediaPath(video.id, '-poster.jpg')} aria-label={video.label}>
        <source src={mediaPath(video.id, '.mp4')} type="video/mp4" />
        <CaptionTrack src={mediaPath(video.id, '.vtt')} />
        Your browser does not support this video. <a href={mediaPath(video.id, '.mp4')}>Download the video</a>.
      </video>
      <div className={styles.downloads}><a href={mediaPath(video.id, '-transcript.md')}>Read transcript</a><a href={mediaPath(video.id, '.mp4')} download>Download video ↓</a></div>
    </section>)}
    <p className={styles.note}>The films were recorded September 13, 2026 with illustrative positions and prices. This page is current as of September 20, 2026; the films predate the Meridial Light landing page, direct live-risk journey, and hosted monitoring implementation. Try the current explorer above for these additions. Velocity and Pacifica support price scenarios, Jupiter Perps is inventory-only, and legacy Drift reads are paused. English captions and transcripts are included.</p>
    <Link href="/app" className="button primary">Explore the demo yourself →</Link>
  </main>;
}
