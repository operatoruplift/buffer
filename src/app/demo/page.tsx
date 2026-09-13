import Link from 'next/link';
import { Brand } from '@/components/Brand';
import styles from './page.module.css';

export const metadata = { title: 'Watch Buffer — Demo, pitch and technical walkthrough', description: 'See Buffer in action with narrated product and technical walkthroughs.' };
const mediaRevision = '20260913';
const mediaPath = (id: string, extension: string) => `/videos/buffer-${id}${extension}?v=${mediaRevision}`;
const videos = [
  { id: 'demo', title: 'A little more perspective.', label: 'PRODUCT DEMO', description: 'Explore a sample, move prices, inspect coverage, and export a scenario report.' },
  { id: 'pitch', title: 'Make room for understanding.', label: 'THE PITCH', description: 'Why Buffer exists, with the redesigned experience and real product footage.' },
  { id: 'technical', title: 'Behind the numbers.', label: 'TECHNICAL WALKTHROUGH', description: 'Velocity, Pacifica, Jupiter inventory, precise arithmetic, and the boundaries behind every result.' },
];
export default function DemoPage() {
  return <main className={styles.page}>
    <nav className={styles.nav}><Link href="/" className={styles.brand} aria-label="Buffer home"><Brand /></Link><Link href="/app" className="button primary">Try the app →</Link></nav>
    <header className={styles.header}><span className="eyebrow">SEE THE WHOLE PICTURE</span><h1>Meet Buffer.</h1><p>A few minutes. A clearer view.</p></header>
    {videos.map(video => <section key={video.id} className={styles.film} id={video.id}>
      <div><span className="eyebrow">{video.label}</span><h2>{video.title}</h2><p>{video.description}</p></div>
      <video controls playsInline preload="metadata" poster={mediaPath(video.id, '-poster.jpg')} aria-label={video.label}>
        <source src={mediaPath(video.id, '.mp4')} type="video/mp4" />
        <track kind="captions" src={mediaPath(video.id, '.vtt')} srcLang="en" label="English" />
        Your browser does not support this video. <a href={mediaPath(video.id, '.mp4')}>Download the video</a>.
      </video>
      <div className={styles.downloads}><a href={mediaPath(video.id, '-transcript.md')}>Read transcript</a><a href={mediaPath(video.id, '.mp4')} download>Download video ↓</a></div>
    </section>)}
    <p className={styles.note}>Updated September 13, 2026. Recorded in the current app with illustrative sample positions and prices. Provider availability and modeling limits are explained in each film. English captions and transcripts are included.</p>
    <Link href="/app" className="button primary">Explore the demo yourself →</Link>
  </main>;
}
