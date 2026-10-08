import type { Metadata } from 'next';
import Link from 'next/link';
import LegalDocument, { LegalClause, LegalList, SupportLink, type LegalSection } from '@/components/legal/LegalDocument';
import { LEGAL_OPERATOR } from '@/lib/legal';
import { LIQUIDATION_MODEL_VERSION } from '@/lib/risk/liquidation';

export const metadata: Metadata = {
  title: 'Terms of use — Buffer',
  description: 'The terms for using Buffer, a read-only tool for exploring Solana perpetual positions.',
  alternates: { canonical: '/terms' },
};

const summary = [
  'Buffer is a read-only tool. It is not trading advice.',
  'Price scenarios and liquidation estimates are versioned estimates, not guarantees.',
  'Buffer never asks for your keys and never signs.',
  'Alerts can be delayed or fail. Do not rely on them alone.',
  'Buffer is provided as is, without warranties.',
];

const sections: LegalSection[] = [
  { id: 'agreement', title: 'These terms', body: <>
    <p>These terms are an agreement between you and {LEGAL_OPERATOR}, which operates Buffer (&ldquo;we&rdquo;, &ldquo;us&rdquo;). They cover the Buffer website and web app, the installed web app and the Buffer Android app. By using Buffer you agree to them. If you do not agree, do not use Buffer.</p>
    <p>Our <Link href="/privacy">Privacy policy</Link> explains what Buffer stores and how to delete it.</p>
  </> },
  { id: 'eligibility', title: 'Who can use Buffer', body: <p>You must be at least 18 years old and able to enter a binding agreement. Do not use Buffer where doing so breaks the law, or if you are the target of sanctions or are in a sanctioned country or region.</p> },
  { id: 'service', title: 'What Buffer does', body: <>
    <p>Buffer reads public data about Solana perpetual positions on Velocity, Pacifica, Jupiter Perps and legacy Drift. It shows a price scenario, the provider&rsquo;s risk context and related details. Buffer is read-only. It does not hold funds, place trades, custody assets or give access to any exchange.</p>
    <p>Protocols, RPC providers and APIs are run by third parties. Their data can be late, incomplete or wrong, and their own terms apply to them.</p>
  </> },
  { id: 'not-advice', title: 'Not trading advice', body: <p>Buffer is not trading advice, and it is not investment, financial, legal or tax advice. Nothing in Buffer recommends buying, selling or holding anything. You are responsible for your own decisions and trades.</p> },
  { id: 'estimates', title: 'Estimates are not guarantees', body: <>
    <p>A price scenario applies one percentage move to eligible positions, with sizes and baseline prices held fixed. It leaves out funding, fees, collateral changes, future fills and liquidation effects.</p>
    <p>The liquidation estimate is a versioned estimate, currently model <code>{LIQUIDATION_MODEL_VERSION}</code>. It solves for the price at which one position alone would reach the maintenance boundary while everything else stays fixed. It is not the protocol&rsquo;s liquidation engine and it is not a guarantee: a position can be liquidated at a different price or time. Live calculations expire after at most two minutes.</p>
  </> },
  { id: 'keys', title: 'Your keys and wallet', body: <>
    <p>Buffer never asks for your seed phrase or private key, never requests a signature and never sends a transaction. &ldquo;Use my wallet&rdquo; asks your wallet for its public address and nothing else.</p>
    <p>If anyone claiming to be Buffer asks for your keys or a signature, do not provide them. You are responsible for your wallets, devices and trades.</p>
  </> },
  { id: 'alerts', title: 'Alerts', body: <>
    <p>Alerts are optional and need an account. Delivery depends on the protocols, RPC providers and scheduler Buffer uses, on Discord or your webhook receiver, and on the destinations the operator configures.</p>
    <p>Alerts can be delayed or fail. They can also arrive twice or not at all, and checks pause when data is unavailable. Do not rely on alerts alone. Watch your positions directly and use your protocol&rsquo;s own tools.</p>
  </> },
  { id: 'accounts', title: 'Your account', body: <p>Keep your sign-in details secure, and tell us if you think someone else used your account. You can delete your account and its data at any time from My reports in the app. We may suspend or close an account that breaks these terms or puts the service at risk.</p> },
  { id: 'acceptable-use', title: 'Acceptable use', body: <>
    <p>Do not misuse Buffer. In particular, do not:</p>
    <LegalList items={[
      'try to get around rate limits or access controls;',
      'disrupt or overload Buffer or the providers it reads;',
      'access another person’s account or data;',
      'use Buffer to break the law.',
    ]} />
    <p>Buffer&rsquo;s source code is available under the MIT License at <a href="https://github.com/operatoruplift/buffer" target="_blank" rel="noreferrer">github.com/operatoruplift/buffer</a>. That license covers the code. These terms cover your use of the hosted service and apps.</p>
  </> },
  { id: 'availability', title: 'Changes to Buffer', body: <p>Buffer is free to use. We can change, pause or stop any part of it at any time, including supported protocols, live reads and alerts. Buffer depends on third-party services, and we are not responsible for their outages.</p> },
  { id: 'no-warranty', title: 'No warranty', body: <p>Buffer is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the fullest extent the law allows, we disclaim all warranties, express or implied, including accuracy, merchantability, fitness for a particular purpose, non-infringement and uninterrupted or error-free operation.</p> },
  { id: 'liability', title: 'Limitation of liability', body: <>
    <p>To the fullest extent the law allows, {LEGAL_OPERATOR} is not liable for any indirect, incidental, special, consequential or punitive damages, or for any loss of funds, trading losses, liquidations, lost profits or lost data, arising from your use of Buffer or your reliance on its information or alerts.</p>
    <p>Our total liability for any claim relating to Buffer is limited to 100 US dollars. Some places do not allow these limits, so they may not apply to you.</p>
  </> },
  { id: 'dapp-store', title: 'Solana dApp Store', body: <LegalClause>
    <p>If you obtained Buffer through the Solana dApp Store, these terms are between you and {LEGAL_OPERATOR} only. Solana Mobile is not a party to these terms and has no responsibility or liability for Buffer, its content, or its support or maintenance.</p>
  </LegalClause> },
  { id: 'law', title: 'Governing law', body: <p>These terms are governed by the laws of the place where {LEGAL_OPERATOR} is established, without regard to conflict-of-law rules. The mandatory consumer protections of the place where you live still apply.</p> },
  { id: 'changes', title: 'Changes to these terms', body: <p>We may update these terms. We post the new version on this page and update the date at the top. If you keep using Buffer after a change, the updated terms apply.</p> },
  { id: 'contact', title: 'Contact', body: <p>Questions about these terms go to {LEGAL_OPERATOR} at <SupportLink />.</p> },
];

export default function TermsPage() {
  return <LegalDocument page="terms" eyebrow="Buffer · Legal" title="Terms of use"
    lede="The terms for using Buffer, a read-only tool for exploring Solana perpetual positions. Please read them with the privacy policy."
    summary={summary} sections={sections} />;
}
