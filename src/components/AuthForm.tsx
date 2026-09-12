'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { Brand } from './Brand';
import { Mark } from './Icons';
import styles from './AuthForm.module.css';

type Mode = 'signin' | 'signup' | 'forgot' | 'reset';
export default function AuthForm({ initialMode = 'signin' }: { initialMode?: 'signin' | 'signup' }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const emailDeliveryReady = process.env.NEXT_PUBLIC_AUTH_EMAIL_READY === 'true';
  const emailActionUnavailable = !emailDeliveryReady && (mode === 'signup' || mode === 'forgot');
  useEffect(() => {
    const db = getSupabase();
    if (!db) return;
    const { data: { subscription } } = db.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') setMode('reset');
    });
    return () => subscription.unsubscribe();
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const db = getSupabase();
    if (!db || busy || emailActionUnavailable) return;
    setBusy(true); setMessage('');
    try {
      if (mode === 'forgot') {
        const { error } = await db.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/auth` });
        if (error) throw error;
        setMessage('If an account exists for this email, a recovery link will arrive shortly.');
      } else if (mode === 'reset') {
        const { error } = await db.auth.updateUser({ password });
        if (error) throw error;
        router.push('/app');
      } else if (mode === 'signup') {
        const { data, error } = await db.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${location.origin}/auth` } });
        if (error) throw error;
        if (data.session) router.push('/app');
        else setMessage('Check your email for a confirmation link, then sign in to save your reports.');
      } else {
        const { error } = await db.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        router.push('/app');
      }
    } catch (error) {
      const status = error && typeof error === 'object' && 'status' in error ? error.status : 0;
      setMessage(status === 429 ? 'Too many attempts. Please wait a minute and try again.' : mode === 'signin' ? 'Sign-in failed. Check your email, password, and email confirmation, then retry.' : 'That request could not be completed. Please check your details and retry.');
    } finally { setBusy(false); }
  }
  return <main className={styles.page}>
    <Link href="/" className={styles.brand} aria-label="Buffer home"><Brand /></Link>
    <section className={styles.card}>
      <div className={styles.intro}><span className="eyebrow">A LITTLE ROOM TO THINK</span><h1>{mode === 'signup' ? 'Keep your perspective.' : mode === 'forgot' ? 'Find your way back.' : mode === 'reset' ? 'A fresh start.' : 'Welcome back.'}</h1><p>Save a scenario today. Return with a clearer view tomorrow.</p><div className={styles.art} aria-hidden="true"><Mark size={200} /></div><p className={styles.fine}>Public accounts stay public. Your saved reports belong to you.</p></div>
      <div className={styles.form}>
        <h2>{mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : mode === 'reset' ? 'Choose a new password' : 'Sign in to Buffer'}</h2>
        {!configured || emailActionUnavailable ? <div role="status"><p>Cloud accounts are being configured. You can explore live accounts, save scenarios on this device, and download reports now. No sign-up is needed.</p><a className="button primary" href="/app">Open the explorer</a><p>Already have a confirmed cloud account? <button className={styles.textButton} onClick={() => setMode('signin')}>Sign in</button></p></div> : <form onSubmit={submit}>
          {mode !== 'reset' && <label>Email address<input type="email" name="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required maxLength={254} placeholder="you@example.com" /></label>}
          {mode !== 'forgot' && <label>Password<input type="password" name="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={mode === 'signin' ? 1 : 12} maxLength={128} required placeholder={mode === 'signin' ? 'Your password' : 'At least 12 characters'} /></label>}
          {emailActionUnavailable && <p className={styles.status}>Email delivery is being configured. Existing confirmed accounts can sign in; the public explorer is ready to use.</p>}
          <button className="button primary" type="submit" disabled={busy || emailActionUnavailable}>{busy ? 'One moment…' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send recovery link' : mode === 'reset' ? 'Update password' : 'Sign in'}</button>
          <p role="status" aria-live="polite" className={styles.status}>{message}</p>
          {mode === 'signin' && <button type="button" className={styles.textButton} onClick={() => { setMode('forgot'); setMessage(''); }}>Forgot password?</button>}
          {mode !== 'reset' && <p className={styles.switch}>{mode === 'signup' ? 'Already have an account?' : 'New to Buffer?'} <button type="button" className={styles.textButton} onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMessage(''); setPassword(''); }}>{mode === 'signup' ? 'Sign in' : 'Create account'}</button></p>}
        </form>}
        <a href="/app" className={styles.back}>Continue to the public explorer →</a>
        <p className={styles.fine}>Signing in never connects a wallet or gives Buffer permission to trade.</p>
      </div>
    </section>
  </main>;
}
