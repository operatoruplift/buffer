import Image from 'next/image';
import Link from 'next/link';
import { Brand } from '@/components/Brand';
import { Icon, Mark } from '@/components/Icons';
import styles from './page.module.css';

export const metadata = {
  title: 'Buffer brand kit — logos, wallpapers and social assets',
  description: 'Download Buffer logos, profile images, wallpapers, headers, ads, and backgrounds for your social profiles.',
};

type Asset = {
  name: string;
  label: string;
  description: string;
  src: string;
  width: number;
  height: number;
  format: string;
};

const assets: Asset[] = [
  { name: 'Profile picture', label: 'Profile · 1:1', description: 'Cobalt mark on a soft, luminous field. Ready for avatars and app profiles.', src: '/icons/icon-512.png', width: 512, height: 512, format: 'PNG' },
  { name: 'Profile mark', label: 'Profile · crisp vector', description: 'The same mark as an SVG for platforms and design tools that support vectors.', src: '/brand-kit/buffer-profile.svg', width: 1024, height: 1024, format: 'SVG' },
  { name: 'Social header', label: 'Header · 1500 × 500', description: 'A wide Buffer lockup for X, LinkedIn, YouTube, and community profiles.', src: '/brand-kit/buffer-header.svg', width: 1500, height: 500, format: 'SVG' },
  { name: 'Phone wallpaper', label: 'Wallpaper · 1290 × 2796', description: 'A quiet blue and ivory gradient sized for modern phone screens.', src: '/brand-kit/buffer-wallpaper-phone.svg', width: 1290, height: 2796, format: 'SVG' },
  { name: 'Desktop wallpaper', label: 'Wallpaper · 2880 × 1800', description: 'A wide desktop composition with room for your windows and widgets.', src: '/brand-kit/buffer-wallpaper-desktop.svg', width: 2880, height: 1800, format: 'SVG' },
  { name: 'Square ad', label: 'Social post · 1080 × 1080', description: 'A ready-to-publish launch tile for feeds, stories, and community posts.', src: '/brand-kit/buffer-ad-square.svg', width: 1080, height: 1080, format: 'SVG' },
  { name: 'Landscape ad', label: 'Social card · 1200 × 628', description: 'A link-preview and campaign card with the Buffer promise up front.', src: '/brand-kit/buffer-ad-landscape.svg', width: 1200, height: 628, format: 'SVG' },
  { name: 'Soft background', label: 'Background · 1920 × 1080', description: 'An untextured brand field for decks, thumbnails, and custom announcements.', src: '/brand-kit/buffer-background.svg', width: 1920, height: 1080, format: 'SVG' },
];

const logos = [
  { name: 'Blue mark', src: '/brand/mark.svg', format: 'SVG' },
  { name: 'Blue wordmark', src: '/brand/wordmark.svg', format: 'SVG' },
  { name: 'Mono mark', src: '/brand/mark-mono.svg', format: 'SVG' },
  { name: 'Mono wordmark', src: '/brand/wordmark-mono.svg', format: 'SVG' },
];

function LogoPreview({ src }: { src: string }) {
  // SVG logos are intentionally rendered as native images so downloads preserve the source file exactly.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" />;
}

export default function BrandKitPage() {
  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Brand kit navigation">
        <Link href="/" aria-label="Buffer home"><Brand /></Link>
        <div className={styles.navLinks}><Link href="/">Back to Buffer</Link><Link className="button primary" href="/app">Open the app <Icon name="arrow" size={15} /></Link></div>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className="eyebrow">BUFFER / BRAND KIT</span>
          <h1>A little more<br /><em>perspective.</em></h1>
          <p>Everything you need to make Buffer feel at home in your social profiles, decks, launches, and conversations.</p>
          <div className={styles.heroActions}><a className="button primary" href="#downloads">Browse downloads <Icon name="arrow" size={15} /></a><a className={styles.textLink} href="#guidelines">View the essentials <Icon name="arrow" size={15} /></a></div>
        </div>
        <div className={styles.heroArt} aria-hidden="true"><div className={styles.artHalo} /><div className={styles.artCard}><Mark size={104} /><span>BUFFER, WITH YOU.</span></div><div className={styles.artLine} /></div>
      </header>

      <section id="guidelines" className={styles.guidelines} aria-labelledby="guidelines-title">
        <div><span className="eyebrow">THE ESSENTIALS</span><h2 id="guidelines-title">Keep it clear.<br />Keep it cobalt.</h2></div>
        <div className={styles.tokenGrid}>
          <div><span className={styles.swatch} style={{ background: '#315FE8' }} /><strong>Cobalt</strong><code>#315FE8</code><p>Primary action, mark, and signal color.</p></div>
          <div><span className={styles.swatch} style={{ background: '#192636' }} /><strong>Ink</strong><code>#192636</code><p>Headlines, navigation, and high contrast.</p></div>
          <div><span className={styles.swatch} style={{ background: '#F8F8F3' }} /><strong>Ivory</strong><code>#F8F8F3</code><p>Warm space that lets the mark breathe.</p></div>
          <div><span className={styles.swatch} style={{ background: '#DFE8D7' }} /><strong>Sage wash</strong><code>#DFE8D7</code><p>Secondary surface for calm, soft contrast.</p></div>
        </div>
        <p className={styles.guidance}><Mark size={22} /> Leave the mark room to breathe. Use the blue mark on light fields, the mono mark on photography, and never stretch, tilt, or recolor the wordmark.</p>
      </section>

      <section id="downloads" className={styles.downloadSection} aria-labelledby="downloads-title">
        <div className={styles.sectionHeading}><div><span className="eyebrow">READY TO SAVE</span><h2 id="downloads-title">Download the kit.</h2></div><p>Tap a card to preview it. Use the download button to save the original asset directly to your phone or desktop.</p></div>
        <div className={styles.assetGrid}>
          {assets.map(asset => <article className={styles.assetCard} key={asset.src}>
            <div className={`${styles.preview} ${asset.name === 'Profile picture' || asset.name === 'Profile mark' ? styles.squarePreview : ''}`}><Image src={asset.src} alt={`${asset.name} preview`} width={asset.width} height={asset.height} loading="eager" /></div>
            <div className={styles.assetMeta}><div><span className="eyebrow">{asset.label}</span><h3>{asset.name}</h3></div><span className={styles.format}>{asset.format}</span></div>
            <p>{asset.description}</p>
            <a className={styles.download} href={asset.src} download><Icon name="download" size={15} /> Save to device</a>
          </article>)}
        </div>
      </section>

      <section className={styles.logos} aria-labelledby="logos-title">
        <div><span className="eyebrow">LOGOS</span><h2 id="logos-title">The mark, in every useful weight.</h2><p>Use SVG when you can for the sharpest result. PNG profile images are included above for platforms that need a raster file.</p></div>
        <div className={styles.logoList}>{logos.map(logo => <a className={styles.logoRow} href={logo.src} download key={logo.src}><span><LogoPreview src={logo.src} /></span><strong>{logo.name}</strong><small>{logo.format} <Icon name="download" size={13} /></small></a>)}</div>
      </section>

      <footer className={styles.footer}><Link href="/" aria-label="Buffer home"><Brand large /></Link><div><span>Buffer · read-only scenario exploration</span><Link href="/app">Open the app <Icon name="arrow" size={14} /></Link></div></footer>
    </main>
  );
}
