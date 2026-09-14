'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { DESIGN_MEDIA } from '@/lib/design-media';
import { formatDecimal } from '@/lib/format';
import { getSampleSnapshot } from '@/lib/samples';
import { calculateScenario } from '@/lib/scenario';
import { useMediaQuery, useMotionPreference } from '@/lib/use-motion-preference';
import { DecorativeVideo } from './DecorativeVideo';
import { Icon, Mark } from './Icons';
import { TokenIcon } from './TokenIcon';
import styles from './VideoFeatures.module.css';

const sample = getSampleSnapshot('long-short');
const scenario = calculateScenario(sample, -10);
const partial = calculateScenario(getSampleSnapshot('partial-coverage'), -10);
const total = scenario.totals[0];
const sol = scenario.included.find(position => position.market === 'SOL-PERP')!;
const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

/** B4 uses the supplied fluid media behind real, explicitly labeled reference data. */
export function VideoFeatures({ paused }: { paused: boolean }) {
  const section = useRef<HTMLElement>(null);
  const seen = useRef(new WeakSet<HTMLElement>());
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  const wide = useMediaQuery('(min-width: 768px)');
  const { paused: preferencePaused, reducedMotion } = useMotionPreference();
  const motionPaused = paused || preferencePaused || reducedMotion;
  const stage = wide ? DESIGN_MEDIA.stageWide : DESIGN_MEDIA.stageNarrow;

  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const cards = Array.from(element.querySelectorAll<HTMLElement>('[data-feature-card]'));
    // Content starts visible in HTML. Only a successful intersection triggers
    // an entrance; missing observers or paused motion leave readable content.
    if (motionPaused) {
      for (const card of cards) if (seen.current.has(card)) card.dataset.reveal = 'shown';
    }
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const card = entry.target as HTMLElement;
        if (!entry.isIntersecting || seen.current.has(card)) continue;
        seen.current.add(card);
        card.dataset.reveal = motionPaused ? 'shown' : 'animate';
        observer.unobserve(card);
      }
    }, { threshold: 0.12 });
    cards.forEach(card => { if (!seen.current.has(card)) observer.observe(card); });
    return () => observer.disconnect();
  }, [motionPaused]);

  return <section ref={section} id="features" className={styles.section} aria-labelledby="video-features-heading" data-motion-paused={motionPaused}>
    <div className={styles.stage} aria-hidden="true">
      <picture>
        <source media="(min-width: 768px)" srcSet={DESIGN_MEDIA.stageWide.poster} />
        <Image src={DESIGN_MEDIA.stageNarrow.poster} alt="" fill sizes="100vw" unoptimized className={styles.stagePoster} />
      </picture>
      {ready && <DecorativeVideo key={wide ? 'wide' : 'narrow'} {...stage} paused={motionPaused} className={styles.stageVideo} name={wide ? 'features-stage-wide' : 'features-stage-narrow'} />}
    </div>
    <div className={styles.content}>
      <div className={styles.heading}>
        <div><span className={styles.eyebrow}><span /> 01 / Keep the whole picture</span><h2 id="video-features-heading">Clarity, from<br />every angle.</h2></div>
        <p>Your positions, the scope of the calculation, and the math behind each result. All in view.</p>
      </div>
      <div className={styles.cards}>
        <FeatureCard index={0} title="Positions" copy="See the size and direction of each position. Start with a preset, or read a public account." link="Explore positions" href="/app" media={DESIGN_MEDIA.positions} paused={motionPaused}>
          <PositionsGraphic />
        </FeatureCard>
        <FeatureCard index={1} title="Coverage" copy="Know what makes it into the model. Unsupported exposure stays visible with an explanation." link="See what is included" href="#method" media={DESIGN_MEDIA.coverage} paused={motionPaused}>
          <CoverageGraphic />
        </FeatureCard>
        <FeatureCard index={2} title="Explainable math" copy="Follow each position’s contribution. See the price effect separately from account equity or health." link="Follow the calculation" href="#method" media={DESIGN_MEDIA.math} paused={motionPaused}>
          <MathGraphic />
        </FeatureCard>
      </div>
      <p className={styles.sectionNote}>Illustrative positions and fixed prices. Price effects exclude funding, fees, collateral changes, and liquidation.</p>
    </div>
  </section>;
}

function FeatureCard({ index, title, copy, link, href, media, paused, children }: {
  index: number; title: string; copy: string; link: string; href: string;
  media: { src: string; poster: string }; paused: boolean; children: ReactNode;
}) {
  return <article className={styles.card} data-feature-card style={{ '--entrance-delay': `${460 + index * 120}ms` } as CSSProperties}>
    <DecorativeVideo {...media} paused={paused} className={styles.cardVideo} name={`feature-${index === 0 ? 'positions' : index === 1 ? 'coverage' : 'math'}`} />
    <div className={styles.cardWash} aria-hidden="true" />
    <div className={styles.dotMatrix} aria-hidden="true" />
    <div className={styles.cardRim} aria-hidden="true" />
    <div className={styles.cardLabel}><span>{String(index + 1).padStart(2, '0')}</span><span className={styles.sampleLabel}>DEMO</span></div>
    <div className={styles.graphic}>{children}</div>
    <div className={styles.cardCopy}><h3><span>{title}</span></h3><p>{copy}</p><Link href={href}>{link}<Icon name="arrow" size={17} /></Link></div>
  </article>;
}

function PositionsGraphic() {
  return <div className={styles.positionsGraphic} aria-label="Example SOL long and BTC short positions">
    <div className={`${styles.windowEcho} ${styles.windowEchoOne}`} aria-hidden="true" />
    <div className={`${styles.windowEcho} ${styles.windowEchoTwo}`} aria-hidden="true" />
    <div className={styles.positionWindow}>
      <div className={styles.windowHeading}><span><Mark size={17} /> Perpetual positions</span><span className={styles.windowDots} aria-hidden="true"><i /><i /><i /></span></div>
      {sample.positions.map(position => <div className={styles.positionRow} key={position.id}>
        <TokenIcon asset={position.asset} size={28} />
        <span><strong>{position.market}</strong><small>{position.size.startsWith('-') ? 'Short' : 'Long'} · {formatDecimal(position.size.replace('-', ''), position.asset === 'BTC' ? 1 : 0)} {position.asset}</small></span>
        <strong>{formatDecimal(position.price, 0)}<small>{position.quote}</small></strong>
      </div>)}
      <div className={styles.windowFoot}><span>{sample.positions.length} positions</span><span>Fixed baseline prices</span></div>
    </div>
    <div className={styles.positionTag}><Icon name="wallet" size={14} /><span>Your account stays yours.</span></div>
  </div>;
}

function CoverageGraphic() {
  const circumference = 2 * Math.PI * 76;
  return <div className={styles.coverageGraphic} aria-label={`${partial.eligible} of ${partial.totalPositions} example positions modeled; excluded exposure is listed separately`}>
    <div className={styles.scopeWindow}>
      <div className={styles.scopeTop}><span>MODEL COVERAGE</span><Icon name="sliders" size={16} /></div>
      <div className={styles.gauge}>
        <svg viewBox="0 0 190 190" aria-hidden="true">
          <circle cx="95" cy="95" r="87" className={styles.outerGauge} />
          <circle cx="95" cy="95" r="76" className={styles.gaugeTrack} />
          <circle cx="95" cy="95" r="76" className={styles.gaugeValue} strokeDasharray={`${circumference * partial.eligible / partial.totalPositions} ${circumference}`} transform="rotate(-90 95 95)" />
          <circle cx="95" cy="95" r="61" className={styles.innerGauge} />
        </svg>
        <div><strong>{partial.eligible}<span> / {partial.totalPositions}</span></strong><small>positions modeled</small></div>
      </div>
      <div className={styles.scopeLegend}><span><i />Included</span><span><i />Excluded</span></div>
    </div>
    <div className={styles.excludedChip}><Icon name="info" size={14} /><span>{partial.excluded[0].market}<small>Excluded · unsupported fixture</small></span></div>
  </div>;
}

function MathGraphic() {
  return <div className={styles.mathGraphic} aria-label={`Example price move ${scenario.shockPercent} percent. SOL contribution ${sol.delta} USDC. Combined result ${total.delta} ${total.quote}.`}>
    <svg className={styles.network} viewBox="0 0 320 245" preserveAspectRatio="none" aria-hidden="true">
      <path d="M50 44V90Q50 102 62 102H148Q160 102 160 114V145M270 44V90Q270 102 258 102H172Q160 102 160 114M160 44V145" />
      <circle cx="50" cy="44" r="4" /><circle cx="160" cy="44" r="4" /><circle cx="270" cy="44" r="4" /><circle cx="160" cy="112" r="5" />
    </svg>
    <div className={styles.mathInputs}>
      <div><span>Signed size</span><strong>{formatDecimal(sol.size, 0)}</strong><small>SOL</small></div>
      <span className={styles.multiply} aria-hidden="true">×</span>
      <div><span>Baseline</span><strong>{formatDecimal(sol.baselinePrice, 0)}</strong><small>USDC</small></div>
      <span className={styles.multiply} aria-hidden="true">×</span>
      <div><span>Price move</span><strong>{scenario.shockPercent}%</strong><small>shared</small></div>
    </div>
    <div className={styles.mathResult}>
      <div><span>SOL price effect</span><strong>{formatDecimal(sol.delta, 0, true)} <small>USDC</small></strong></div>
      <div><span>Combined result</span><strong>{formatDecimal(total.delta, 0, true)} <small>{total.quote}</small></strong></div>
    </div>
    <div className={styles.mathFoot}><span aria-hidden="true">=</span>Every contribution, explained.</div>
  </div>;
}
