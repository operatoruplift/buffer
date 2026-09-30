'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { useMotionPreference } from '@/lib/use-motion-preference';
import styles from './AppNavigation.module.css';

export interface AppNavigationProps {
  positionsAvailable: boolean;
  scenarioAvailable: boolean;
  alertsAvailable: boolean;
  networkLabel: string;
}

const destinations = [
  { id: 'app-overview', label: 'Overview', detail: 'Your workspace' },
  { id: 'app-positions', label: 'Positions', detail: 'See every exposure' },
  { id: 'app-scenario', label: 'What-if', detail: 'Explore a price move' },
  { id: 'monitoring', label: 'Alerts', detail: 'Stay a step ahead' },
] as const;
type Destination = (typeof destinations)[number]['id'];

function NavigationIcon({ destination }: { destination: Destination }) {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {destination === 'app-overview' && <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>}
    {destination === 'app-positions' && <><path d="M4 20V11m8 9V4m8 16V8" /><path d="M2 11h4m4-7h4m4 4h4" /></>}
    {destination === 'app-scenario' && <><path d="M3 7h18M3 17h18" /><circle cx="8" cy="7" r="3" fill="var(--app-nav-fill, #fff)" /><circle cx="16" cy="17" r="3" fill="var(--app-nav-fill, #fff)" /></>}
    {destination === 'monitoring' && <><path d="M18 9a6 6 0 0 0-12 0c0 7-2 7-2 8h16c0-1-2-1-2-8M10 21h4" /><path d="M12 2v1" /></>}
  </svg>;
}

function focusDestination(target: HTMLElement, behavior: ScrollBehavior) {
  const heading = target.matches('h1,h2,h3') ? target : target.querySelector<HTMLElement>('h1,h2,h3');
  const focusTarget = heading ?? target;
  if (!focusTarget.hasAttribute('tabindex')) {
    focusTarget.setAttribute('tabindex', '-1');
    focusTarget.addEventListener('blur', () => focusTarget.removeAttribute('tabindex'), { once: true });
  }
  focusTarget.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'start', behavior });
}

export default function AppNavigation({ positionsAvailable, scenarioAvailable, alertsAvailable, networkLabel }: AppNavigationProps) {
  const [current, setCurrent] = useState<Destination>('app-overview');
  const navigationUntil = useRef(0);
  const { paused, reducedMotion } = useMotionPreference();
  const available: Record<Destination, boolean> = {
    'app-overview': true,
    'app-positions': positionsAvailable,
    'app-scenario': scenarioAvailable,
    monitoring: alertsAvailable,
  };

  useEffect(() => {
    let frame = 0;
    const enabled = destinations.filter(({ id }) => id === 'app-overview' || id === 'app-positions' && positionsAvailable || id === 'app-scenario' && scenarioAvailable || id === 'monitoring' && alertsAvailable);
    function measure() {
      frame = 0;
      if (performance.now() < navigationUntil.current) return;
      const targets = enabled.flatMap(({ id }) => {
        const target = document.getElementById(id);
        return target ? [{ id, top: target.getBoundingClientRect().top }] : [];
      });
      const passed = targets.filter(target => target.top <= Math.min(180, innerHeight * .25));
      const closest = Math.max(...passed.map(target => target.top));
      const candidates = passed.filter(target => Math.abs(target.top - closest) < 3);
      setCurrent(previous => candidates.some(target => target.id === previous) ? previous : candidates[0]?.id ?? 'app-overview');
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    function fromHistory() {
      const destination = enabled.find(({ id }) => `#${id}` === window.location.hash);
      const target = destination && document.getElementById(destination.id);
      if (target && destination) {
        navigationUntil.current = performance.now() + 900;
        setCurrent(destination.id);
        focusDestination(target, 'instant');
      } else schedule();
    }
    fromHistory();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('hashchange', fromHistory);
    window.addEventListener('popstate', fromHistory);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('hashchange', fromHistory);
      window.removeEventListener('popstate', fromHistory);
    };
  }, [positionsAvailable, scenarioAvailable, alertsAvailable]);

  function navigate(event: MouseEvent<HTMLAnchorElement>, id: Destination) {
    if (!available[id]) { event.preventDefault(); return; }
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = document.getElementById(id);
    if (!target) { event.preventDefault(); return; }
    event.preventDefault();
    // A fragment change retains the account query and the mounted dashboard state.
    if (window.location.hash !== `#${id}`) window.history.pushState(window.history.state, '', `#${id}`);
    navigationUntil.current = event.timeStamp + 900;
    setCurrent(id);
    focusDestination(target, paused || reducedMotion ? 'instant' : 'smooth');
  }

  return <aside className={styles.shell} aria-label="Workspace navigation">
    <div className={styles.intro}><span className={styles.kicker}>YOUR WORKSPACE</span><p>A clearer perspective.</p></div>
    <nav className={styles.navigation} aria-label="App navigation">
      {destinations.map(destination => <a key={destination.id}
        className={styles.destination}
        href={available[destination.id] ? `#${destination.id}` : undefined}
        role={available[destination.id] ? undefined : 'link'}
        aria-label={destination.label}
        aria-current={available[destination.id] && current === destination.id ? 'location' : undefined}
        aria-disabled={!available[destination.id] || undefined}
        tabIndex={available[destination.id] ? undefined : -1}
        title={available[destination.id] ? destination.detail : 'Read an account or choose a preset to open this view'}
        onClick={event => navigate(event, destination.id)}>
        <span className={styles.icon}><NavigationIcon destination={destination.id} /></span>
        <span className={styles.label}>{destination.label}</span>
        <span className={styles.indicator} aria-hidden="true" />
      </a>)}
    </nav>
    <div className={styles.context}><span className={styles.network}><i aria-hidden="true" />{networkLabel}</span><p>Your keys stay yours.<br />No trading permissions.</p></div>
    <div className={styles.utilities}>
      <Link href="/demo"><svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4" /><path d="m8 6.8 5 3.2-5 3.2z" fill="currentColor" /></svg>Watch walkthrough</Link>
      <Link href="/"><span aria-hidden="true">↗</span>Back to website</Link>
    </div>
  </aside>;
}
