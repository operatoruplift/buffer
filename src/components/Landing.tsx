"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Icon, Mark } from "@/components/Icons";
import { Brand } from "@/components/Brand";
import { TokenIcon } from "@/components/TokenIcon";
import { DecorativeVideo } from '@/components/DecorativeVideo';
import { MobileNavigation } from '@/components/MobileNavigation';
import { VideoFeatures } from '@/components/VideoFeatures';
import { DESIGN_MEDIA } from '@/lib/design-media';
import { useMotionPreference } from '@/lib/use-motion-preference';
import { formatDecimal } from "@/lib/format";
import { getSampleSnapshot } from "@/lib/samples";
import { calculateScenario } from "@/lib/scenario";
import "@/app/landing.css";

const demoSnapshot = getSampleSnapshot('long-short');

function ArrowLink({ href, children, secondary = false }: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return <Link className={`buffer-cta${secondary ? " buffer-cta-secondary" : ""}`} href={href}>
    {children}<span><Icon name="arrow" size={18} /></span>
  </Link>;
}

function ScenarioPreview({ shock, onShockChange }: { shock: number; onShockChange: (value: number) => void }) {
  const scenario = calculateScenario(demoSnapshot, shock);
  const total = scenario.totals[0];
  return (
    <div className="buffer-preview" aria-label="Interactive price scenario">
      <div className="buffer-preview-top">
        <span className="buffer-preview-title"><Mark size={23} /> Scenario explorer</span>
      </div>
      <div className="buffer-preview-result">
        <div className="buffer-preview-label">Perp price P&amp;L change</div>
        <div className="buffer-preview-value" aria-live="polite" aria-atomic="true">
          {formatDecimal(total.delta, 2, true)}<span>{total.quote}</span>
        </div>
        <p>Two positions. Both sides of the move.</p>
      </div>
      <div className="buffer-preview-controls">
        <div className="buffer-preview-control-label">
          <label htmlFor="landing-shock">What if prices move…</label>
          <output htmlFor="landing-shock">{shock > 0 ? "+" : ""}{shock}%</output>
        </div>
        <input id="landing-shock" type="range" min={-20} max={20} step={1} value={shock}
          aria-valuetext={`${shock > 0 ? "+" : ""}${shock} percent price move`}
          style={{ "--range-position": `${((shock + 20) / 40) * 100}%` } as CSSProperties}
          onChange={(event) => onShockChange(Number(event.target.value))} />
        <div className="buffer-preview-range-labels"><span>−20%</span><span>0%</span><span>+20%</span></div>
        <div className="buffer-preview-presets" aria-label="Price move presets">
          {[-20, -10, 0, 10, 20].map((value) => <button key={value} type="button"
            aria-pressed={shock === value} onClick={() => onShockChange(value)}>
            {value > 0 ? "+" : ""}{value}%
          </button>)}
        </div>
      </div>
      <div className="buffer-preview-positions">
        {scenario.included.map((position) => (
          <div className="buffer-preview-position" key={position.id}>
            <TokenIcon asset={demoSnapshot.positions.find(item => item.id === position.id)!.asset} size={28} />
            <span><strong>{position.market}</strong><small>{position.size.startsWith('-') ? 'Short' : 'Long'} · {formatDecimal(position.size.replace('-', ''), 2)} at {formatDecimal(position.baselinePrice, 2)} USDC</small></span>
            <strong className={position.delta.startsWith("-") ? "buffer-down" : "buffer-up"}>{formatDecimal(position.delta, 2, true)}</strong>
          </div>
        ))}
      </div>
      <div className="buffer-preview-note"><Icon name="info" size={14} /><p>Fixed reference prices. Price effect only; excludes funding, fees, collateral changes, and liquidations.</p></div>
    </div>
  );
}

function ScenarioContextCard({ shock }: { shock: number }) {
  const scenario = calculateScenario(demoSnapshot, shock);
  return <aside className="buffer-context-card" aria-label="Coverage and assumptions">
    <div className="buffer-context-card-top"><span><Mark size={17} /> Context</span></div>
    <div className="buffer-context-metric"><strong>{scenario.included.length} / {scenario.totalPositions}</strong><span>positions modeled</span></div>
    <div className="buffer-context-list">{scenario.included.map(position => <div key={position.id}><span className="buffer-context-dot buffer-context-dot-included" /><span>{position.market}</span><strong>Included</strong></div>)}{scenario.excluded.map(position => <div key={position.id}><span className="buffer-context-dot buffer-context-dot-excluded" /><span>{position.market}</span><strong>Excluded</strong></div>)}</div>
    <div className="buffer-context-foot"><span>Fixed baseline prices</span><span>Price effect only</span></div>
  </aside>;
}

const questions = [
  ["What does Buffer calculate?", "Buffer models the incremental price P&L of eligible linear perpetual positions. It multiplies each signed position size by its frozen baseline oracle price and your chosen percentage move, then totals contributions with the same quote currency."],
  ["Do I need a wallet or an account?", "You can explore preset accounts immediately without signing in or connecting a wallet. For a live lookup, enter a public Solana authority address. Save scenarios on your device without an account. Optional cloud sign-in never grants Buffer trading permissions."],
  ["Is this a liquidation or account-equity forecast?", "No. The result covers the modeled perpetual price effect. It does not recalculate account equity, margin health, or liquidation thresholds. Collateral changes, funding, fees, future fills, and borrowing interest remain outside the model."],
  ["Which positions are supported?", "Explore 76 configured perpetual markets on Pacifica, spanning crypto, equities, commodities, and FX, plus SOL, BTC, ETH, and HYPE on Velocity. Browse the market list in the app. Each live position must pass market and price checks. Jupiter Perps shows verified inventory without a price-effect estimate; legacy Drift reads are paused. Unsupported exposure is excluded with an explanation."],
  ["Are the example numbers live market prices?", "No. Examples are deterministic fixtures, clearly labeled in the app. Live lookups use Pacifica’s public API or a Solana RPC provider and show source and freshness information. Live calculations expire after at most two minutes and require a refresh."],
  ["Can I use Buffer on my phone or desktop?", "Yes. The responsive web app adapts to phones, tablets, and desktop browsers. Where supported, use your browser’s install or Add to Home Screen option for an app window. Live account data and account sync require an internet connection."],
];

export default function Landing() {
  const { paused: motionPaused, reducedMotion, toggleMotion } = useMotionPreference();
  const [shock, setShock] = useState(-10);
  const [scenarioBoardOpen, setScenarioBoardOpen] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const pendingTravel = useRef<Map<string, DOMRect> | null>(null);
  const travelAnimations = useRef<Animation[]>([]);
  const changeScenarioBoard = (open: boolean) => {
    if (open === scenarioBoardOpen) return;
    if (open && heroRef.current) {
      const copy = heroRef.current.querySelector('.buffer-hero-copy')?.getBoundingClientRect();
      const frame = heroRef.current.getBoundingClientRect();
      if (copy) {
        heroRef.current.style.setProperty('--overview-copy-width', `${copy.width}px`);
        heroRef.current.style.setProperty('--overview-copy-left', `${copy.left - frame.left}px`);
        heroRef.current.style.setProperty('--overview-copy-top', `${copy.top - frame.top}px`);
      }
    }
    const selectors = ['.buffer-hero-stage', '.buffer-preview', '.buffer-context-card'];
    pendingTravel.current = new Map(selectors.flatMap(selector => {
      const element = heroRef.current?.querySelector(selector);
      return element ? [[selector, element.getBoundingClientRect()] as const] : [];
    }));
    travelAnimations.current.forEach(animation => animation.cancel());
    setScenarioBoardOpen(open);
  };

  useLayoutEffect(() => {
    const previous = pendingTravel.current;
    const hero = heroRef.current;
    pendingTravel.current = null;
    if (!previous || !hero) return;
    const focusTarget = hero.querySelector<HTMLButtonElement>(scenarioBoardOpen ? '.buffer-hero-stage-top button' : '.buffer-board-toggle');
    focusTarget?.focus({ preventScroll: true });
    if (motionPaused || reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const stage = hero.querySelector<HTMLElement>('.buffer-hero-stage');
    const oldStage = previous.get('.buffer-hero-stage');
    if (!stage || !oldStage || typeof stage.animate !== 'function') return;
    const newStage = stage.getBoundingClientRect();
    const scaleX = oldStage.width / newStage.width;
    const scaleY = oldStage.height / newStage.height;
    const timing = { duration: 1000, easing: 'cubic-bezier(.33,0,.2,1)' };
    const animations: Animation[] = [];
    const afterRects = new Map([...previous.keys()].flatMap(selector => {
      const element = hero.querySelector(selector);
      return element ? [[selector, element.getBoundingClientRect()] as const] : [];
    }));
    // Counter-scale the existing cards inside the widening film so their text
    // travels with the surface. No second controls or video are mounted.
    for (const [selector, before] of previous) {
      const element = hero.querySelector<HTMLElement>(selector);
      const after = afterRects.get(selector);
      if (!element || !after) continue;
      const isStage = element === stage;
      const x = isStage ? before.left - after.left : (before.left - oldStage.left) / scaleX - (after.left - newStage.left);
      const y = isStage ? before.top - after.top : (before.top - oldStage.top) / scaleY - (after.top - newStage.top);
      const sx = before.width / after.width / (isStage ? 1 : scaleX);
      const sy = before.height / after.height / (isStage ? 1 : scaleY);
      animations.push(element.animate([
        { transformOrigin: '0 0', transform: `translate(${x}px, ${y}px) scale(${sx}, ${sy})` },
        { transformOrigin: '0 0', transform: 'none' },
      ], timing));
    }
    const copy = hero.querySelector<HTMLElement>('.buffer-hero-copy');
    if (copy) animations.push(copy.animate([
      { opacity: scenarioBoardOpen ? 1 : 0, transform: scenarioBoardOpen ? 'none' : 'translateX(-24px)' },
      { opacity: scenarioBoardOpen ? 0 : 1, offset: .66 },
      { opacity: scenarioBoardOpen ? 0 : 1, transform: scenarioBoardOpen ? 'translateX(-24px)' : 'none' },
    ], { duration: 500, easing: 'cubic-bezier(.33,0,.2,1)' }));
    travelAnimations.current = animations;
    const cancel = () => animations.forEach(animation => animation.cancel());
    window.addEventListener('resize', cancel, { once: true });
    return () => { window.removeEventListener('resize', cancel); cancel(); };
  }, [scenarioBoardOpen, motionPaused, reducedMotion]);
  const motionControl = (className: string) => <button type="button" className={`buffer-motion-control ${className}`} onClick={toggleMotion} aria-label={motionPaused ? 'Resume page animations' : 'Pause page animations'} aria-pressed={motionPaused}>
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">{motionPaused ? <path d="m5 3 8 5-8 5Z" /> : <><rect x="4" y="3" width="3" height="10" rx="1" /><rect x="9" y="3" width="3" height="10" rx="1" /></>}</svg>
  </button>;
  return (
    <div className="buffer-site" data-motion-paused={motionPaused}>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="buffer-nav">
        <Link href="/" aria-label="Buffer home"><Brand /></Link>
        <nav className="buffer-nav-links" aria-label="Main navigation">
          <a href="#features">Features</a><a href="#method">How it works</a><Link href="/demo">Demo</Link><Link href="/brand-kit">Brand kit</Link><a href="#install">Get the app</a>
        </nav>
        <div className="buffer-nav-actions"><Link className="buffer-signin" href="/auth">Sign in</Link><Link className="buffer-nav-open" href="/app">Open Buffer <Icon name="arrow" size={15} /></Link></div>
        <MobileNavigation />
      </header>

      <main id="main">
        <section className={`buffer-hero${scenarioBoardOpen ? ' buffer-hero-board-open' : ''}`}>
          <div ref={heroRef} className="buffer-hero-inner" data-scenario-open={scenarioBoardOpen}>
          <div className="buffer-hero-copy" aria-hidden={scenarioBoardOpen} inert={scenarioBoardOpen}>
            <div className="buffer-kicker"><span /> A clearer view of your perps</div>
            <h1><span>Every position.</span><span>Every price move.</span><span className="buffer-hero-accent">A clearer picture.</span></h1>
            <p>Explore the price effect on your Solana perpetual positions, with the source, assumptions and coverage in view.</p>
            <div className="buffer-hero-actions"><ArrowLink href="/app">Open Buffer</ArrowLink><button type="button" className="buffer-text-link buffer-board-toggle" onClick={() => changeScenarioBoard(true)} disabled={scenarioBoardOpen}>Explore the scenario <Icon name="arrow" size={16} /></button></div>
            <div className="buffer-hero-note"><Icon name="check" size={15} /> No wallet connection. No trading permissions.</div>
          </div>
          <div className={`buffer-hero-stage${scenarioBoardOpen ? ' is-board' : ''}`}>
            <DecorativeVideo {...DESIGN_MEDIA.meridialLight} paused={motionPaused} className="buffer-hero-video" name="Meridial Light hero" />
            <div className="buffer-film-wash" aria-hidden="true" />
            <div className="buffer-shader" aria-hidden="true">
              <div className="buffer-shader-grid" />
              <div className="buffer-shader-orb buffer-shader-orb-one" />
              <div className="buffer-shader-orb buffer-shader-orb-two" />
              <div className="buffer-shader-orb buffer-shader-orb-three" />
              <svg className="buffer-shader-line" viewBox="0 0 640 260" preserveAspectRatio="none">
                <path d="M-20 214C30 195 47 208 75 181s54-11 76-42 43-2 66-30 41-3 62-42 39-4 59-25 38-9 57-17 34-2 54-19 44 6 65-17 46-1 75-16 54 2 83-16" />
                <path d="M-20 234C36 214 55 235 90 205s57-5 84-47 43 1 73-37 44-6 65-39 46 0 67-30 34 0 56-19 40-8 63-29 46 0 69-14 50-5 77-22" />
              </svg>
            </div>
            <div className="buffer-stage-orbit buffer-stage-orbit-one" aria-hidden="true" /><div className="buffer-stage-orbit buffer-stage-orbit-two" aria-hidden="true" />
            {scenarioBoardOpen && <div className="buffer-hero-stage-top"><button type="button" onClick={() => changeScenarioBoard(false)}><Icon name="arrow" size={14} /> Back to overview</button></div>}
            <div className="buffer-hero-board"><ScenarioPreview shock={shock} onShockChange={setShock} /><ScenarioContextCard shock={shock} /></div>
            <div className="buffer-stage-bottom"><span className="buffer-tiny-cross" aria-hidden="true">+</span><span>{scenarioBoardOpen ? 'Scenario board · state preserved' : 'Move the slider. See the difference.'}</span>{motionControl('buffer-hero-motion')}</div>
          </div>
          </div>
        </section>

        <div className="buffer-facts" aria-label="Product essentials"><span>Built for curious humans.</span><div><span>No trading permissions</span><span>Transparent calculations</span><span>Solana perpetuals</span></div></div>

        <VideoFeatures paused={motionPaused} />

        <section className="buffer-coverage-story" aria-labelledby="coverage-heading">
          <div className="buffer-coverage-art">
            <div className="buffer-coverage-card"><div className="buffer-coverage-card-title"><Icon name="check" size={19} /><span>Coverage, made visible.</span></div><div className="buffer-coverage-big">2 <span>of 3 positions modeled</span></div><div className="buffer-coverage-track" aria-hidden="true"><span /><span /><span /></div><div className="buffer-coverage-row"><span>SOL-PERP</span><span>Included</span></div><div className="buffer-coverage-row"><span>BTC-PERP</span><span>Included</span></div><div className="buffer-coverage-row buffer-coverage-excluded"><span>OTHER-PERP</span><span>Unsupported market</span></div><p>Illustrative partial-coverage view</p></div>
          </div>
          <div className="buffer-coverage-copy"><span className="buffer-kicker">The whole story includes the limits</span><h2>Clarity is knowing<br />what’s left out.</h2><p>A precise number is only useful when you know what it means. Buffer keeps the modeled price effect separate from your account’s equity, health, and liquidation risk.</p><a className="buffer-text-link" href="#method">Read the method <Icon name="arrow" size={17} /></a></div>
        </section>

        <section id="method" className="buffer-section buffer-method">
          <div className="buffer-method-top"><div><span className="buffer-kicker">02 / From positions to perspective</span><h2>A simple question.<br />An explainable answer.</h2></div><p>Start with a preset or a public address.<br />The account stays yours. The math stays visible.</p></div>
          <div className="buffer-steps"><article><span>01</span><h3>Choose an account</h3><p>Explore fixed presets or read a public account on Pacifica or Velocity. Inspect Jupiter Perps inventory with its modeling limits in view.</p></article><article><span>02</span><h3>Set the price move</h3><p>Apply one percentage move to eligible perpetual prices. Position quantities stay fixed.</p></article><article><span>03</span><h3>Follow the contribution</h3><p>Read the per-position effect, quote-currency totals, and exclusions. Export the details.</p></article></div>
          <div className="buffer-formula"><div><span>THE CORE CALCULATION</span><p>Signed size <b>×</b> Baseline price <b>×</b> Price move</p></div><span>=</span><strong>Price P&amp;L change</strong></div>
          <p className="buffer-method-note">A first-order price scenario, with fixed sizes. Funding, fees, collateral changes, future fills, borrowing interest, and liquidation effects are outside the model.</p>
        </section>

        <section id="install" className="buffer-install">
          <div className="buffer-install-copy"><span className="buffer-kicker">03 / A little more room to think</span><h2>Your perspective.<br />Wherever you are.</h2><p>A focused workspace for your phone, tablet, or desktop. Open it in your browser, or install Buffer for a place of its own.</p><ArrowLink href="/app">Open the app</ArrowLink><div className="buffer-install-platforms"><span>Mobile</span><span>Tablet</span><span>Desktop</span></div><details className="buffer-install-help"><summary>How to install Buffer <span>+</span></summary><p>On a supported desktop browser, choose its install-app option. On iPhone or iPad, open Buffer in Safari, tap Share, then Add to Home Screen. On Android, open the browser menu and choose Install app or Add to Home screen. Availability depends on your browser.</p></details></div>
          <div className="buffer-install-art"><div className="buffer-install-ring ring-one" aria-hidden="true" /><div className="buffer-install-ring ring-two" aria-hidden="true" /><div className="buffer-install-ring ring-three" aria-hidden="true" /><div className="buffer-app-lockup" aria-hidden="true"><div className="buffer-app-icon"><Mark size={112} /></div><span className="buffer-app-caption">BUFFER, WITH YOU.</span></div>{motionControl('buffer-install-motion')}</div>
        </section>

        <section id="privacy" className="buffer-privacy"><div className="buffer-privacy-mark"><Mark size={43} /></div><h2>Curiosity shouldn’t<br />need your keys.</h2><div><p>Buffer never asks for a seed phrase, private key, or trading approval. Public account reads use the selected provider’s API or Solana RPC. Save scenarios on your device without signing in. Optional cloud accounts keep a separate private library.</p><Link className="buffer-text-link" href="/app">Save your perspective <Icon name="arrow" size={17} /></Link></div></section>

        <section id="faq" className="buffer-section buffer-faq"><div><span className="buffer-kicker">A few good questions</span><h2>Before you<br />dive in.</h2><Link className="buffer-text-link" href="/app">Try a preset <Icon name="arrow" size={17} /></Link></div><div className="buffer-faq-list">{questions.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>

        <section className="buffer-last-call"><span className="buffer-kicker">Make space for understanding.</span><h2>See the move<br />from a new angle.</h2><ArrowLink href="/app">Explore Buffer</ArrowLink></section>
      </main>

      <footer className="buffer-footer"><div className="buffer-footer-top"><p>A little more perspective<br />on your perpetual positions.</p><nav aria-label="Footer product navigation"><a href="#features">Features</a><a href="#method">Method</a><a href="#install">Get the app</a></nav><nav aria-label="Footer account navigation"><Link href="/app">Open Buffer</Link><Link href="/demo">Watch the demo</Link><Link href="/brand-kit">Brand kit</Link><Link href="/auth">Cloud sign in</Link><a href="https://github.com/operatoruplift/buffer" target="_blank" rel="noreferrer">Source on GitHub <Icon name="external" size={11} /></a><a href="#faq">Questions</a></nav></div><Link className="buffer-footer-wordmark" href="/" aria-label="Buffer home"><Brand large /></Link><div className="buffer-footer-bottom"><span>© 2026 Buffer</span><p>Public price scenarios. Not trading advice or a liquidation forecast.</p><a href="#privacy">Privacy by design <Icon name="arrow" size={13} /></a></div></footer>
    </div>
  );
}
