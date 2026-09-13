'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { Brand } from './Brand';
import { DecorativeVideo } from './DecorativeVideo';
import { LiquidGlass } from './LiquidGlass';
import { DESIGN_MEDIA } from '@/lib/design-media';
import { useMotionPreference } from '@/lib/use-motion-preference';
import { authErrorMessage, AuthOperationError, clearRecovery, inspectAuthCallback, recoveryDeadline, rememberRecovery, runAuthOperation } from '@/lib/auth-flow';
import { persistedAuthIdentity, persistedAuthSession, sameAuthSession, sessionIdentity, withIdentityBoundAuthSignIn, withIdentityBoundAuthUpdate, type AuthSessionIdentity } from '@/lib/auth-storage';
import styles from './AuthForm.module.css';

type Mode = 'signin' | 'signup' | 'forgot' | 'reset';
export default function AuthForm({ initialMode = 'signin' }: { initialMode?: 'signin' | 'signup' }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [entered, setEntered] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const modeRef = useRef<Mode>(initialMode);
  const recoveryUntil = useRef(0);
  const recoverySession = useRef<AuthSessionIdentity | null>(null);
  const operation = useRef<{ controller: AbortController; mode: Mode; email: string } | null>(null);
  const { paused, toggleMotion, reducedMotion } = useMotionPreference();
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const emailDeliveryReady = process.env.NEXT_PUBLIC_AUTH_EMAIL_READY === 'true';
  const emailActionUnavailable = !emailDeliveryReady && (mode === 'signup' || mode === 'forgot');
  const cancelOperation = useCallback(() => {
    generation.current++;
    operation.current?.controller.abort();
    operation.current = null;
  }, []);
  const changeMode = useCallback((next: Mode) => {
    cancelOperation();
    if (next !== 'reset') { recoverySession.current = null; recoveryUntil.current = 0; clearRecovery(); }
    modeRef.current = next;
    setMode(next);
    setBusy(false);
    setMessage('');
    setPassword('');
    setPasswordVisible(false);
  }, [cancelOperation]);
  useEffect(() => {
    mounted.current = true;
    const callback = inspectAuthCallback(location.href);
    const db = getSupabase();
    if (!db) return () => { mounted.current = false; cancelOperation(); };
    const reconciliations = new Set<number>();
    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      if (!mounted.current) return;
      if ((event === 'SIGNED_OUT' && persistedAuthIdentity(process.env.NEXT_PUBLIC_SUPABASE_URL!)) || (session && !sameAuthSession(sessionIdentity(session), persistedAuthSession(process.env.NEXT_PUBLIC_SUPABASE_URL!)))) {
        cancelOperation();
        setBusy(false);
        setSessionUser(null);
        const ticket = generation.current;
        // SDK notifications follow asynchronous storage work; another session may already be persisted.
        const timer = window.setTimeout(() => {
          reconciliations.delete(timer);
          void db.auth.getSession().then(({ data, error }) => {
            if (!mounted.current || generation.current !== ticket) return;
            if (modeRef.current === 'reset' && (!sameAuthSession(recoverySession.current, sessionIdentity(data.session)) || !recoveryDeadline(sessionIdentity(data.session)))) changeMode('signin');
            setSessionUser(data.session?.user || null);
            if (error) setMessage('Your current session could not be restored. Please sign in again.');
          }, () => {
            if (mounted.current && generation.current === ticket) setMessage('Your current session could not be restored. Please sign in again.');
          });
        }, 0);
        reconciliations.add(timer);
        return;
      }
      const current = operation.current;
      const identity = sessionIdentity(session);
      const ownSignIn = current && ['signin', 'signup'].includes(current.mode) && session?.user.email?.toLowerCase() === current.email.toLowerCase();
      if (event === 'PASSWORD_RECOVERY' && session) {
        if (!identity || !sameAuthSession(identity, persistedAuthSession(process.env.NEXT_PUBLIC_SUPABASE_URL!))) {
          changeMode('signin');
          setMessage('This recovery session could not be verified. Open a new recovery link.');
          return;
        }
        changeMode('reset');
        recoverySession.current = identity;
        recoveryUntil.current = Math.min((session.expires_at || 0) * 1000, Date.now() + 15 * 60_000);
        rememberRecovery(identity, session.expires_at);
      } else if (event === 'INITIAL_SESSION' && session) {
        const deadline = recoveryDeadline(sameAuthSession(identity, persistedAuthSession(process.env.NEXT_PUBLIC_SUPABASE_URL!)) ? identity : null);
        if (deadline) { recoverySession.current = identity; recoveryUntil.current = deadline; changeMode('reset'); }
      } else if (event === 'SIGNED_IN' && session) {
        const deadline = recoveryDeadline(sameAuthSession(identity, persistedAuthSession(process.env.NEXT_PUBLIC_SUPABASE_URL!)) ? identity : null);
        if (ownSignIn) clearRecovery();
        else if (current) changeMode('signin');
        else if (deadline) { recoverySession.current = identity; recoveryUntil.current = deadline; changeMode('reset'); }
        else if (modeRef.current === 'reset') changeMode('signin');
      } else if (event === 'TOKEN_REFRESHED' && modeRef.current === 'reset' && !sameAuthSession(recoverySession.current, identity)) {
        changeMode('signin');
        setMessage('Your account session changed. Open the recovery link again before changing a password.');
      } else if (event === 'SIGNED_OUT') {
        const wasRecovery = modeRef.current === 'reset';
        clearRecovery();
        recoveryUntil.current = 0;
        if (current || wasRecovery) changeMode('signin');
        if (wasRecovery) setMessage('Your recovery session has expired. Request a new recovery link.');
      }
      setSessionUser(session?.user || null);
    });
    let timeout = window.setTimeout(() => {
      if (mounted.current) setMessage('Session restoration is taking longer than expected. You can continue without an account or reload to retry.');
    }, 15_000);
    void db.auth.initialize().then(({ error }) => {
      if (!mounted.current) return;
      window.clearTimeout(timeout);
      timeout = 0;
      setAuthReady(true);
      if (callback.present) history.replaceState(history.state, '', callback.cleanUrl);
      if (callback.error || (callback.present && error)) {
        changeMode('signin');
        clearRecovery();
        setMessage('This account link is invalid or has expired. Request a new link or sign in with your password.');
      } else if (error) setMessage('Your previous session could not be restored. Please sign in again.');
    }, () => {
      if (!mounted.current) return;
      window.clearTimeout(timeout);
      timeout = 0;
      setAuthReady(true);
      if (callback.present) history.replaceState(history.state, '', callback.cleanUrl);
      setMessage('Your previous session could not be restored. Please sign in again.');
    });
    return () => {
      mounted.current = false;
      cancelOperation();
      window.clearTimeout(timeout);
      reconciliations.forEach(timer => window.clearTimeout(timer));
      subscription.unsubscribe();
    };
  }, [cancelOperation, changeMode]);

  useEffect(() => {
    if (mode !== 'reset') return;
    const timer = window.setTimeout(() => {
      clearRecovery();
      changeMode('signin');
      setMessage('Your recovery session has expired. Request a new recovery link.');
    }, Math.max(0, recoveryUntil.current - Date.now()));
    return () => window.clearTimeout(timer);
  }, [mode, changeMode]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const db = getSupabase();
    if (!db || !authReady || busy || operation.current || emailActionUnavailable) return;
    const submittedMode = mode;
    const expectedSession = recoverySession.current;
    if (submittedMode === 'reset' && (!expectedSession || !sameAuthSession(expectedSession, persistedAuthSession(process.env.NEXT_PUBLIC_SUPABASE_URL!)))) {
      changeMode('signin');
      setSessionUser(null);
      setMessage('Your account session changed. Open the recovery link again before changing a password.');
      return;
    }
    if (submittedMode === 'reset' && (!sessionUser || recoveryUntil.current <= Date.now())) {
      changeMode('signin');
      setMessage('Your recovery session has expired. Request a new recovery link.');
      return;
    }
    const controller = new AbortController();
    const ticket = ++generation.current;
    operation.current = { controller, mode: submittedMode, email: email.trim() };
    const isCurrent = () => mounted.current && generation.current === ticket && !controller.signal.aborted;
    setBusy(true); setMessage('');
    try {
      if (submittedMode === 'forgot') {
        const { error } = await runAuthOperation('forgot', () => db.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/auth` }), controller.signal);
        if (!isCurrent()) return;
        if (error) throw error;
        setMessage('If an account exists for this email, a recovery link will arrive shortly.');
      } else if (submittedMode === 'reset') {
        const { error } = await runAuthOperation('reset', signal => withIdentityBoundAuthUpdate(process.env.NEXT_PUBLIC_SUPABASE_URL!, expectedSession!, () => db.auth.updateUser({ password }), signal), controller.signal, undefined, expectedSession!);
        if (!isCurrent()) return;
        if (error) throw error;
        clearRecovery();
        router.push('/app');
      } else if (submittedMode === 'signup') {
        const { data, error } = await runAuthOperation('signup', signal => withIdentityBoundAuthSignIn(process.env.NEXT_PUBLIC_SUPABASE_URL!, 'signup', () => db.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${location.origin}/auth` } }), signal), controller.signal);
        if (!isCurrent()) return;
        if (error) throw error;
        if (data.session) router.push('/app');
        else setMessage('Check your email for a confirmation link, then sign in to save your reports.');
      } else {
        const { error } = await runAuthOperation('signin', signal => withIdentityBoundAuthSignIn(process.env.NEXT_PUBLIC_SUPABASE_URL!, 'signin', () => db.auth.signInWithPassword({ email: email.trim(), password }), signal), controller.signal);
        if (!isCurrent()) return;
        if (error) throw error;
        router.push('/app');
      }
    } catch (error) {
      if (isCurrent()) {
        const sessionChanged = (error instanceof AuthOperationError && error.code === 'session') || (submittedMode === 'reset' && !sameAuthSession(expectedSession, persistedAuthSession(process.env.NEXT_PUBLIC_SUPABASE_URL!)));
        if (sessionChanged) { changeMode('signin'); setSessionUser(null); }
        setMessage(authErrorMessage(sessionChanged ? new AuthOperationError('session') : error, submittedMode));
      }
    } finally {
      if (isCurrent()) { operation.current = null; setBusy(false); }
    }
  }
  return <main className={styles.page} data-motion-paused={paused}>
    <DecorativeVideo {...DESIGN_MEDIA.auth} className={styles.scene} paused={paused} onVideoElement={setVideo} name="auth" />
    <nav className={styles.nav} aria-label="Account page navigation">
      <Link href="/" className={styles.brand} aria-label="Buffer home"><Brand /></Link>
      <button type="button" className={styles.motion} onClick={() => { setEntered(true); toggleMotion(); }} aria-pressed={paused} aria-label={paused ? 'Resume page animations' : 'Pause page animations'}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">{paused ? <path d="m5 3 8 5-8 5Z" /> : <><rect x="4" y="3" width="3" height="10" rx="1" /><rect x="9" y="3" width="3" height="10" rx="1" /></>}</svg>
        <span>{paused ? 'Play motion' : 'Pause motion'}</span>
      </button>
    </nav>
    <div className={styles.center}>
      <section className={styles.card} aria-labelledby="auth-title">
        <LiquidGlass video={video} paused={paused} reducedMotion={reducedMotion} />
        <div className={styles.content} data-entered={entered} onFocusCapture={() => setEntered(true)}>
          <div className={styles.intro}>
            <span className={styles.eyebrow}>YOUR PRIVATE REPORT LIBRARY</span>
            <h1 id="auth-title">{mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Find your way back' : mode === 'reset' ? 'Choose a new password' : 'Sign in to Buffer'}</h1>
            <p>{mode === 'forgot' ? 'We’ll send a recovery link to your account’s email address.' : mode === 'reset' ? 'Set a new password for your private cloud library.' : 'Keep your scenarios close. Save a perspective today, and return to it tomorrow.'}</p>
            {sessionUser && mode !== 'reset' && <p role="status">Signed in as {sessionUser.email || 'your cloud account'}. <Link href="/app">Open your library</Link></p>}
          </div>
          {!configured || emailActionUnavailable ? <div className={styles.unavailable} role="status">
            <p>Cloud accounts are being configured. You can explore live accounts, save scenarios on this device, and download reports now. No sign-up is needed.</p>
            <p>Already have a confirmed cloud account? <button type="button" className={styles.textButton} onClick={() => changeMode('signin')}>Sign in</button></p>
          </div> : <form onSubmit={submit} className={styles.form}>
            {mode !== 'reset' && <div className={styles.field}>
              <label htmlFor="auth-email">Email address</label>
              <input id="auth-email" type="email" name="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required maxLength={254} placeholder="you@example.com" disabled={busy} />
            </div>}
            {mode !== 'forgot' && <div className={styles.field}>
              <label htmlFor="auth-password">Password</label>
              <div className={styles.passwordField}>
                <input id="auth-password" type={passwordVisible ? 'text' : 'password'} name="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={mode === 'signin' ? 1 : 12} maxLength={128} required placeholder={mode === 'signin' ? 'Your password' : 'At least 12 characters'} disabled={busy} />
                <button type="button" className={styles.visibility} onClick={() => setPasswordVisible(value => !value)} aria-label={passwordVisible ? 'Hide password' : 'Show password'} aria-pressed={passwordVisible}>{passwordVisible ? 'Hide' : 'Show'}</button>
              </div>
            </div>}
            {mode === 'signin' && <div className={styles.recovery}><button type="button" className={styles.textButton} disabled={busy} onClick={() => changeMode('forgot')}>Forgot password?</button></div>}
            <button className={styles.submit} type="submit" disabled={!authReady || busy || emailActionUnavailable}>{busy ? 'One moment…' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send recovery link' : mode === 'reset' ? 'Update password' : 'Sign in'}</button>
            <p role="status" aria-live="polite" className={styles.status}>{message}</p>
            {mode !== 'reset' && <p className={styles.switch}>{mode === 'signup' ? 'Already have an account?' : 'New to Buffer?'} <button type="button" className={styles.textButton} disabled={busy} onClick={() => changeMode(mode === 'signup' ? 'signin' : 'signup')}>{mode === 'signup' ? 'Sign in' : 'Create account'}</button></p>}
          </form>}
          <div className={styles.guest} onAnimationEnd={event => { if (event.target === event.currentTarget) setEntered(true); }}>
            <Link href="/app" className={styles.continue}>Continue without an account <span aria-hidden="true">→</span></Link>
            <p className={styles.fine}>The public explorer and device reports are ready to use. Signing in never connects a wallet or grants permission to trade.</p>
          </div>
        </div>
      </section>
    </div>
    <footer className={styles.footer}><span>A little more room to think.</span><Link href="/#privacy">Privacy by design</Link></footer>
  </main>;
}
