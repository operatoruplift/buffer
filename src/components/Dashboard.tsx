"use client";

import { isDiscoveryResponse, isSnapshotResponse } from "@/lib/live-response";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Decimal from "decimal.js";
import { SAMPLE_ACCOUNTS, getSampleSnapshot } from "@/lib/samples";
import { DEFAULT_SAMPLE_ID, getPortfolioSampleSnapshot } from "@/lib/sample-builder";
import {
  ASSUMPTIONS,
  FRESHNESS_SECONDS,
  calculateScenario,
} from "@/lib/scenario";
import { formatDecimal } from "@/lib/format";
import { createReport } from "@/lib/report";
import type { ApiError, Discovery, Position, Snapshot } from "@/lib/types";
import { PROTOCOLS, type ProtocolId } from "@/lib/protocols";
import { CONFIGURED_PERP_MARKETS } from "@/lib/perp-markets";
import { Icon, Mark } from "./Icons";
import { Brand } from './Brand';
import { TokenIcon } from './TokenIcon';
import { JupiterPositions } from './JupiterPositions';
import Select from "./Select";
import SampleBuilder from './SampleBuilder';
import AccountPanel from './AccountPanel';
import Link from 'next/link';

const PRESETS = [-20, -10, -5, 0, 5, 10, 20];
const PUBLIC_EXAMPLES: Partial<Record<ProtocolId, string>> = {
  velocity: "DxoRJ4f5XRMvXU9SGuM4ZziBFUxbhB3ubur5sVZEvue2",
  jupiter: "8vXZp5DRsAKGv6QwfqKjZ2MQgMT6arfYYpoCqAN2b9aw",
  pacifica: "Ep1d8JdFw4FnB85XDgXGVabYutro4JzK285HQqW6TZE2",
};
const sign = (n: number) => (n > 0 ? `+${n}%` : `${n}%`);
const tone = (value: string) =>
  new Decimal(value).isZero()
    ? ""
    : new Decimal(value).isPositive()
      ? "positive"
      : "negative";
const short = (address: string) =>
  `${address.slice(0, 5)}…${address.slice(-5)}`;
const time = (stamp: string) =>
  new Date(stamp).toISOString().replace("T", " · ").slice(0, 21) + " UTC";

export default function Dashboard({
  liveConfigured,
}: {
  liveConfigured: boolean;
}) {
  const [sampleId, setSampleId] = useState(DEFAULT_SAMPLE_ID);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(() =>
    getPortfolioSampleSnapshot(),
  );
  const [mode, setMode] = useState<"sample" | "live">("sample");
  const [protocolId, setProtocolId] = useState<ProtocolId>("velocity");
  const [publicExample, setPublicExample] = useState(false);
  const [marketSearch, setMarketSearch] = useState("");
  const [address, setAddress] = useState("");
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [shock, setShock] = useState(0);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(0);
  const [guideVisible, setGuideVisible] = useState(true);
  const request = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const retry = useRef<() => void>(() => {});
  const dialog = useRef<HTMLDialogElement>(null);
  const methodButton = useRef<HTMLButtonElement>(null);
  const methodTrigger = useRef<HTMLElement | null>(null);
  const scenarioHeading = useRef<HTMLHeadingElement>(null);
  const contributionsHeading = useRef<HTMLHeadingElement>(null);
  const protocol = PROTOCOLS[protocolId];
  const snapshotProtocol = snapshot ? snapshot.protocol ?? PROTOCOLS.velocity : discovery?.protocol ?? protocol;
  const apiSnapshot = snapshot?.source === "live" && snapshotProtocol.id === "pacifica";
  const availableMarkets = CONFIGURED_PERP_MARKETS[protocolId];
  const filteredMarkets = availableMarkets.filter(market => market.market.toLowerCase().includes(marketSearch.trim().toLowerCase()));
  const exampleAuthority = PUBLIC_EXAMPLES[protocolId];
  const accountLabel = mode === "live" && (protocolId === "pacifica" || protocolId === "jupiter") ? "Account" : "Subaccount";

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      abort.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  function cancel() {
    request.current++;
    abort.current?.abort();
    abort.current = new AbortController();
    return request.current;
  }
  function sample(id: string) {
    cancel();
    setSampleId(id);
    setMode("sample");
    setPublicExample(false);
    setSnapshot(getSampleSnapshot(id));
    setDiscovery(null);
    setSelectedId("");
    setShock(0);
    setError(null);
    setStale(false);
    setLoading(null);
    setNotice("Sample loaded. Price move reset to 0%.");
  }
  function changeProtocol(id: ProtocolId) {
    cancel();
    setProtocolId(id);
    setMarketSearch("");
    setDiscovery(null);
    setSelectedId("");
    if (mode === "live") setSnapshot(null);
    setShock(0);
    setStale(false);
    setError(null);
    setLoading(null);
    setNotice("");
    setPublicExample(false);
  }
  async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      signal: abort.current?.signal,
      cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok)
      throw (
        body.error ?? {
          code: "READ_FAILED",
          message: "The account could not be read. Please retry.",
          retryable: true,
        }
      );
    return body as T;
  }
  function safeError(e: unknown): ApiError {
    if (
      e &&
      typeof e === "object" &&
      "code" in e && typeof e.code === "string" && /^[A-Z_]{1,40}$/.test(e.code) &&
      "message" in e && typeof e.message === "string" && e.message.length <= 512 &&
      "retryable" in e && typeof e.retryable === "boolean"
    )
      return e as ApiError;
    return {
      code: "READ_FAILED",
      message:
        "The read could not be completed. Check your connection and retry.",
      retryable: true,
    };
  }
  async function readAccount(
    event?: FormEvent,
    options?: { authority: string; protocol: ProtocolId; publicExample?: boolean },
  ) {
    event?.preventDefault();
    const authority = (options?.authority ?? address).trim();
    const requestedProtocol = options?.protocol ?? protocolId;
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(authority)) {
      setError({
        code: "INVALID_ADDRESS",
        message:
          "Enter a valid Solana public address (32–44 base58 characters).",
        retryable: false,
      });
      return;
    }
    const ticket = cancel();
    setAddress(authority);
    setProtocolId(requestedProtocol);
    setPublicExample(Boolean(options?.publicExample));
    setMode("live");
    setSnapshot(null);
    setDiscovery(null);
    setSelectedId("");
    setShock(0);
    setStale(false);
    setError(null);
    setLoading(`Finding ${PROTOCOLS[requestedProtocol].label} accounts…`);
    retry.current = () => {
      void readAccount(undefined, { authority, protocol: requestedProtocol, publicExample: options?.publicExample });
    };
    try {
      const result = await fetchJson<unknown>(
        `/api/accounts?authority=${encodeURIComponent(authority)}&protocol=${requestedProtocol}`,
      );
      if (ticket !== request.current) return;
      if (!isDiscoveryResponse(result, authority, requestedProtocol)) throw new Error('Invalid discovery response');
      setDiscovery(result);
    } catch (e) {
      if (ticket === request.current) setError(safeError(e));
    } finally {
      if (ticket === request.current) setLoading(null);
    }
  }
  async function readSnapshot(id: string, refreshing = false) {
    if (!discovery || !id) {
      cancel();
      setSelectedId("");
      setSnapshot(null);
      setLoading(null);
      return;
    }
    const ticket = cancel();
    const requestedProtocol = discovery.protocol?.id ?? protocolId;
    setSelectedId(id);
    setLoading(
      refreshing ? "Refreshing snapshot…" : "Reading selected subaccount…",
    );
    setError(null);
    if (!refreshing) {
      setSnapshot(null);
      setShock(0);
      setStale(false);
    }
    retry.current = () => {
      void readSnapshot(id, refreshing);
    };
    try {
      const result = await fetchJson<unknown>(
        `/api/snapshot?authority=${encodeURIComponent(discovery.authority)}&subaccount=${id}&protocol=${requestedProtocol}`,
      );
      if (ticket !== request.current) return;
      const account = discovery.subaccounts.find(account => account.id === Number(id));
      if (!account || !isSnapshotResponse(result, discovery.authority, requestedProtocol, Number(id), account.address)) throw new Error('Invalid snapshot response');
      setSnapshot(result);
      setNow(Date.now());
      setShock(0);
      setStale(false);
      setNotice("Snapshot updated. Price move reset to 0%.");
    } catch (e) {
      if (ticket === request.current) {
        setError(safeError(e));
        if (refreshing) setStale(true);
      }
    } finally {
      if (ticket === request.current) setLoading(null);
    }
  }
  function refresh() {
    if (mode === "sample") {
      setShock(0);
      setError(null);
      setNotice('Sample inputs kept. Price move reset to 0%.');
    }
    else void readSnapshot(selectedId, true);
  }
  function editSample(next: Snapshot) {
    if (mode !== 'sample' || snapshot?.source !== 'sample' || next.source !== 'sample') return;
    setSnapshot(next);
    setNotice('Sample portfolio updated. Your current price move is applied to the new inputs.');
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Full address copied.");
    } catch {
      setNotice(
        "Copy is unavailable in this browser. The full address is shown in Method.",
      );
    }
  }
  function openMethod() {
    methodTrigger.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : methodButton.current;
    dialog.current?.showModal();
  }
  function restoreMethodFocus() {
    (methodTrigger.current?.isConnected ? methodTrigger.current : methodButton.current)?.focus();
  }
  function closeMethod() {
    dialog.current?.close();
    restoreMethodFocus();
  }
  function focusSection(heading: HTMLHeadingElement | null) {
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: "start", behavior: "auto" });
  }
  function trySampleMove() {
    if (mode !== "sample") return;
    setShock(-10);
    focusSection(scenarioHeading.current);
  }

  const scenario = snapshot
    ? calculateScenario(snapshot, shock, now || undefined)
    : null;
  const disabled = stale
    ? "Previous snapshot retained after a failed refresh. Retry to calculate."
    : loading
      ? "Wait for the account read to finish."
      : scenario?.disabledReason;
  const expired = Boolean(
    snapshot?.source === "live" &&
      now >=
        Math.min(
          Date.parse(snapshot.retrievedAt) + FRESHNESS_SECONDS * 1000,
          snapshot.expiresAt ? Date.parse(snapshot.expiresAt) : Infinity,
        ),
  );
  const largest =
    scenario?.included.reduce(
      (max, c) => Decimal.max(max, new Decimal(c.delta).abs()),
      new Decimal(0),
    ) ?? new Decimal(0);
  function download() {
    if (!snapshot || !scenario || disabled) return;
    const blob = new Blob(
      [JSON.stringify(createReport(snapshot, scenario), null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `buffer-${snapshot.source}-subaccount-${snapshot.subaccount.id}-${shock}pct.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Scenario report downloaded.");
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to dashboard
      </a>
      <header className="header">
        <div className="header-inner">
          <Link className="brand" href="/" aria-label="Buffer home" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Brand />
            <span className="brand-divider" />
            <span className="descriptor">
              Solana <span>·</span> {mode === "sample" ? "Samples" : protocol.label}
            </span>
          </Link>
          <div className="header-actions">
            <AccountPanel report={snapshot && scenario && !disabled ? createReport(snapshot, scenario) : null} />
            <span className={`mode ${mode}`}>
              <i />
              {mode === "sample" ? "Sample mode" : "Live mode"}
            </span>
            <button
              className="button subtle method-button"
              onClick={openMethod}
              ref={methodButton}
            >
              <Icon name="info" />
              Method
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="dashboard">
        <div className="page-heading">
          <div>
            <div className="eyebrow">POSITION EXPLORER</div>
            <h1>A little more perspective.</h1>
            <p>Your positions today. A clearer view of a market move.</p>
          </div>
          <span className="readonly">
            <Icon name="check" size={15} />
            Public data. Read only.
          </span>
        </div>

        {mode === "sample" && (
          <section className={`sample-guide ${guideVisible ? "" : "collapsed"}`} aria-label="Sample quick start">
            <div className="guide-heading">
              <div>
                <span className="sample-tag">SAMPLE</span>
                <strong>See a market move in three steps.</strong>
              </div>
              <button
                className="icon-button"
                aria-label={guideVisible ? "Hide sample guide" : "Show sample guide"}
                aria-expanded={guideVisible}
                aria-controls="sample-guide-steps"
                onClick={() => setGuideVisible(!guideVisible)}
              >
                {guideVisible ? <Icon name="close" size={16} /> : <Icon name="info" size={16} />}
              </button>
            </div>
            {guideVisible && (
              <ol id="sample-guide-steps" className="guide-steps">
                <li><button onClick={trySampleMove}><span>1</span>Try a −10% move<Icon name="arrow" size={14} /></button></li>
                <li><button onClick={() => focusSection(contributionsHeading.current)}><span>2</span>Inspect contributions</button></li>
                <li><button onClick={openMethod}><span>3</span>Read the method</button></li>
              </ol>
            )}
          </section>
        )}

        <section
          className="surface address-panel"
          aria-labelledby="address-label"
        >
          <form onSubmit={readAccount}>
            <div className="protocol-picker">
              <label htmlFor="protocol">Protocol</label>
              <Select
                id="protocol"
                label="Protocol"
                value={protocolId}
                onChange={(value) => changeProtocol(value as ProtocolId)}
                options={[
                  { value: "velocity", label: "Velocity", description: "Current protocol · Solana mainnet" },
                  { value: "pacifica", label: "Pacifica", description: `${CONFIGURED_PERP_MARKETS.pacifica.length} perpetual markets · Public API` },
                  { value: "jupiter", label: "Jupiter Perps", description: "3 perpetual markets · Inventory only · Solana mainnet" },
                  { value: "drift", label: "Drift · legacy", description: "Paused protocol · balances did not migrate" },
                ]}
              />
            </div>
            {protocol.legacy && (
              <p className="protocol-notice">
                Legacy Drift is paused. Balances did not migrate to Velocity.{" "}
                <a href="https://docs.velocity.exchange/developers/migrate-from-drift" target="_blank" rel="noreferrer">Migration details ↗</a>
              </p>
            )}
            <label id="address-label" htmlFor="address">
              Solana wallet address
            </label>
            <div className="address-row">
              <div className="input-wrap">
                <Icon name="wallet" />
                <input
                  id="address"
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setPublicExample(false);
                  }}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="Paste a public wallet address"
                  aria-describedby="address-help"
                />
              </div>
              <button
                className="button primary"
                type="submit"
                disabled={!!loading}
              >
                Read account
                <Icon name="arrow" />
              </button>
            </div>
          </form>
          <div className="address-bottom">
            <p id="address-help">
              {protocolId === "jupiter" ? "Read Jupiter positions by public wallet. Inventory only; price scenarios are unavailable." : protocolId === "pacifica"
                ? "Read your Pacifica wallet account. No wallet connection needed."
                : liveConfigured
                ? `Read positions from one ${protocol.label} subaccount. No wallet connection needed.`
                : "Live reads require server RPC configuration. Explore the samples below."}
            </p>
            <div className="sample-picker">
              <label htmlFor="sample">Try a sample</label>
              <Select
                id="sample"
                label="Try a sample"
                value={mode === "sample" && snapshot?.sampleName !== 'Custom portfolio' ? sampleId : ""}
                onChange={sample}
                placeholder={snapshot?.sampleName === 'Custom portfolio' ? 'Custom portfolio' : 'Select sample'}
                options={SAMPLE_ACCOUNTS.map((s) => ({ value: s.id, label: s.name, description: s.description }))}
              />
            </div>
          </div>
          {!protocol.legacy && (
            <details className="market-directory" key={protocolId}>
              <summary>{availableMarkets.length} perpetual markets on {protocol.label}{protocolId === "jupiter" ? " · inventory only" : ""}<Icon name="arrow" size={14} /></summary>
              <div className="market-directory-content">
                <label className="market-search-label" htmlFor="market-search">Find a market</label>
                <input id="market-search" type="search" placeholder="Search symbols…" value={marketSearch} onChange={event => setMarketSearch(event.target.value)} />
                <div className="market-symbols" aria-live="polite">
                  {filteredMarkets.map(market => <span key={market.marketIndex}>{market.asset}</span>)}
                  {!filteredMarkets.length && <p>No matching markets.</p>}
                </div>
                <p>{protocolId === "jupiter" ? "SOL, ETH, and BTC positions are read as inventory. USD accounting, collateral, entry prices, and reserved tokens are shown separately; no Jupiter price effect is calculated." : "Each position needs current, usable price data. Market availability can change."}</p>
              </div>
            </details>
          )}
          {exampleAuthority && <div className="live-example">
            <button
              type="button"
              onClick={() => void readAccount(undefined, { authority: exampleAuthority, protocol: protocolId, publicExample: true })}
              disabled={!!loading}
            >
              Explore a live account <Icon name="arrow" size={14} />
            </button>
            <span>{protocol.label} public example · balances can change</span>
          </div>}
        </section>

        {error && (
          <div className="alert error" role="alert">
            <Icon name="info" />
            <div>
              <strong>
                {error.code === "INVALID_ADDRESS"
                  ? "Check the address"
                  : "Account read unsuccessful"}
              </strong>
              <p>{error.message}</p>
            </div>
            {error.retryable && (
              <button
                className="button small"
                disabled={!!loading}
                onClick={() => retry.current()}
              >
                Retry
              </button>
            )}
          </div>
        )}
        {mode === "sample" && (
          <div className="sample-note">
            <span className="sample-tag">SAMPLE</span>
            <span>
              Editable sample positions and fixed baseline prices. Add perps,
              choose a denomination, and build your own scenario.
            </span>
          </div>
        )}
        {mode === "live" && publicExample && (
          <p className="public-example-note">Public example account on {protocol.label}. Balances and positions can change; choose an account to read its current snapshot.</p>
        )}
        {loading && (
          <div className="loading-status" role="status">
            <span className="loading-dot" />
            {loading}
          </div>
        )}
        {mode === "live" && discovery && !discovery.subaccounts.length && (
          <div className="surface empty">
            <Icon name="wallet" size={28} />
            <h2>No {protocol.label} {protocolId === "pacifica" ? "accounts" : "subaccounts"} found</h2>
            <p>No {protocol.label} account was returned for this wallet address.</p>
            <button
              className="button"
              onClick={() => sample(DEFAULT_SAMPLE_ID)}
            >
              Explore a sample
            </button>
          </div>
        )}

        {(snapshot || (discovery && discovery.subaccounts.length > 0)) && (
          <section className="account-strip" aria-label="Selected account">
            <div className="account-identity">
              <span className="account-icon">
                <Icon name="wallet" size={20} />
              </span>
              <div>
                <div className="eyebrow">
                  {mode === "sample" ? "EXAMPLE ACCOUNT" : publicExample ? "PUBLIC EXAMPLE" : "SELECTED AUTHORITY"}
                </div>
                <div className="account-name">
                  {mode === "sample"
                    ? snapshot?.sampleName
                    : short(discovery!.authority)}
                  {mode === "live" && (
                    <>
                      <button
                        className="icon-button"
                        aria-label="Copy full authority address"
                        onClick={() => copy(discovery!.authority)}
                      >
                        <Icon name="copy" size={15} />
                      </button>
                      <a
                        className="icon-button"
                        aria-label="View authority on Solana Explorer"
                        href={`https://explorer.solana.com/address/${discovery!.authority}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Icon name="external" size={15} />
                      </a>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="subaccount">
              <label htmlFor="subaccount">{accountLabel}</label>
              <Select
                id="subaccount"
                label={accountLabel}
                value={
                  mode === "sample"
                    ? String(snapshot?.subaccount.id)
                    : selectedId
                }
                onChange={(value) => void readSnapshot(value)}
                placeholder={`Select ${accountLabel === "Account" ? "an account" : "a subaccount"}`}
                options={mode === "live"
                  ? [
                    { value: "", label: `Select ${accountLabel === "Account" ? "an account" : "a subaccount"}` },
                    ...(discovery?.subaccounts.map((s) => ({ value: String(s.id), label: `${s.name} · #${s.id}` })) ?? []),
                  ]
                  : [{ value: String(snapshot?.subaccount.id), label: `${snapshot?.subaccount.name} · #${snapshot?.subaccount.id}` }]
                }
              />
            </div>
            <div className="freshness">
              {snapshot && (
                <>
                  <span className={stale || expired ? "attention" : ""}>
                    <i
                      className={`status-dot ${stale || expired ? "old" : ""}`}
                    />
                    {stale || expired
                      ? "Stale snapshot"
                      : mode === "sample"
                        ? "Fixed sample snapshot"
                        : "Snapshot retrieved"}
                  </span>
                  <small>{time(snapshot.retrievedAt)}</small>
                </>
              )}
            </div>
            <button
              className="button small"
              disabled={!!loading || !snapshot}
              onClick={refresh}
            >
              <Icon name="refresh" size={15} />
              Refresh
            </button>
          </section>
        )}
        {mode === "live" &&
          discovery &&
          discovery.subaccounts.length > 0 &&
          !selectedId && (
            <div className="surface empty">
              <h2>Choose one {accountLabel.toLowerCase()}</h2>
              <p>
                Each account has its own snapshot. Select a name and ID above to
                continue.
              </p>
            </div>
          )}

        {snapshot && scenario && (
          <>
            {(stale || expired) && (
              <div className="alert" role="alert">
                <Icon name="info" />
                <div>
                  <strong>Stale snapshot · calculations paused</strong>
                  <p>
                    The original retrieval time is preserved. Refresh for
                    current data.
                  </p>
                </div>
                <button
                  className="button small"
                  disabled={!!loading}
                  onClick={refresh}
                >
                  Retry refresh
                </button>
              </div>
            )}
            <div className="workspace-grid">
              <section
                className="surface scenario"
                aria-labelledby="scenario-heading"
              >
                <div className="panel-heading">
                  <div className="scenario-title">
                    <span className="scenario-icon">
                      <Icon name="sliders" />
                    </span>
                    <h2 id="scenario-heading" ref={scenarioHeading} tabIndex={-1}>What if the market moves?</h2>
                  </div>
                  <span className="model-tag">PRICE ONLY</span>
                </div>
                <div className="scenario-result">
                  <div className="result-label">Perp price P&amp;L change</div>
                  <div
                    aria-live="polite"
                    aria-atomic="true"
                    data-testid="scenario-total"
                  >
                    {disabled ? (
                      <div className="result-number unavailable">
                        Unavailable
                      </div>
                    ) : scenario.totals.length ? (
                      scenario.totals.map((t) => (
                        <div
                          className={`result-number ${tone(t.delta)}`}
                          key={t.quote}
                        >
                          {formatDecimal(t.delta, 2, true)}
                          <span>{t.quote}</span>
                        </div>
                      ))
                    ) : (
                      <div className="result-number unavailable">
                        No modeled positions
                      </div>
                    )}
                  </div>
                  <p>
                    {disabled || (
                      <>
                        {shock === 0
                          ? "No price move applied."
                          : `If supported perp prices move ${sign(shock)} together.`}
                        <br />
                        Based on snapshot at {time(snapshot.retrievedAt)}.
                      </>
                    )}
                  </p>
                </div>
                <div className="shock-control">
                  <div className="control-label">
                    <label htmlFor="shock">Shared price move</label>
                    <output htmlFor="shock">{sign(shock)}</output>
                  </div>
                  <input
                    id="shock"
                    type="range"
                    min="-20"
                    max="20"
                    step="1"
                    value={shock}
                    disabled={!!disabled}
                    onChange={(e) => setShock(Number(e.target.value))}
                    aria-valuetext={`${shock > 0 ? "plus " : ""}${shock} percent`}
                    style={
                      {
                        "--range-position": `${(shock + 20) * 2.5}%`,
                      } as React.CSSProperties
                    }
                  />
                  <div className="range-labels">
                    <span>−20% market down</span>
                    <span>Market up +20%</span>
                  </div>
                  <div className="presets" aria-label="Price move presets">
                    {PRESETS.map((p) => (
                      <button
                        key={p}
                        className={p === shock ? "active" : ""}
                        aria-pressed={p === shock}
                        disabled={!!disabled}
                        onClick={() => setShock(p)}
                      >
                        {sign(p)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="contributions">
                  <div className="contribution-heading">
                    <h3 ref={contributionsHeading} tabIndex={-1}>Position contributions</h3>
                    <span>Incremental P&amp;L</span>
                  </div>
                  {scenario.included.map((c) => (
                    <div className="contribution" key={c.id}>
                      <div className="contribution-label">
                        <span>
                          {c.market}
                          <small>
                            {new Decimal(c.size).isNegative()
                              ? "Short"
                              : "Long"}
                          </small>
                        </span>
                        <strong className={disabled ? "" : tone(c.delta)}>
                          {disabled
                            ? "—"
                            : `${formatDecimal(c.delta, 2, true)} ${c.quote}`}
                        </strong>
                      </div>
                      <div className="bar-track">
                        <span className="bar-center" />
                        {!disabled && (
                          <span
                            className={`bar-fill ${tone(c.delta)}`}
                            style={{
                              width: largest.isZero()
                                ? "0%"
                                : `${new Decimal(c.delta).abs().div(largest).mul(48).toNumber()}%`,
                              left: new Decimal(c.delta).isNegative()
                                ? undefined
                                : "50%",
                              right: new Decimal(c.delta).isNegative()
                                ? "50%"
                                : undefined,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                  {!scenario.included.length && (
                    <p className="muted">
                      No eligible price contributions in this snapshot.
                    </p>
                  )}
                </div>
                <div className="coverage">
                  <Icon
                    name={scenario.excluded.length ? "info" : "check"}
                    size={17}
                  />
                  <div>
                    <strong>
                      Modeled positions only: {scenario.eligible} of{" "}
                      {scenario.totalPositions}
                    </strong>
                    <p>
                      {scenario.excluded.length
                        ? scenario.excluded
                            .map((e) => `${e.market}: Excluded — ${e.reason}`)
                            .join(" ")
                        : "All listed perpetual positions are covered by this price model."}
                    </p>
                  </div>
                </div>
                <p className="assumption-line">
                  Fixed position sizes. Excludes collateral-price changes,
                  future fills, funding, fees, borrowing interest, and
                  liquidation effects.
                </p>
                <div className="scenario-actions">
                  <button
                    className="button download"
                    disabled={!!disabled || !scenario.included.length}
                    onClick={download}
                  >
                    <Icon name="download" size={16} />
                    Download report <span>JSON</span>
                  </button>
                  <button
                    className="text-button"
                    disabled={!!disabled || shock === 0}
                    onClick={() => setShock(0)}
                  >
                    Reset
                  </button>
                </div>
              </section>
              <div className="baseline-section">
                <div className="section-kicker">
                  {mode === 'sample' && snapshot.protocol?.id === 'pacifica' ? 'PORTFOLIO OVERVIEW' : 'ACCOUNT SNAPSHOT'}{" "}
                  <span>
                    {mode === "sample" ? "Fixture baseline" : "Current baseline"} ·
                    independent of the scenario
                  </span>
                </div>
                <section className="metrics" aria-label="Baseline account metrics">
                  {snapshot.metrics.slice(0, 3).map((metric) => (
                    <article className="surface metric" key={metric.label}>
                      <div className="metric-label">
                        {metric.label}
                        <span title={metric.explanation}>
                          <Icon name="info" size={14} />
                        </span>
                      </div>
                      <div
                        className={`metric-value ${metric.value === null ? "unavailable" : ""}`}
                      >
                        {metric.value === null
                          ? "Unavailable"
                          : formatDecimal(
                              metric.value,
                              metric.unit === "%" ? 0 : 2,
                            )}
                        {metric.value !== null && <span>{metric.unit}</span>}
                      </div>
                      <p>{metric.explanation}</p>
                    </article>
                  ))}
                </section>
              </div>
              <div className="positions-column">
                <section
                  className="surface positions"
                  aria-labelledby="positions-heading"
                >
                  <div className="panel-heading">
                    <div>
                      <h2 id="positions-heading">Your perpetual positions</h2>
                      <p>{mode === 'sample' ? 'Your sample. Add perps and adjust the inputs.' : snapshotProtocol.id === 'jupiter' ? 'Verified position inventory. Current prices and payoff are not modeled.' : 'Fixed sizes. Snapshot oracle prices.'}</p>
                    </div>
                    <span className="count-badge">
                      {snapshot.positions.length}
                    </span>
                  </div>
                  {mode === 'sample' ? <SampleBuilder key={sampleId} snapshot={snapshot} onChange={editSample} /> : snapshotProtocol.id === 'jupiter' && snapshot.positions.length ? <JupiterPositions positions={snapshot.positions} /> : snapshot.positions.length ? (
                    <>
                      <div className="position-table">
                        <table>
                          <thead>
                            <tr>
                              <th>Market / side</th>
                              <th>Signed size</th>
                              <th>Oracle price</th>
                              <th>Notional</th>
                            </tr>
                          </thead>
                          <tbody>
                            {snapshot.positions.map((p) => (
                              <tr key={p.id}>
                                <td>
                                  <Market position={p} />
                                </td>
                                <td>
                                  {formatDecimal(p.size, 5, true)}
                                  <small>{p.asset}</small>
                                </td>
                                <td>
                                  {formatDecimal(p.price, 2)}
                                  <small>{p.quote}</small>
                                </td>
                                <td>
                                  {formatDecimal(p.notional, 2)}
                                  <small>{p.quote}</small>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="position-cards">
                        {snapshot.positions.map((p) => (
                          <article className="position-card" key={p.id}>
                            <Market position={p} />
                            <dl>
                              <div>
                                <dt>Signed size</dt>
                                <dd>
                                  {formatDecimal(p.size, 5, true)} {p.asset}
                                </dd>
                              </div>
                              <div>
                                <dt>Oracle price</dt>
                                <dd>
                                  {formatDecimal(p.price, 2)} {p.quote}
                                </dd>
                              </div>
                              <div>
                                <dt>Notional</dt>
                                <dd>
                                  {formatDecimal(p.notional, 2)} {p.quote}
                                </dd>
                              </div>
                            </dl>
                          </article>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="empty compact">
                      <h3>No open perpetual positions</h3>
                      <p>Spot balances and orders are still listed below.</p>
                    </div>
                  )}
                  <div className="table-note">
                    Notional = absolute size × price. It is not account equity.
                  </div>
                </section>
                <section
                  className="surface inventory"
                  aria-labelledby="inventory-heading"
                >
                  <div className="panel-heading">
                    <div>
                      <h2 id="inventory-heading">Outside this price model</h2>
                      <p>Other account exposure stays visible.</p>
                    </div>
                    <Icon name="info" size={17} />
                  </div>
                  {!snapshot.inventoryAvailable && (
                    <p className="inventory-warning attention">
                      Some inventory data is unavailable. See source notes in
                      Method.
                    </p>
                  )}
                  <div className="inventory-group">
                    <h3>Spot collateral & debt</h3>
                    {snapshot.spots.length ? (
                      snapshot.spots.map((s, i) => (
                        <div className="inventory-row" key={`${s.market}-${i}`}>
                          <span>
                            <span
                              className={`inventory-dot ${s.kind === "Debt" ? "debt" : ""}`}
                            />
                            {s.market}
                            <small>{s.kind}</small>
                          </span>
                          <span>
                            {formatDecimal(s.amount, 5)}
                            {s.explanation && <small>{s.explanation}</small>}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="muted">
                        {snapshot.inventoryAvailable
                          ? "No spot balances."
                          : "Spot balances unavailable."}
                      </p>
                    )}
                  </div>
                  <div className="inventory-group orders">
                    <h3>
                      Open orders <span>Future fills excluded</span>
                    </h3>
                    {snapshot.orders.length ? (
                      snapshot.orders.map((o) => (
                        <div className="inventory-row" key={o.market}>
                          <span>{o.market}</span>
                          <span>
                            {o.count} {o.count === 1 ? "order" : "orders"}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="muted">
                        {snapshot.inventoryAvailable
                          ? "No open orders."
                          : "Open-order inventory unavailable."}
                      </p>
                    )}
                  </div>
                </section>
              </div>
            </div>
            {!!snapshot.warnings.length && (
              <div className="source-warnings">
                {snapshot.warnings.map((w) => (
                  <p key={w}>
                    <Icon name="info" size={14} />
                    {w}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
        <footer>
          <span className="footer-brand">
            <Mark size={20} />
            Made for a clearer view.
          </span>
          <span>
            Solana · {mode === "sample" ? "Samples" : protocol.label} <span className="footer-dot">/</span>{" "}
            {mode === "sample" ? "Sample data" : "Mainnet public account data"}
          </span>
        </footer>
      </main>
      <div className="toast" role="status">
        {notice && (
          <span>
            <Icon name="check" size={16} />
            {notice}
          </span>
        )}
      </div>
      <dialog
        ref={dialog}
        className="method-drawer"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeMethod();
        }}
        onCancel={restoreMethodFocus}
        aria-labelledby="method-title"
      >
        <div className="drawer-content">
          <div className="drawer-header">
            <div>
              <div className="eyebrow">THE DETAILS BEHIND THE NUMBER</div>
              <h2 id="method-title">Method & coverage</h2>
            </div>
            <button
              className="icon-button"
              autoFocus
              aria-label="Close Method"
              onClick={closeMethod}
            >
              <Icon name="close" size={22} />
            </button>
          </div>
          <p className="drawer-intro">
            One frozen snapshot. One shared price move. A narrow view of the
            effect on existing perpetual positions.
          </p>
          <section>
            <h3>The calculation</h3>
            <div className="formula">
              signed size × oracle price × price move
            </div>
            <p>
              Positive size means Long; negative size means Short. Hypothetical
              price = baseline price × (1 + shock). Linear perpetuals
              with verified market identity, quote
              denomination, and valid oracle data are eligible. Totals stay
              separate when quote currencies differ.
            </p>
          </section>
          <section>
            <h3>What stays unchanged</h3>
            <ul>
              {ASSUMPTIONS.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <p>
              The result is an incremental perp price effect. Baseline account
              metrics come from the selected provider; no hypothetical account
              equity, liquidation threshold, or future health is calculated.
            </p>
          </section>
          {snapshot && (
            <>
              <section>
                <h3>Current coverage</h3>
                <p>
                  <strong>
                    Modeled positions only: {scenario?.eligible} of{" "}
                    {scenario?.totalPositions}
                  </strong>
                </p>
                <ul>
                  {snapshot.positions.map((p) => (
                    <li key={p.id}>
                      <strong>{p.market}</strong> —{" "}
                      {scenario?.included.some((c) => c.id === p.id)
                        ? "Modeled"
                        : `Excluded: ${scenario?.excluded.find((e) => e.id === p.id)?.reason ?? p.exclusionReason}`}
                      {p.isolated ? " · Isolated position" : ""}
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3>Data provenance</h3>
                <dl className="provenance">
                  <div>
                    <dt>Source</dt>
                    <dd>
                      {snapshot.source === "sample"
                        ? "Sample fixture — not a live read"
                        : apiSnapshot ? "Pacifica public API" : `${snapshotProtocol.label} SDK · Solana RPC`}
                    </dd>
                  </div>
                  {snapshot.source === "live" && snapshotProtocol.programId && (
                    <div>
                      <dt>Program</dt>
                      <dd className="full-address">{snapshotProtocol.programId}</dd>
                    </div>
                  )}
                  {snapshot.source === "live" && apiSnapshot && (
                    <div><dt>API source</dt><dd>https://api.pacifica.fi</dd></div>
                  )}
                  <div>
                    <dt>Network</dt>
                    <dd>{snapshot.network}</dd>
                  </div>
                  <div>
                    <dt>Subaccount</dt>
                    <dd>
                      {snapshot.subaccount.name} · #{snapshot.subaccount.id}
                    </dd>
                  </div>
                  <div>
                    <dt>Retrieved</dt>
                    <dd>{time(snapshot.retrievedAt)}</dd>
                  </div>
                  <div>
                    <dt>Account read slot</dt>
                    <dd>{snapshot.accountSlot ?? (snapshot.source === "sample" ? "Unavailable (sample)" : "Not supplied by provider")}</dd>
                  </div>
                  <div>
                    <dt>Observed RPC slot</dt>
                    <dd>{snapshot.observedSlot ?? (snapshot.source === "sample" ? "Unavailable (sample)" : "Not supplied by provider")}</dd>
                  </div>
                  {snapshot.authority && (
                    <div>
                      <dt>Authority</dt>
                      <dd className="full-address">
                        {snapshot.authority}
                        <button
                          className="icon-button"
                          aria-label="Copy authority from Method"
                          onClick={() => copy(snapshot.authority!)}
                        >
                          <Icon name="copy" size={14} />
                        </button>
                      </dd>
                    </div>
                  )}
                  {snapshot.subaccount.address && (
                    <div>
                      <dt>User account</dt>
                      <dd className="full-address">
                        {snapshot.subaccount.address}
                        <button
                          className="icon-button"
                          aria-label="Copy subaccount address"
                          onClick={() => copy(snapshot.subaccount.address!)}
                        >
                          <Icon name="copy" size={14} />
                        </button>
                        <a
                          href={`https://explorer.solana.com/address/${snapshot.subaccount.address}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Explorer ↗
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
                <ul>
                  {snapshot.provenance.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                <p>
                  {snapshot.source === 'sample' ? 'Sample baseline prices are fixed or user-edited; no provider is read when you edit them. ' : apiSnapshot ? "Account and price data are separate public API reads. Pacifica does not supply Solana observation slots or oracle confidence intervals. " : "Reads may come from different slots; this is not an atomic same-slot snapshot. "}
                  Live scenarios expire at most 120 seconds after retrieval.
                  Price age is checked separately and can require an earlier refresh.
                  These are conservative app freshness rules, not protocol
                  liquidation rules.
                </p>
              </section>
              <section>
                <h3>{snapshot.source === 'sample' ? 'Sample baseline prices' : 'Oracle observations'}</h3>
                {snapshot.positions.map((p) => (
                  <div className="oracle-row" key={p.id}>
                    <strong>{p.market}</strong>
                    <p>
                      {snapshot.source === 'sample' ? `Sample price: ${formatDecimal(p.price, 8)} ${p.quote}` : apiSnapshot ? `API price timestamp: ${p.oracle.observedAt ? time(p.oracle.observedAt) : "Unavailable"}` : `Oracle slot: ${p.oracle.slot ?? "Unavailable"} · Read slot: ${p.oracle.readSlot ?? "Unavailable"}`}
                      <br />
                      {p.oracle.valid
                        ? "Accepted for this snapshot"
                        : "Invalid / unavailable"}
                      {p.oracle.reason ? ` · ${p.oracle.reason}` : ""}
                    </p>
                  </div>
                ))}
              </section>
            </>
          )}
          <section>
            <h3>Official references</h3>
            {apiSnapshot && (
              <a href="https://docs.pacifica.fi/api-documentation/api/rest-api" target="_blank" rel="noreferrer">Pacifica public API documentation ↗</a>
            )}
            {snapshotProtocol.id === "jupiter" && <><a href="https://developers.jup.ag/docs/perps/position-account" target="_blank" rel="noreferrer">Jupiter position units and maximum-profit constraints ↗</a><a href="https://developers.jup.ag/docs/perps/custody-account" target="_blank" rel="noreferrer">Jupiter custody and oracle metadata ↗</a></>}
            {!apiSnapshot && snapshotProtocol.id !== "jupiter" && <>
            {snapshotProtocol.id === "velocity" && (
              <a href="https://docs.velocity.exchange/developers/migrate-from-drift" target="_blank" rel="noreferrer">
                Velocity deployment and migration reference ↗
              </a>
            )}
            <a
              href="https://drift-labs-protocol-v2.mintlify.app/api/drift-client"
              target="_blank"
              rel="noreferrer"
            >
              Legacy Drift account and market reads ↗
            </a>
            <a
              href="https://github.com/drift-labs/protocol-v2/blob/master/sdk/src/user.ts"
              target="_blank"
              rel="noreferrer"
            >
              SDK baseline metric implementation ↗
            </a>
            <a
              href="https://github.com/drift-labs/protocol-v2/blob/master/sdk/src/constants/numericConstants.ts"
              target="_blank"
              rel="noreferrer"
            >
              SDK precision constants ↗
            </a>
            </>}
          </section>
        </div>
      </dialog>
    </>
  );
}

function Market({ position: p }: { position: Position }) {
  const isShort = new Decimal(p.size).isNegative();
  return (
    <div className="market">
      <TokenIcon asset={p.asset} size={34} />
      <div>
        <strong>{p.market}</strong>
        <small>
          <span className={isShort ? "side short" : "side long"}>
            {isShort
              ? "↘ Short"
              : new Decimal(p.size).isZero()
                ? "Zero base"
                : "↗ Long"}
          </span>
          {!p.modeled && <span className="excluded-tag">Excluded</span>}
          {p.isolated && <span>Isolated</span>}
        </small>
      </div>
    </div>
  );
}
