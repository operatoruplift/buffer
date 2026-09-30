import Link from 'next/link';
import CaptionTrack from '@/components/CaptionTrack';
import { LIVE_RISK_LINK } from '@/lib/live-link';
import { Brand } from '@/components/Brand';
import videoMetadata from '../../../videos/metadata.json';
import styles from './page.module.css';

export const metadata = {
  title: 'Watch Buffer — A clearer view, in a few minutes',
  description: 'Explore the Buffer workspace with current product footage, a short pitch, and an inspectable technical walkthrough.',
};
const mediaRevision = '20260930';
const mediaPath = (id: string, extension: string) => `/videos/buffer-${id}${extension}?v=${mediaRevision}`;
const films = [
  { id: 'demo', title: 'Your next what-if, made clear.', label: 'Product walkthrough', description: 'Explore the workspace, shape a portfolio, open a public mainnet observation, and keep the explanation in a report.', topics: ['The workspace', 'Price scenarios', 'Public mainnet', 'Reports'] },
  { id: 'pitch', title: 'A little more perspective.', label: 'The pitch', description: 'Why Buffer exists, and how a calmer workspace can make perpetual exposure easier to understand.', topics: ['The idea', 'Risk in context', 'On every screen'] },
  { id: 'technical', title: 'Understand what powers the view.', label: 'Technical walkthrough', description: 'Follow a provider observation through identity checks, exact scenario math, risk estimates, monitoring, and portable reports.', topics: ['Verified reads', 'Exact arithmetic', 'Model boundaries', 'Monitoring'] },
] as const;
function runtime(id: typeof films[number]['id']) {
  const seconds = Math.round(videoMetadata[`buffer-${id}`].duration);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function DemoPage() {
  return <main className={styles.page}>
    <nav className={styles.nav} aria-label="Watch page navigation">
      <Link href="/" className={styles.brand} aria-label="Buffer home"><Brand /></Link>
      <Link href="/app" className={styles.navAction}>Open the app <span aria-hidden="true">↗</span></Link>
    </nav>
    <header className={styles.header}>
      <div className={styles.headerCopy}>
        <span className={styles.eyebrow}><span className={styles.statusDot} /> A closer look at Buffer</span>
        <h1>Meet Buffer.<br /><span>Find your perspective.</span></h1>
        <p>A few minutes inside a calmer workspace for your perpetual positions. See the product, follow the idea, or go behind the numbers.</p>
        <div className={styles.headerActions}>
          <a href="#demo" className="button primary"><span aria-hidden="true">▶</span> Watch the walkthrough</a>
          <Link href={LIVE_RISK_LINK} className={styles.textLink}>Explore live risk <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
      <nav className={styles.index} aria-label="Choose a film">
        {films.map((film, i) => <a key={film.id} href={`#${film.id}`} className={styles.indexItem}>
          <span className={styles.indexNumber}>0{i + 1}</span>
          <span><strong>{film.label}</strong><small>{runtime(film.id)} · English captions</small></span>
          <span className={styles.indexArrow} aria-hidden="true">↘</span>
        </a>)}
      </nav>
    </header>
    <div className={styles.library}>
      {films.map((film, i) => <section key={film.id} className={styles.film} id={film.id} aria-labelledby={`${film.id}-heading`}>
        <div className={styles.filmHeading}>
          <div><span className={styles.eyebrow}>0{i + 1} / {film.label} <span className={styles.duration}>{runtime(film.id)}</span></span><h2 id={`${film.id}-heading`}>{film.title}</h2></div>
          <p>{film.description}</p>
        </div>
        <div className={styles.player}>
          <video controls playsInline preload="metadata" poster={mediaPath(film.id, '-poster.jpg')} aria-label={`${film.label} · ${runtime(film.id)}`}>
            <source src={mediaPath(film.id, '.mp4')} type="video/mp4" />
            <CaptionTrack src={mediaPath(film.id, '.vtt')} />
            Your browser does not support this video. <a href={mediaPath(film.id, '.mp4')}>Download the video</a>.
          </video>
        </div>
        <div className={styles.filmFooter}>
          <ul className={styles.topics} aria-label="In this film">{film.topics.map(topic => <li key={topic}>{topic}</li>)}</ul>
          <div className={styles.downloads}><a href={mediaPath(film.id, '-transcript.md')}>Read transcript</a><a href={mediaPath(film.id, '.mp4')} download>Download video <span aria-hidden="true">↓</span></a></div>
        </div>
      </section>)}
    </div>
    <aside className={styles.context} aria-labelledby="recording-context-heading">
      <div><span className={styles.eyebrow}>What you&apos;re seeing</span><h2 id="recording-context-heading">Real screens.<br />Context kept close.</h2></div>
      <div><p>Recorded September 30, 2026 from the Buffer app. Illustrative portfolios and public Solana mainnet observations are identified in the films. Live values belong to their capture time and can change.</p><p>Velocity and Pacifica support price scenarios; Jupiter provides inventory only. Liquidation estimates have a separate, stated model. Monitoring setup is shown without staging authentication or recipient delivery. English captions, transcripts, and downloadable videos are included.</p></div>
    </aside>
    <section className={styles.closing} aria-labelledby="try-buffer-heading"><div><span className={styles.eyebrow}>Your turn</span><h2 id="try-buffer-heading">Make room for your next what-if.</h2></div><Link href="/app" className="button primary">Open Buffer <span aria-hidden="true">↗</span></Link></section>
    <footer className={styles.footer}><Link href="/" aria-label="Buffer home"><Brand /></Link><span>A little more perspective.</span><Link href="/brand-kit">Brand kit <span aria-hidden="true">↗</span></Link></footer>
  </main>;
}
