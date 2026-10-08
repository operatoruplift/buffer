import { describe, expect, it } from 'vitest';
import { LEGAL_OPERATOR, LEGAL_UPDATED, LEGAL_UPDATED_ISO, SUPPORT_ISSUES_URL, supportContact } from '../src/lib/legal';

describe('legal page facts', () => {
  it('names the operator and the shared revision date', () => {
    expect(LEGAL_OPERATOR).toBe('Operator Uplift');
    expect(LEGAL_UPDATED).toBe('7 October 2026');
    expect(LEGAL_UPDATED_ISO).toBe('2026-10-07');
  });

  it('uses the configured support email when it is a plain address', () => {
    expect(supportContact(' help@operatoruplift.example ')).toEqual({ kind: 'email', href: 'mailto:help@operatoruplift.example', label: 'help@operatoruplift.example' });
  });

  it.each([undefined, '', '   ', 'not-an-email', 'name@localhost', 'a b@example.com', 'javascript:alert(1)@example.com', 'x@example.com?cc=other@example.com'])(
    'falls back to public GitHub issues for %j and never invents an address', value => {
      expect(supportContact(value)).toEqual({ kind: 'issues', href: SUPPORT_ISSUES_URL, label: 'github.com/operatoruplift/buffer/issues' });
    });

  it('points the fallback at this repository’s issue tracker', () => {
    expect(SUPPORT_ISSUES_URL).toBe('https://github.com/operatoruplift/buffer/issues');
  });
});

describe('sitemap', () => {
  it('lists both legal pages so stores and crawlers can reach them', async () => {
    const { default: sitemap } = await import('../src/app/sitemap');
    const urls = sitemap().map(entry => entry.url);
    expect(urls).toContain('https://bufferonsolana.vercel.app/privacy');
    expect(urls).toContain('https://bufferonsolana.vercel.app/terms');
  });
});
