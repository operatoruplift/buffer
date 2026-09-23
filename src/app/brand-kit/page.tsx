import Image from 'next/image';
import Link from 'next/link';
import { Brand } from '@/components/Brand';
import { Icon, Mark } from '@/components/Icons';
import { BRAND_ASSETS, BRAND_KIT_ARCHIVE, BRAND_KIT_REVISION } from '@/lib/brand-assets';
import { AssetGallery } from './AssetGallery';
import styles from './page.module.css';

export const metadata = {
  title: 'The Buffer collection — wallpapers, social assets and logos',
  description: 'A considered collection of Buffer wallpapers, profile pictures, social posts, headers and backgrounds. Preview every composition and save the original to your device.',
};

const logos = [
  { name: 'Blue mark', src: '/brand/mark.svg' },
  { name: 'Blue wordmark', src: '/brand/wordmark.svg' },
  { name: 'Mono mark', src: '/brand/mark-mono.svg' },
  { name: 'Mono wordmark', src: '/brand/wordmark-mono.svg' },
];

const colors = [
  { name: 'Cobalt', value: '#315FE8', description: 'Our signature blue.' },
  { name: 'Ink', value: '#14232D', description: 'A little depth.' },
  { name: 'Ivory', value: '#F7F8F5', description: 'Room to breathe.' },
  { name: 'Ice', value: '#EDF3F7', description: 'A softer surface.' },
];

export default function BrandKitPage() {
  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Brand kit navigation">
        <Link href="/" aria-label="Buffer home"><Brand /></Link>
        <div className={styles.navLinks}>
          <Link href="/" className={styles.backLink}>Back to Buffer</Link>
          <Link className={styles.navApp} href="/app">Open the app <Icon name="arrow" size={16} /></Link>
        </div>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroTopline}><span className={styles.eyebrow}>THE BUFFER COLLECTION</span><span className={styles.edition}>01 / A little more perspective</span></div>
        <div className={styles.heroIntro}>
          <h1>Make room<br />for <em>perspective.</em></h1>
          <div className={styles.heroCopy}>
            <p>For your screen. For your people.<br />A collection of quiet statements, made in Buffer blue.</p>
            <a className={styles.primaryAction} href={BRAND_KIT_ARCHIVE} download>Download the collection <Icon name="download" size={17} /></a>
            <a className={styles.textLink} href="#downloads">Find your favorite <Icon name="arrow" size={16} /></a>
          </div>
        </div>
        <div className={styles.heroComposition}>
          <div className={styles.heroImage}>
            <Image src="/brand-kit/previews/buffer-wallpaper-desktop.webp" alt="Sculptural cobalt glass on a luminous ivory field, from the Buffer wallpaper collection" width={3840} height={2160} priority unoptimized />
          </div>
          <div className={styles.heroInset}>
            <Image src="/brand-kit/previews/buffer-social-portrait.webp" alt="An editorial Buffer composition from the social collection" width={1080} height={1350} unoptimized />
          </div>
          <div className={styles.heroCaption}><span>Objects of clarity.</span><span>Daylight. After hours. Always Buffer.</span></div>
        </div>
      </header>

      <section id="downloads" className={styles.downloadSection} aria-labelledby="downloads-title">
        <div className={styles.sectionHeading}>
          <div><span className={styles.eyebrow}>MADE TO GO WITH YOU</span><h2 id="downloads-title">Find your frame.</h2></div>
          <p>Every composition, in its original proportions. Preview it, then save a full-resolution PNG. On a phone, open the image and press and hold to save.</p>
        </div>
        <AssetGallery assets={BRAND_ASSETS} />
        <div className={styles.collectionNote}><span>{BRAND_ASSETS.length} compositions. Yours to make use of.</span><a href={BRAND_KIT_ARCHIVE} download>Get the complete ZIP <Icon name="download" size={16} /></a></div>
      </section>

      <section id="guidelines" className={styles.guidelines} aria-labelledby="guidelines-title">
        <div className={styles.essentialsHeading}><span className={styles.eyebrow}>THE ESSENTIALS</span><h2 id="guidelines-title">A familiar blue.<br />A clearer point of view.</h2><p>One mark, a considered palette, and enough space to let both speak.</p></div>
        <div className={styles.tokenGrid}>{colors.map(color => <div className={styles.token} key={color.name}>
          <span className={styles.swatch} style={{ background: color.value }} />
          <div><strong>{color.name}</strong><code>{color.value}</code></div>
          <p>{color.description}</p>
        </div>)}</div>
        <p className={styles.guidance}><Mark size={25} /><span>Leave the mark room to breathe. Keep its proportions and original colors. Use the supplied monochrome versions when blue won’t give you enough contrast.</span></p>
      </section>

      <section className={styles.logos} aria-labelledby="logos-title">
        <div><span className={styles.eyebrow}>ORIGINALS, ALWAYS</span><h2 id="logos-title">The signature.</h2><p>Our mark and wordmark, exactly as they should be. Scalable SVG originals for your next project.</p></div>
        <div className={styles.logoList}>{logos.map(logo => <a className={styles.logoRow} href={logo.src} download key={logo.src} aria-label={`Download ${logo.name} SVG`}>
          <span className={styles.logoPreview}><Image src={logo.src} alt="" width={180} height={46} unoptimized /></span>
          <strong>{logo.name}</strong><small>SVG <Icon name="download" size={15} /></small>
        </a>)}</div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerTop}><Link href="/" aria-label="Buffer home"><Brand large /></Link><span>A LITTLE MORE<br />ROOM TO THINK.</span></div>
        <div className={styles.footerBottom}><span>Buffer collection · {BRAND_KIT_REVISION}</span><Link href="/app">Explore Buffer <Icon name="arrow" size={16} /></Link></div>
      </footer>
    </main>
  );
}
