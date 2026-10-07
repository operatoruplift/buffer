/** Facts shared by the privacy policy and the terms. Keep both pages on one revision date. */
export const LEGAL_OPERATOR = 'Operator Uplift';
export const LEGAL_UPDATED = '7 October 2026';
export const LEGAL_UPDATED_ISO = '2026-10-07';
export const SUPPORT_ISSUES_URL = 'https://github.com/operatoruplift/buffer/issues';

export type SupportContact = { kind: 'email' | 'issues'; href: string; label: string };

const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

/** NEXT_PUBLIC_SUPPORT_EMAIL when it is a plain address; otherwise the public issue tracker. */
export function supportContact(email: string | undefined = process.env.NEXT_PUBLIC_SUPPORT_EMAIL): SupportContact {
  const value = email?.trim() ?? '';
  if (value.length <= 254 && EMAIL.test(value)) return { kind: 'email', href: `mailto:${value}`, label: value };
  return { kind: 'issues', href: SUPPORT_ISSUES_URL, label: 'github.com/operatoruplift/buffer/issues' };
}
