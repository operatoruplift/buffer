'use client';

import { useRef, useState, type FormEvent } from 'react';
import Decimal from 'decimal.js';
import {
  addSamplePerp, getSampleQuote, removeSamplePerp, SAMPLE_MARKET_CATALOG, SAMPLE_QUOTES,
  setSampleQuote, updateSamplePerp, type SamplePerpInput,
} from '@/lib/sample-builder';
import type { Position, Snapshot } from '@/lib/types';
import { formatDecimal } from '@/lib/format';
import { Icon } from './Icons';
import { TokenIcon } from './TokenIcon';
import Select from './Select';
import styles from './SampleBuilder.module.css';

type Props = { snapshot: Snapshot; onChange: (snapshot: Snapshot) => void };

export default function SampleBuilder({ snapshot, onChange }: Props) {
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const catalog = useRef<HTMLDialogElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const quote = getSampleQuote(snapshot);
  const filtered = SAMPLE_MARKET_CATALOG.filter(market => market.market.toLowerCase().includes(search.trim().toLowerCase()));

  function apply(action: () => Snapshot, message: string) {
    try {
      onChange(action());
      setError('');
      setAnnouncement(message);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'This sample change could not be applied.');
    }
  }

  function closeCatalog() {
    catalog.current?.close();
  }

  if (snapshot.source !== 'sample') return null;
  return <div className={styles.builder}>
    <div className={styles.toolbar}>
      <button className="button primary" ref={addButton} type="button" onClick={() => {
        setSearch(''); setError(''); catalog.current?.showModal();
      }}><span aria-hidden="true">+</span> Add perps</button>
      <div className={styles.quote}>
        <label htmlFor="sample-quote">Sample denomination</label>
        <Select id="sample-quote" label="Sample denomination" value={quote}
          options={SAMPLE_QUOTES.map(value => ({ value, label: value }))}
          onChange={value => apply(() => setSampleQuote(snapshot, value), `Sample denomination changed to ${value}. Numeric inputs are unchanged.`)} />
      </div>
    </div>
    <p className={styles.note}>Build a sample with any of {SAMPLE_MARKET_CATALOG.length} perps. Edit quantities and prices below. Denomination changes keep the same numbers; no currency conversion or trade occurs.</p>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.rows}>
      {snapshot.positions.map(position => <PositionEditor
        key={`${position.id}:${position.size}:${position.price}:${position.quote}`}
        position={position}
        onApply={input => onChange(updateSamplePerp(snapshot, position.id, input))}
        onRemove={() => {
          apply(() => removeSamplePerp(snapshot, position.id), `${position.market} removed from the sample.`);
          addButton.current?.focus();
        }}
      />)}
    </div>
    {!snapshot.positions.length && <div className={styles.empty}><strong>Your sample is ready for a fresh start.</strong><p>Add a perp to explore its price exposure.</p></div>}
    <p className={styles.status} role="status">{announcement}</p>
    <dialog ref={catalog} className={styles.catalog} aria-labelledby="perp-catalog-title"
      onClose={() => addButton.current?.focus()}
      onKeyDownCapture={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeCatalog(); }
      }}
      onClick={event => { if (event.target === event.currentTarget) closeCatalog(); }}>
      <div className={styles.catalogHeading}>
        <div><span className="eyebrow">YOUR SAMPLE PORTFOLIO</span><h2 id="perp-catalog-title">Add perpetuals</h2></div>
        <button className="icon-button" type="button" aria-label="Close perpetual catalog" onClick={closeCatalog}><Icon name="close" size={22} /></button>
      </div>
      <div className={styles.catalogBody}>
        <p className={styles.catalogDescription}>Choose from {SAMPLE_MARKET_CATALOG.length} markets. Each starts at one unit with a fixed sample price you can edit.</p>
        <label className={styles.searchLabel} htmlFor="sample-market-search">Search perpetuals</label>
        <input autoFocus id="sample-market-search" type="search" placeholder="Search BTC, SOL, ETH, XRP…" value={search} onChange={event => setSearch(event.target.value)} />
        <div className={styles.catalogList}>
          {filtered.map(market => {
            const added = snapshot.positions.some(position => position.asset === market.asset);
            return <button key={market.marketIndex} className={styles.catalogMarket} type="button" disabled={added}
              aria-label={`${added ? 'Added' : 'Add'} ${market.market}`}
              onClick={() => apply(() => addSamplePerp(snapshot, market.asset, quote), `${market.market} added to the sample.`)}>
              <TokenIcon asset={market.asset} size={32} />
              <span><strong>{market.asset}</strong><small>{market.market}</small></span>
              <span className={styles.addLabel}>{added ? <><Icon name="check" size={15} /> Added</> : '+ Add'}</span>
            </button>;
          })}
          {!filtered.length && <p className={styles.noResults}>No perpetuals match “{search}”. Try another symbol.</p>}
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
      <div className={styles.catalogFooter}><span role="status">{snapshot.positions.length} perps in your sample · {quote}</span><button className="button primary" type="button" onClick={closeCatalog}>Done</button></div>
    </dialog>
  </div>;
}

function PositionEditor({ position, onApply, onRemove }: {
  position: Position; onApply: (input: SamplePerpInput) => void; onRemove: () => void;
}) {
  const initial: SamplePerpInput = {
    side: new Decimal(position.size).isNegative() ? 'short' : 'long',
    quantity: new Decimal(position.size).abs().toFixed(), price: position.price ?? '',
  };
  const [input, setInput] = useState(initial);
  const [error, setError] = useState('');
  const editable = SAMPLE_MARKET_CATALOG.some(market => market.asset === position.asset && market.market === position.market);
  const changed = input.side !== initial.side || input.quantity !== initial.quantity || input.price !== initial.price;
  const inputId = `edit-${position.id}`;

  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      onApply(input);
      setError('');
      requestAnimationFrame(() => document.getElementById(`${inputId}-quantity`)?.focus());
    }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'This position could not be updated.'); }
  }

  return <form className={styles.position} aria-label={`Edit ${position.market}`} onSubmit={submit} noValidate>
    <div className={styles.positionHeading}>
      <div className={styles.market}><TokenIcon asset={position.asset} size={32} /><div><strong>{position.market}</strong><small>{formatDecimal(position.notional, 2)} {position.quote} notional</small></div></div>
      <button className={styles.remove} aria-label={`Remove ${position.market}`} title="Remove from sample" type="button" onClick={onRemove}><Icon name="close" size={17} /></button>
    </div>
    {editable ? <>
      <div className={styles.fields}>
        <div className={styles.side}><span id={`${inputId}-side`}>Direction</span><div role="group" aria-labelledby={`${inputId}-side`}>
          <button type="button" aria-pressed={input.side === 'long'} onClick={() => setInput({ ...input, side: 'long' })}>Long</button>
          <button type="button" aria-pressed={input.side === 'short'} onClick={() => setInput({ ...input, side: 'short' })}>Short</button>
        </div></div>
        <div><label htmlFor={`${inputId}-quantity`}>Quantity · {position.asset}</label><input id={`${inputId}-quantity`} inputMode="decimal" maxLength={37} autoComplete="off" value={input.quantity} aria-invalid={Boolean(error)} aria-describedby={error ? `${inputId}-error` : undefined} onChange={event => { setInput({ ...input, quantity: event.target.value }); setError(''); }} /></div>
        <div><label htmlFor={`${inputId}-price`}>Sample price · {position.quote}</label><input id={`${inputId}-price`} inputMode="decimal" maxLength={37} autoComplete="off" value={input.price} aria-invalid={Boolean(error)} aria-describedby={error ? `${inputId}-error` : undefined} onChange={event => { setInput({ ...input, price: event.target.value }); setError(''); }} /></div>
      </div>
      {changed && <div className={styles.apply}><small>Changes apply when you save this position.</small><button className="button small" type="submit">Apply changes</button></div>}
      {error && <p className={styles.error} id={`${inputId}-error`} role="alert">{error}</p>}
    </> : <p className={styles.note}>{position.exclusionReason ?? 'This fixture is outside the editable market catalog.'}</p>}
  </form>;
}
