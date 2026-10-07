import type { Metadata } from 'next';
import Link from 'next/link';
import LegalDocument, { LegalList, SupportLink, type LegalSection } from '@/components/legal/LegalDocument';
import { LEGAL_OPERATOR } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy policy — Buffer',
  description: 'What Buffer stores, why, for how long, and how to delete your account and its data.',
  alternates: { canonical: '/privacy' },
};

const summary = [
  'Presets, live account reads and reports saved on your device work without an account.',
  'Buffer never asks for your seed phrase or private key, never requests a signature and never moves funds.',
  'With an account, we store your email address, saved reports and the alert rules you create.',
  'You can delete your account and its data from inside the app at any time.',
  'We do not sell your information, and Buffer has no advertising or analytics trackers.',
];

const sections: LegalSection[] = [
  { id: 'who-we-are', title: 'Who we are', body: <>
    <p>Buffer is operated by {LEGAL_OPERATOR} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). This policy covers the Buffer website and web app at bufferonsolana.vercel.app, the installed web app, and the Buffer Android app, which opens the same web app.</p>
    <p>Our <Link href="/terms">Terms of use</Link> set out the rules for using Buffer. Questions about this policy go to <SupportLink />.</p>
  </> },
  { id: 'without-an-account', title: 'Using Buffer without an account', body: <>
    <LegalList items={[
      <><strong>Presets and the portfolio builder</strong> run in your browser with fixed reference prices. Nothing about them is sent to us.</>,
      <><strong>Live reads.</strong> When you read an account, your browser sends the public wallet address, protocol, network and subaccount to Buffer&rsquo;s server. The server reads that account&rsquo;s public data from the provider and returns it. Buffer does not store the addresses you look up.</>,
      <><strong>Reports on this device</strong> stay in your browser&rsquo;s storage. We never receive them and they are never uploaded. Clearing your browser data removes them.</>,
      <><strong>Settings on this device.</strong> Your browser also keeps your animation preference, example alert settings and, when you sign in, your session. They stay on the device.</>,
    ]} />
    <p>Buffer sets no tracking cookies and includes no advertising or analytics scripts.</p>
  </> },
  { id: 'wallet', title: 'Wallet connection', body: <>
    <p>&ldquo;Use my wallet&rdquo; asks a wallet in your browser, or on Android and Seeker a wallet through Mobile Wallet Adapter, to share its public address. Buffer uses that address only to read the public account, exactly as if you had pasted it.</p>
    <p>Buffer never requests a signature or a transaction, and it cannot move funds. On Android, Mobile Wallet Adapter keeps its connection approval in this app&rsquo;s storage on your device so your wallet can reconnect. You can revoke it in your wallet.</p>
  </> },
  { id: 'accounts', title: 'Accounts and saved reports', body: <>
    <p>Accounts are optional. If you create one, Supabase, our database and sign-in provider, stores:</p>
    <LegalList items={[
      'Your email address, a hashed password and your sign-in sessions, which can include the IP address and browser details recorded at sign-in.',
      'Saved reports: each title, the time you saved it and the report itself. A report holds the scenario, the positions and prices it used and, for a live account, the public wallet address and subaccount it read.',
      'Alert settings and history, described in the next section.',
    ]} />
    <p>Database rules let only your signed-in account read or change these records. Supabase Auth sends confirmation and password recovery emails to your address.</p>
  </> },
  { id: 'alerts', title: 'Alerts and monitored wallets', body: <>
    <p>Alerts are optional and need an account. When you set an alert rule, we store:</p>
    <LegalList items={[
      <><strong>Alert rules:</strong> the monitored public wallet address and subaccount, the metric (maintenance headroom or liquidation distance), the market, your threshold, check interval, timezone, cooldown and recovery distance.</>,
      <><strong>Monitoring state:</strong> when each rule was last checked, its latest observation and any error.</>,
      <><strong>Alert events:</strong> each threshold crossing, with the observed value, the observation it came from and a preview of the message.</>,
      <><strong>Delivery records:</strong> attempts, outcomes and the receipt returned by Discord or the webhook.</>,
      <><strong>Alert destinations:</strong> the label and masked name of each destination set up for your account.</>,
      <><strong>Manual checks:</strong> a record of each check you start, kept for 7 days.</>,
    ]} />
    <p>Destinations are Discord channels or signed webhooks that the operator configures on the server for specific accounts. You cannot add one yourself, and their URLs and secrets are never stored in the database. When an alert fires, Buffer sends the alert message, which includes the monitored wallet address, subaccount, metric and values, to that destination.</p>
  </> },
  { id: 'rate-limiting', title: 'Rate limiting and service logs', body: <>
    <p>To keep live reads available, Buffer limits how often one connection can read. <strong>IPs are hashed for rate limiting and no address is stored.</strong> The counter keeps a one-way SHA-256 hash of your IP address, never the address itself, with a request count for the current minute. It holds no account or wallet data.</p>
    <p>Our hosting provider, Vercel, processes every request to serve Buffer and keeps standard request logs under its own policies. These can include your IP address, browser details and the address of the page or API called. For a live read, that includes the public wallet address you looked up.</p>
  </> },
  { id: 'processors', title: 'Service providers', body: <>
    <p>We use these providers to run Buffer. Each receives only what it needs for its part:</p>
    <LegalList items={[
      <><strong>Vercel</strong> hosts the website, the app and its server functions.</>,
      <><strong>Supabase</strong> stores accounts, saved reports, alerts and rate-limit counters, handles sign-in and sends account emails. Your account data is stored in the United States.</>,
      <><strong>A Solana RPC provider</strong> chosen by the operator receives the public addresses Buffer reads on Velocity, Jupiter and legacy Drift, and returns on-chain data. Velocity devnet reads use Solana&rsquo;s public devnet RPC.</>,
      <><strong>Velocity, Jupiter and Drift</strong> data is read from their public on-chain accounts through that RPC provider.</>,
      <><strong>Pacifica</strong> data is read from Pacifica&rsquo;s public API, which receives the public address you look up.</>,
      <><strong>Discord or webhook recipients</strong> receive alert messages for the accounts the operator set them up for.</>,
      <><strong>Your wallet</strong> shares your public address when you choose &ldquo;Use my wallet&rdquo;. Its own privacy policy applies.</>,
      <><strong>GitHub</strong> hosts our public issue tracker. Its privacy policy applies to anything you post there.</>,
    ]} />
    <p>Vercel and Supabase can process information in the United States and other countries.</p>
  </> },
  { id: 'retention', title: 'How long we keep information', body: <LegalList items={[
    'Your account, saved reports, alert rules and destinations: until you delete them or delete your account.',
    'Alert events and delivery records: events that end delivered or suppressed are deleted 30 days after they were observed. Other events stay until you delete your account. Deleting a rule keeps its history until then.',
    'Manual check records: 7 days.',
    'Reports on your device: until you delete them or clear your browser data.',
    'Rate-limit counters: a hashed key and a count, with no IP address, account or wallet data.',
    'Vercel and Supabase logs follow their own retention. Deleted data can remain in Supabase backups until those backups expire.',
  ]} /> },
  { id: 'delete-account', title: 'Deleting your account', body: <>
    <p>Signed in, open <strong>My reports</strong> in the app and choose <strong>Delete account</strong>. After you confirm, Buffer deletes your account in the database and signs you out on that device. This permanently removes:</p>
    <LegalList items={[
      'Your sign-in: email address, password and sessions',
      'Saved reports',
      'Monitored wallet addresses and alert rules',
      'Alert destinations set up for your account',
      'Alert events and delivery records',
      'Manual check records',
      'Example alert settings kept for your account on that device',
    ]} />
    <p>It does not remove:</p>
    <LegalList items={[
      'Reports saved on a device. They are not linked to your account. Delete them in My reports on that device, or clear the browser’s data.',
      'Alert messages already delivered to a Discord channel or webhook. They stay with that recipient.',
      'Request and security logs kept by Vercel and Supabase under their own policies, and backups until they expire.',
    ]} />
    <p>Alert destinations themselves are operator configuration, not your data. The operator lists which accounts may use each destination in the server settings <code>BUFFER_DISCORD_DESTINATIONS_JSON</code> and <code>BUFFER_WEBHOOK_DESTINATIONS_JSON</code> (their <code>ownerIds</code>). Deleting your account removes the destination records linked to it, so nothing more is sent. Your former account ID can stay in that configuration until we next update it. It no longer matches any account, and we remove it at that update.</p>
    <p>If you can no longer sign in, contact us at <SupportLink /> and we will delete the account for you.</p>
  </> },
  { id: 'security', title: 'Security', body: <LegalList items={[
    'Every connection uses HTTPS.',
    'The app uses only Supabase’s public browser key. Database rules limit every record to its owner, and Supabase Auth stores passwords as hashes.',
    'Discord and webhook URLs and secrets stay in server configuration and never reach the browser.',
    'No system is perfectly secure. If you think someone else used your account, change your password and contact us.',
  ]} /> },
  { id: 'children', title: 'Age requirement', body: <p>Buffer is for people aged 18 or older. We do not knowingly collect information from anyone under 18. If you believe a person under 18 created an account, contact us and we will delete it.</p> },
  { id: 'rights', title: 'Your choices and rights', body: <>
    <p>You can use Buffer without an account, download any saved report as JSON, delete reports and delete your account in the app.</p>
    <p>Depending on where you live, you may have rights to access, correct, export or delete your information, or to object to how we use it. Contact us to make a request and we will respond within the time the law requires. We do not sell your information or share it for advertising.</p>
  </> },
  { id: 'changes', title: 'Changes to this policy', body: <p>We post changes on this page and update the date at the top. If you keep using Buffer after a change, the updated policy applies.</p> },
  { id: 'contact', title: 'Contact', body: <>
    <p>{LEGAL_OPERATOR}: <SupportLink />.</p>
    <p>GitHub issues are public. Do not post your email address, wallet address or other personal details there. Describe your request and we will arrange a private way to complete it.</p>
  </> },
];

export default function PrivacyPage() {
  return <LegalDocument page="privacy" eyebrow="Privacy policy" title="Privacy policy"
    lede="What Buffer stores when you read accounts, save reports and set alerts, and how to delete it. Buffer is read-only: it never asks for your keys and never signs."
    summary={summary} sections={sections} />;
}
