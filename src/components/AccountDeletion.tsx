'use client';

import { useEffect, useRef } from 'react';
import { Icon } from './Icons';
import styles from './AccountDeletion.module.css';

export type DeletionStage = 'idle' | 'confirming' | 'deleting' | 'deleted';

type SectionProps = {
  email: string | undefined;
  stage: DeletionStage;
  message: string;
  disabled: boolean;
  onStart: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

/** In-page confirmation. Nothing is sent until the person confirms a second time. */
export function DeleteAccountSection({ email, stage, message, disabled, onStart, onCancel, onConfirm }: SectionProps) {
  const start = useRef<HTMLButtonElement>(null);
  const prompt = useRef<HTMLHeadingElement>(null);
  const previous = useRef(stage);
  useEffect(() => {
    if (previous.current === 'idle' && stage === 'confirming') prompt.current?.focus();
    if (previous.current === 'confirming' && stage === 'idle') start.current?.focus();
    previous.current = stage;
  }, [stage]);
  const working = stage === 'deleting';
  return <section className={styles.section} aria-labelledby="delete-account-title">
    <h3 id="delete-account-title">Delete account</h3>
    {stage === 'idle' && <>
      <p>Remove this account and everything stored with it. This cannot be undone.</p>
      <button type="button" className={`button subtle ${styles.start}`} ref={start} disabled={disabled} onClick={onStart}>Delete account…</button>
    </>}
    {(stage === 'confirming' || working) && <div className={styles.confirm} aria-busy={working}>
      <h4 ref={prompt} tabIndex={-1}>Delete {email || 'this account'} permanently?</h4>
      <p>This removes, for good:</p>
      <ul>
        <li>Your sign-in and email address</li>
        <li>Saved reports</li>
        <li>Monitored wallet addresses and alert rules</li>
        <li>Alert destinations, events and delivery records</li>
      </ul>
      <p className={styles.kept}>Reports saved on this device stay until you delete them. Alerts already sent to Discord or a webhook stay with their recipients. <a href="/privacy#delete-account">How deletion works</a></p>
      <div className={styles.actions}>
        <button type="button" className={`button ${styles.destroy}`} disabled={working} onClick={onConfirm}>{working ? 'Deleting your account…' : 'Delete account permanently'}</button>
        <button type="button" className="button" disabled={working} onClick={onCancel}>Keep my account</button>
      </div>
    </div>}
    {stage === 'deleted' && <p className={styles.done}><Icon name="check" size={15} /> Your account and its data are deleted. Sign out to finish on this device.</p>}
    <p className={styles.status} role="status" aria-live="polite">{message}</p>
  </section>;
}

/** Shown after sign-out, when the account panel no longer has a signed-in user. */
export function AccountDeletedNotice({ onDismiss }: { onDismiss: () => void }) {
  const notice = useRef<HTMLDivElement>(null);
  useEffect(() => { notice.current?.focus(); }, []);
  return <div className={styles.notice} ref={notice} tabIndex={-1} role="status" aria-labelledby="account-deleted-title">
    <span className={styles.noticeIcon} aria-hidden="true"><Icon name="check" size={16} /></span>
    <div>
      <strong id="account-deleted-title">Account deleted.</strong>
      <p>Your sign-in, saved reports, alert rules and alert history are gone. You are signed out on this device.</p>
    </div>
    <button type="button" className="button subtle" onClick={onDismiss}>Dismiss</button>
  </div>;
}
