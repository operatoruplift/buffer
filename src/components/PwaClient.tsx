'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon, Mark } from './Icons';
import styles from './PwaClient.module.css';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function subscribeNetwork(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function subscribeInstallation(callback: () => void) {
  const query = window.matchMedia('(display-mode: standalone)');
  query.addEventListener('change', callback);
  window.addEventListener('appinstalled', callback);
  return () => {
    query.removeEventListener('change', callback);
    window.removeEventListener('appinstalled', callback);
  };
}

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

/** Registers a public-assets-only worker and exposes honest browser install states. */
export default function PwaClient() {
  const online = useSyncExternalStore(subscribeNetwork, () => navigator.onLine, () => true);
  const standalone = useSyncExternalStore(subscribeInstallation, isInstalled, () => false);
  const [installedThisSession, setInstalledThisSession] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const applyingUpdate = useRef(false);
  const guide = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    let alive = true;
    let registration: ServiceWorkerRegistration | undefined;
    let installingWorker: ServiceWorker | null = null;
    const captureInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const installed = () => {
      setInstallPrompt(null);
      setInstalledThisSession(true);
      setMessage('Buffer was installed. Open it from your home screen or applications.');
    };
    const stateChanged = () => {
      if (alive && installingWorker?.state === 'installed' && navigator.serviceWorker.controller) {
        setWaiting(registration?.waiting ?? null);
      }
    };
    const updateFound = () => {
      installingWorker?.removeEventListener('statechange', stateChanged);
      installingWorker = registration?.installing ?? null;
      installingWorker?.addEventListener('statechange', stateChanged);
    };
    const controllerChanged = () => {
      if (applyingUpdate.current) window.location.reload();
    };
    window.addEventListener('beforeinstallprompt', captureInstall);
    window.addEventListener('appinstalled', installed);
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then(async (result) => {
          if (!alive) return;
          registration = result;
          setWaiting(result.waiting);
          result.addEventListener('updatefound', updateFound);
          updateFound();
          await navigator.serviceWorker.ready;
          if (alive) setReady(true);
        })
        .catch(() => {
          if (alive) setMessage('Offline mode preparation failed. Reload while online to try again.');
        });
    }
    return () => {
      alive = false;
      window.removeEventListener('beforeinstallprompt', captureInstall);
      window.removeEventListener('appinstalled', installed);
      registration?.removeEventListener('updatefound', updateFound);
      installingWorker?.removeEventListener('statechange', stateChanged);
      if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged);
    };
  }, []);

  async function install() {
    if (!installPrompt || installing) return;
    const prompt = installPrompt;
    setInstalling(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setMessage(choice.outcome === 'accepted'
        ? 'Installation requested. Your browser will confirm when Buffer is installed.'
        : 'Installation dismissed. You can keep using Buffer in your browser.');
    } catch {
      setMessage('The browser could not open installation. Use the installation guide below.');
    } finally {
      setInstallPrompt(null);
      setInstalling(false);
    }
  }

  return (
    <aside className={styles.panel} aria-label="Buffer app installation" id="app-installation">
      <div className={styles.row}>
        <span className={styles.brand}><Mark size={22} /><strong>Buffer, within reach.</strong></span>
        <div className={styles.actions}>
          <span className={styles.status} role="status">
            {!online ? 'Offline · live data unavailable' : ready ? 'Offline mode ready' : 'Mobile & desktop app'}
          </span>
          {standalone || installedThisSession ? <span className={styles.installed}><Icon name="check" size={15} />Installed</span>
            : installPrompt ? <button type="button" className={styles.button} onClick={install} disabled={installing}><Icon name="download" size={16} />{installing ? 'Opening installer…' : 'Install Buffer'}</button>
              : <a className={styles.guideLink} href="#buffer-install-guide" onClick={() => { if (guide.current) guide.current.open = true; }}>How to install <span aria-hidden="true">↗</span></a>}
          {waiting && <button type="button" className={styles.button} onClick={() => {
            applyingUpdate.current = true;
            waiting.postMessage({ type: 'SKIP_WAITING' });
          }}>Update app</button>}
        </div>
      </div>
      {(!online || message || waiting) && <p className={styles.notice} role="status">
        {!online && <>Live reads and saved reports need a connection. <a href="/offline.html">Open offline mode.</a> </>}
        {message} {waiting && 'A new version is ready. Updating will reload Buffer and reset unsaved scenarios.'}
      </p>}
      <details ref={guide} className={styles.guide} id="buffer-install-guide">
        <summary>Install on your phone or computer</summary>
        <div className={styles.instructions}>
          <p><strong>iPhone & iPad</strong>Open Buffer in Safari, tap Share, then Add to Home Screen. Enable Open as Web App if shown.</p>
          <p><strong>Android</strong>In Chrome or Edge, use Install Buffer when it appears, or the browser menu’s Install app / Add to Home screen option.</p>
          <p><strong>Desktop</strong>In Chrome or Edge, use the address bar’s install icon or browser menu. In supported Safari versions, choose File → Add to Dock.</p>
        </div>
        <p className={styles.footnote}>Installation options depend on your browser. If none is offered, Buffer still works in a browser tab. Offline mode includes fixed reference data; live accounts and cloud saves require internet.</p>
      </details>
    </aside>
  );
}
