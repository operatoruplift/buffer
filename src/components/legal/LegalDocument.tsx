import Link from 'next/link';
import type { ReactNode } from 'react';
import { Brand } from '@/components/Brand';
import { Icon } from '@/components/Icons';
import { LEGAL_OPERATOR, LEGAL_UPDATED, LEGAL_UPDATED_ISO, supportContact } from '@/lib/legal';
import styles from './LegalDocument.module.css';

export type LegalSection = { id: string; title: string; body: ReactNode };
type LegalPage = 'privacy' | 'terms';
type Props = { page: LegalPage; eyebrow: string; title: string; lede: string; summary: string[]; sections: LegalSection[] };

const PAGES: Record<LegalPage, { href: string; label: string }> = {
  privacy: { href: '/privacy', label: 'Privacy policy' },
  terms: { href: '/terms', label: 'Terms of use' },
};
const number = (index: number) => String(index + 1).padStart(2, '0');

/** The configured support email, or the public issue tracker. Never an invented address. */
export function SupportLink() {
  const contact = supportContact();
  return contact.kind === 'email'
    ? <a href={contact.href}>{contact.label}</a>
    : <a href={contact.href} target="_blank" rel="noreferrer">{contact.label}</a>;
}

/** A short list inside a section, styled to match the document. */
export function LegalList({ items }: { items: ReactNode[] }) {
  return <ul className={styles.list}>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>;
}

/** A quoted clause that must read exactly as written, such as a store requirement. */
export function LegalClause({ children }: { children: ReactNode }) {
  return <div className={styles.clause}>{children}</div>;
}

export default function LegalDocument({ page, eyebrow, title, lede, summary, sections }: Props) {
  const sibling = PAGES[page === 'privacy' ? 'terms' : 'privacy'];
  const contents = sections.map((section, index) => <li key={section.id}><a href={`#${section.id}`}><span>{number(index)}</span>{section.title}</a></li>);
  return <div className={styles.page}>
    <a className="skip-link" href="#legal-content">Skip to content</a>
    <header className={styles.bar}>
      <Link href="/" className={styles.home} aria-label="Buffer home"><Brand /></Link>
      <nav className={styles.pages} aria-label="Legal pages">
        {(Object.keys(PAGES) as LegalPage[]).map(key => <Link key={key} href={PAGES[key].href} aria-current={key === page ? 'page' : undefined}>{key === 'privacy' ? 'Privacy' : 'Terms'}</Link>)}
        <Link href="/app" className={styles.open}>Open Buffer <Icon name="arrow" size={15} /></Link>
      </nav>
    </header>
    <main id="legal-content" className={styles.main}>
      <header className={styles.intro}>
        <span className={styles.eyebrow}><span aria-hidden="true" />{eyebrow}</span>
        <h1>{title}</h1>
        <p className={styles.lede}>{lede}</p>
        <p className={styles.meta}>
          <span>Last updated: <time dateTime={LEGAL_UPDATED_ISO}>{LEGAL_UPDATED}</time></span>
          <span>Operated by {LEGAL_OPERATOR}</span>
          <span>Contact: <SupportLink /></span>
        </p>
      </header>
      <section className={styles.summary} aria-labelledby="legal-summary">
        <h2 id="legal-summary">In short</h2>
        <ul>{summary.map(item => <li key={item}><span aria-hidden="true"><Icon name="check" size={14} /></span>{item}</li>)}</ul>
      </section>
      <div className={styles.body}>
        <nav className={styles.contents} aria-label="On this page">
          {/* One list for wide screens, one collapsed list for phones; CSS shows exactly one. */}
          <p className={styles.contentsTitle}>On this page</p>
          <ol className={styles.contentsList}>{contents}</ol>
          <details className={styles.contentsCompact}><summary>On this page <span aria-hidden="true">+</span></summary><ol>{contents}</ol></details>
        </nav>
        <div className={styles.sections}>
          {sections.map((section, index) => <section key={section.id} id={section.id} className={styles.section} aria-labelledby={`${section.id}-title`}>
            <span className={styles.number} aria-hidden="true">{number(index)}</span>
            <h2 id={`${section.id}-title`}>{section.title}</h2>
            <div className={styles.prose}>{section.body}</div>
          </section>)}
        </div>
      </div>
    </main>
    <footer className={styles.footer}>
      <Link href="/" aria-label="Buffer home"><Brand /></Link>
      <nav aria-label="Legal page footer">
        <Link href={sibling.href}>{sibling.label}</Link>
        <Link href="/app">Open Buffer</Link>
        <a href="https://github.com/operatoruplift/buffer" target="_blank" rel="noreferrer">Source on GitHub <Icon name="external" size={11} /></a>
      </nav>
      <span>© 2026 {LEGAL_OPERATOR}</span>
    </footer>
  </div>;
}
