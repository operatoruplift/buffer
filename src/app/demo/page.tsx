import Link from 'next/link';
import { Mark } from '@/components/Icons';
import styles from './page.module.css';

export const metadata = { title: 'Watch Buffer — Demo, pitch and technical walkthrough', description: 'See Buffer in action with narrated product and technical walkthroughs.' };
const videos = [
  { id: 'demo', title: 'A little more perspective.', label: 'PRODUCT DEMO · 1:28', description: 'Explore a sample, move prices, inspect coverage, and export a scenario report.' },
  { id: 'pitch', title: 'Make room for understanding.', label: 'THE PITCH · 1:03', description: 'Why Buffer exists, with original Higgsfield motion and real product footage.' },
  { id: 'technical', title: 'Behind the numbers.', label: 'TECHNICAL WALKTHROUGH · 2:04', description: 'The read-only architecture, data boundaries, precise arithmetic, and verification approach.' },
];
export default function DemoPage() {
  return <main className={styles.page}>
    <nav className={styles.nav}><Link href="/" className={styles.brand}><Mark />Buffer</Link><Link href="/app" className="button primary">Try the app →</Link></nav>
    <header className={styles.header}><span className="eyebrow">SEE THE WHOLE PICTURE</span><h1>Meet Buffer.</h1><p>A few minutes. A clearer view.</p></header>
    {videos.map(video => <section key={video.id} className={styles.film} id={video.id}>
      <div><span className="eyebrow">{video.label}</span><h2>{video.title}</h2><p>{video.description}</p></div>
      <video controls playsInline preload="metadata" poster={`/videos/buffer-${video.id}-poster.jpg`} aria-label={video.label}>
        <source src={`/videos/buffer-${video.id}.mp4`} type="video/mp4" />
        <track kind="captions" src={`/videos/buffer-${video.id}.vtt`} srcLang="en" label="English" />
        Your browser does not support this video. <a href={`/videos/buffer-${video.id}.mp4`}>Download the video</a>.
      </video>
    </section>)}
    <p className={styles.note}>Demonstrated accounts and prices are labeled sample fixtures. Videos show the original explorer capture; the current app includes the new website, PWA, and updated token icons.</p>
    <Link href="/app" className="button primary">Explore the demo yourself →</Link>
  </main>;
}
