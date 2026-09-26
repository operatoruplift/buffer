"use client";

import { isDiscoveryResponse, isSnapshotResponse } from "@/lib/live-response";

import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import Decimal from "decimal.js";
import { SAMPLE_ACCOUNTS, getSampleSnapshot } from "@/lib/samples";
import { CUSTOM_SAMPLE_ID, CUSTOM_SAMPLE_NAME, DEFAULT_SAMPLE_ID, getPortfolioSampleSnapshot } from "@/lib/sample-builder";
import {
  ASSUMPTIONS,
  FRESHNESS_SECONDS,
  calculateScenario,
} from "@/lib/scenario";
import { formatDecimal, formatUtc } from "@/lib/format";
import { createReport } from "@/lib/report";
import type { ApiError, Discovery, Position, Snapshot } from "@/lib/types";
import { PROTOCOLS, type ProtocolId } from "@/lib/protocols";
import { CONFIGURED_PERP_MARKETS, REFERENCE_PERP_CATALOG } from "@/lib/perp-markets";
import { isPublicAddress, LIVE_RISK_EXAMPLE, PUBLIC_ACCOUNT_EXAMPLES, type LiveLink } from "@/lib/live-link";
import { Icon, Mark } from "./Icons";
import { Brand } from './Brand';
import { TokenIcon } from './TokenIcon';
import { JupiterPositions } from './JupiterPositions';
import Select from "./Select";
import SampleBuilder from './SampleBuilder';
import AccountPanel from './AccountPanel';
import WalletAddressButton from './WalletAddressButton';
import AlertsPanel from './AlertsPanel';
import Link from 'next/link';

const PRESETS = [-20, -10, -5, 0, 5, 10, 20];
const sign = (n: number) => (n > 0 ? `+${n}%` : `${n}%`);
const tone = (value: string) =>
  new Decimal(value).isZero()
    ? ""
    : new Decimal(value).isPositive()
      ? "positive"
      : "negative";
const short = (address: string) =>
  `${address.slice(0, 5)}…${address.slice(-5)}`;
// One timestamp format across the app, shared with saved reports and monitoring.
const time = formatUtc;

export default function Dashboard({
  liveConfigured,
  initialLiveLink = { state: "none" },
}: {
  liveConfigured: boolean;
  initialLiveLink?: LiveLink;
}) {
  const [sampleId, setSampleId] = useState(DEFAULT_SAMPLE_ID);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(() =>
    initialLiveLink.state === "ready" ? null : getPortfolioSampleSnapshot(),
  );
  const [mode, setMode] = useState<"sample" | "live">(initialLiveLink.state === "ready" ? "live" : "sample");
  const [protocolId, setProtocolId] = useState<ProtocolId>(initialLiveLink.state === "ready" ? initialLiveLink.selection.protocol : "velocity");
  const [publicExample, setPublicExample] = useState(initialLiveLink.state === "ready" && PUBLIC_ACCOUNT_EXAMPLES[initialLiveLink.selection.protocol] === initialLiveLink.selection.authority);
  const [marketSearch, setMarketSearch] = useState("");
  const [address, setAddress] = useState(initialLiveLink.state === "ready" ? initialLiveLink.selection.authority : "");
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [choosingAccount, setChoosingAccount] = useState(false);
  const [shock, setShock] = useState(0);
  const [loading, setLoading] = useState<string | null>(initialLiveLink.state === "ready" ? `Finding ${PROTOCOLS[initialLiveLink.selection.protocol].label} accounts…` : null);
  const [error, setError] = useState<ApiError | null>(null);
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(0);
  const [guideVisible, setGuideVisible] = useState(true);
  const routeSeen = useRef(false);
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
  const exampleAuthority = PUBLIC_ACCOUNT_EXAMPLES[protocolId];
  const accountLabel = mode === "live" && (protocolId === "pacifica" || protocolId === "jupiter") ? "Account" : "Subaccount";
  const selectedAuthority = discovery?.authority ?? address.trim();
  const previousScope = snapshot?.source === 'live' && mode === 'live' && (
    snapshotProtocol.id !== protocolId || snapshot.authority !== discovery?.authority ||
    selectedId === '' || snapshot.subaccount.id !== Number(selectedId)
  );
  const canRefresh = mode === 'sample' || Boolean(discovery && selectedId !== '');
  // Only a composition change makes the portfolio the reader's own; a denomination
  // change keeps the preset's identity and its place in the preset list.
  const customPortfolio = mode === "sample" && snapshot?.sampleName === CUSTOM_SAMPLE_NAME;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      abort.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (choosingAccount) document.getElementById('subaccount')?.focus();
  }, [choosingAccount]);
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
    // The edited portfolio is the picker's current value, not a preset to load.
    if (id === CUSTOM_SAMPLE_ID) return;
    cancel();
    setSampleId(id);
    setMode("sample");
    setPublicExample(false);
    setSnapshot(getSampleSnapshot(id));
    setDiscovery(null);
    setSelectedId("");
    setChoosingAccount(false);
    setShock(0);
    setError(null);
    setStale(false);
    setLoading(null);
    setNotice("Preset loaded. Price move reset to 0%.");
  }
  function retainLiveSnapshot() {
    // A new live selection must never show a fixture as if it came from that
    // account. Keep an earlier live observation only, explicitly marked stale.
    setSnapshot(previous => previous?.source === 'live' ? previous : null);
    setStale(snapshot?.source === 'live');
  }
  function changeProtocol(id: ProtocolId) {
    cancel();
    setProtocolId(id);
    setMarketSearch("");
    setDiscovery(null);
    setSelectedId("");
    setChoosingAccount(false);
    if (mode === "live") retainLiveSnapshot();
    setShock(0);
    setError(null);
    setLoading(null);
    setNotice("");
    setPublicExample(false);
  }
  async function fetchJson<T>(url: string): Promise<T> {
    const timeout = AbortSignal.timeout(25_000);
    const signal = abort.current ? AbortSignal.any([abort.current.signal, timeout]) : timeout;
    try {
      const response = await fetch(url, { signal, cache: "no-store" });
      if (!response.body) throw new Error('Account response was empty');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 8 * 1024 * 1024) {
          await reader.cancel();
          throw new Error('Account response exceeds the read limit');
        }
        chunks.push(chunk.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const body = JSON.parse(new TextDecoder().decode(bytes));
      if (!response.ok) throw body.error ?? {
        code: "READ_FAILED", message: "The account could not be read. Please retry.", retryable: true,
      };
      return body as T;
    } catch (error) {
      if (timeout.aborted) throw { code: 'READ_TIMEOUT', message: 'The account read took too long. Retry for a fresh observation.', retryable: true };
      throw error;
    }
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
    options?: { authority: string; protocol: ProtocolId; publicExample?: boolean; subaccount?: number },
  ) {
    event?.preventDefault();
    const authority = (options?.authority ?? address).trim();
    const requestedProtocol = options?.protocol ?? protocolId;
    if (!isPublicAddress(authority)) {
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
    retainLiveSnapshot();
    setDiscovery(null);
    setSelectedId("");
    setChoosingAccount(false);
    setShock(0);
    setError(null);
    setLoading(`Finding ${PROTOCOLS[requestedProtocol].label} accounts…`);
    retry.current = () => {
      void readAccount(undefined, { authority, protocol: requestedProtocol, publicExample: options?.publicExample, subaccount: options?.subaccount });
    };
    try {
      const result = await fetchJson<unknown>(
        `/api/accounts?authority=${encodeURIComponent(authority)}&protocol=${requestedProtocol}`,
      );
      if (ticket !== request.current) return;
      if (!isDiscoveryResponse(result, authority, requestedProtocol)) throw new Error('Invalid discovery response');
      setDiscovery(result);
      const selected = options?.subaccount === undefined
        ? result.subaccounts.length === 1 ? result.subaccounts[0] : undefined
        : result.subaccounts.find(account => account.id === options.subaccount);
      if (options?.subaccount !== undefined && !selected) {
        setError({ code: 'ACCOUNT_NOT_FOUND', message: 'The linked subaccount was not returned for this authority. Choose a discovered account or explore a preset.', retryable: false });
        setChoosingAccount(true);
      } else if (selected) {
        await readSnapshot(String(selected.id), false, result);
      } else {
        setChoosingAccount(true);
      }
    } catch (e) {
      if (ticket === request.current) setError(safeError(e));
    } finally {
      if (ticket === request.current) setLoading(null);
    }
  }
  async function readSnapshot(id: string, refreshing = false, selectedDiscovery = discovery) {
    if (!selectedDiscovery || !id) {
      cancel();
      setSelectedId("");
      setChoosingAccount(false);
      retainLiveSnapshot();
      setLoading(null);
      return;
    }
    const ticket = cancel();
    const requestedProtocol = selectedDiscovery.protocol?.id ?? protocolId;
    setSelectedId(id);
    setChoosingAccount(false);
    setLoading(
      refreshing ? "Refreshing snapshot…" : "Reading selected subaccount…",
    );
    setError(null);
    if (!refreshing) {
      retainLiveSnapshot();
      setShock(0);
    }
    retry.current = () => {
      void readSnapshot(id, refreshing, selectedDiscovery);
    };
    try {
      const result = await fetchJson<unknown>(
        `/api/snapshot?authority=${encodeURIComponent(selectedDiscovery.authority)}&subaccount=${id}&protocol=${requestedProtocol}`,
      );
      if (ticket !== request.current) return;
      const account = selectedDiscovery.subaccounts.find(account => account.id === Number(id));
      if (!account || !isSnapshotResponse(result, selectedDiscovery.authority, requestedProtocol, Number(id), account.address)) throw new Error('Invalid snapshot response');
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
  const syncLiveLink = useEffectEvent((link: LiveLink) => {
    if (link.state === 'ready') {
      const selection = link.selection;
      void readAccount(undefined, { ...selection, publicExample: PUBLIC_ACCOUNT_EXAMPLES[selection.protocol] === selection.authority });
    } else if (link.state === 'invalid') {
      sample(DEFAULT_SAMPLE_ID);
      setError({ code: 'INVALID_LINK', message: link.message, retryable: false });
    } else if (routeSeen.current) {
      sample(DEFAULT_SAMPLE_ID);
    }
    routeSeen.current = true;
  });
  const liveLinkKey = JSON.stringify(initialLiveLink);
  // A new server-rendered query is an external navigation: cancel its predecessor and start a bounded public read.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { syncLiveLink(JSON.parse(liveLinkKey) as LiveLink); }, [liveLinkKey]);

  function refresh() {
    if (mode === "sample") {
      setShock(0);
      setError(null);
      setNotice('Preset inputs kept. Price move reset to 0%.');
    }
    else if (canRefresh) void readSnapshot(selectedId, true);
  }
  function editSample(next: Snapshot) {
    if (mode !== 'sample' || snapshot?.source !== 'sample' || next.source !== 'sample') return;
    setSnapshot(next);
    setNotice('Preset portfolio updated. Your current price move is applied to the new inputs.');
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
    ? previousScope
      ? "Previous account snapshot retained. Load the selected account before calculating."
      : "Previous snapshot retained after a failed read. Retry to calculate."
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

  const addressPanel = (
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
            <div className="address-wallet">
              <WalletAddressButton
                disabled={!!loading}
                onAddress={(walletAddress) => {
                  setPublicExample(false);
                  void readAccount(undefined, { authority: walletAddress, protocol: protocolId });
                }}
              />
            </div>
          </form>
          <div className="address-bottom">
            <p id="address-help">
              {protocolId === "jupiter" ? "Read Jupiter positions by public wallet. Inventory only; price scenarios are unavailable." : protocolId === "pacifica"
                ? "Read your Pacifica wallet account. No wallet connection needed."
                : liveConfigured
                ? `Read positions from one ${protocol.label} subaccount. No wallet connection needed.`
                : "Live reads require server RPC configuration. Explore the presets below."}
            </p>
            <div className="sample-picker">
              <label htmlFor="sample">Try a preset</label>
              <Select
                id="sample"
                label="Try a preset"
                value={mode !== "sample" ? "" : customPortfolio ? CUSTOM_SAMPLE_ID : sampleId}
                onChange={sample}
                placeholder="Select preset"
                options={[
                  // The edited portfolio is a real listed choice, so the control
                  // always displays a value its own list contains.
                  ...(customPortfolio ? [{ value: CUSTOM_SAMPLE_ID, label: CUSTOM_SAMPLE_NAME, description: 'Your edited portfolio. Choose a preset to start from one of the fixtures again.' }] : []),
                  ...SAMPLE_ACCOUNTS.map((s) => ({ value: s.id, label: s.name, description: s.description })),
                ]}
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
                <p>This directory lists the markets a live read on {protocol.label} covers. The preset portfolio builder draws on the {REFERENCE_PERP_CATALOG.label} instead: the same {REFERENCE_PERP_CATALOG.markets} perpetual identities for every preset and every protocol selection. {protocolId === "jupiter" ? "SOL, ETH, and BTC positions are read as inventory. USD accounting, collateral, entry prices, and reserved tokens are shown separately; no Jupiter price effect is calculated." : "Each position needs current, usable price data. Market availability can change."}</p>
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
  );

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to dashboard
      </a>
      <header className="header">
        <div className="header-inner">
          <Link className="brand" href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Brand />
            <span className="brand-divider" />
            <span className="descriptor">
              Solana <span>·</span> {mode === "sample" ? "Examples" : protocol.label}
            </span>
          </Link>
          <div className="header-actions">
            <AccountPanel report={snapshot && scenario && !disabled ? createReport(snapshot, scenario) : null} />
            <span className={`mode ${mode}`}>
              <i />
              {mode === "sample" ? "Demo mode" : "Live mode"}
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
      <main id="main" className={`dashboard ${mode === "live" && snapshot ? "dashboard-has-live" : ""}`}>
        <div className="page-heading">
          <div>
            <div className="eyebrow">POSITION EXPLORER</div>
            <h1>A little more perspective.</h1>
            <p>Your positions today. A clearer view of a market move.</p>
          </div>
          {mode === 'sample' ? <div className="live-risk-entry">
            <button className="button primary" onClick={() => void readAccount(undefined, { ...LIVE_RISK_EXAMPLE, publicExample: true })}>
              Explore live risk <Icon name="arrow" size={16} />
            </button>
            <span>Public Velocity account · fresh data · no sign-in</span>
          </div> : <span className="readonly"><Icon name="check" size={15} />Public data. No permissions.</span>}
        </div>

        {mode === "sample" && (
          <section className={`sample-guide ${guideVisible ? "" : "collapsed"}`} aria-label="Demo quick start">
            <div className="guide-heading">
              <div>
                <span className="sample-tag">DEMO</span>
                <strong>See a market move in three steps.</strong>
              </div>
              <button
                className="icon-button"
                aria-label={guideVisible ? "Hide demo guide" : "Show demo guide"}
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

        {!(mode === 'live' && snapshot) && addressPanel}

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
            {mode === 'live' && <button className="button small" onClick={() => sample(DEFAULT_SAMPLE_ID)}>Explore a preset</button>}
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
            <span className="sample-tag">DEMO</span>
            <span>
              Editable preset positions and fixed baseline prices. Add perps,
              choose a denomination, and build your own scenario.
            </span>
          </div>
        )}
        {mode === "live" && publicExample && (
          <p className="public-example-note">Public example account on {protocol.label}. Balances and positions can change. This is a fresh public read; the account is not yours.</p>
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
              Explore a preset
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
                    : short(selectedAuthority)}
                  {mode === "live" && (
                    <>
                      <button className="text-button change-address" onClick={() => { const field = document.getElementById('address'); field?.focus(); field?.scrollIntoView({ block: 'center', behavior: 'auto' }); }}>Change address</button>
                      <button
                        className="icon-button"
                        aria-label="Copy full authority address"
                        onClick={() => copy(selectedAuthority)}
                      >
                        <Icon name="copy" size={15} />
                      </button>
                      <a
                        className="icon-button"
                        aria-label="View authority on Solana Explorer"
                        href={`https://explorer.solana.com/address/${selectedAuthority}`}
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
              {mode === 'live' && discovery?.subaccounts.length === 1 && selectedId && !choosingAccount ? <div className="selected-subaccount">
                <span>{accountLabel}</span>
                <strong>{discovery?.subaccounts.find(account => String(account.id) === selectedId)?.name} · #{selectedId}</strong>
                <button type="button" className="text-button" aria-label={`Change ${accountLabel.toLowerCase()}`} onClick={() => setChoosingAccount(true)}>Change</button>
              </div> : <>
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
              </>}
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
                        ? "Fixed reference snapshot"
                        : "Snapshot retrieved"}
                  </span>
                  <small>{time(snapshot.retrievedAt)}</small>
                </>
              )}
            </div>
            <button
              className="button small"
              disabled={!!loading || !snapshot || !canRefresh}
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
                    {previousScope
                      ? `Showing the previous ${snapshotProtocol.label} observation for ${snapshot.authority}, ${snapshot.subaccount.name} · #${snapshot.subaccount.id}. These values do not describe the new selection. Load the selected account for current data.`
                      : 'The original retrieval time is preserved. Refresh for current data.'}
                  </p>
                </div>
                <button
                  className="button small"
                  disabled={!!loading || !canRefresh}
                  onClick={refresh}
                >
                  Retry refresh
                </button>
              </div>
            )}
            <div className={`workspace-grid ${mode === 'live' ? 'live-workspace' : ''}`}>
              {mode === 'live' && <section className="surface risk-context" aria-labelledby="risk-context-heading" data-risk-status={stale || expired || loading ? 'unavailable' : snapshot.risk?.status ?? 'unavailable'}>
                <div className="risk-context-heading">
                  <div><h2 id="risk-context-heading">Current risk context</h2><p>{snapshotProtocol.label} · {snapshot.risk?.scope ?? 'Account scope'}</p></div>
                  <strong className="risk-status">{stale || expired || loading ? 'Stale observation' : snapshot.risk?.status === 'clear' ? 'Meets maintenance' : snapshot.risk?.status === 'maintenance' ? 'Below maintenance' : snapshot.risk?.status === 'liquidating' ? 'SDK liquidation flag' : 'Unavailable'}</strong>
                </div>
                <div className="current-headroom"><span>Maintenance headroom</span><strong data-testid="current-headroom">{snapshot.risk?.maintenanceHeadroom == null ? 'Unavailable' : `${formatDecimal(snapshot.risk.maintenanceHeadroom, 2, true)} USD`}</strong></div>
                {snapshot.risk && <div className="risk-values">
                  <div><span>Maintenance collateral</span><strong>{snapshot.risk.totalCollateral === null ? 'Unavailable' : `${formatDecimal(snapshot.risk.totalCollateral, 2)} USD`}</strong></div>
                  <div><span>Maintenance requirement</span><strong>{snapshot.risk.maintenanceRequirement === null ? 'Unavailable' : `${formatDecimal(snapshot.risk.maintenanceRequirement, 2)} USD`}</strong></div>
                </div>}
                <p className="risk-context-note">{snapshot.risk?.explanation ?? 'This provider does not supply a verified maintenance-risk reading. Position inventory and supported price scenarios remain separate.'}</p>
                <p className="risk-context-note risk-freshness">Observed {time(snapshot.retrievedAt)}. {stale || expired || loading ? 'Refresh the selected account for current risk.' : 'Current account observation; not changed by the price slider.'}</p>
              </section>}

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
                  {mode === 'sample' && snapshot.catalog ? 'PORTFOLIO OVERVIEW' : 'ACCOUNT SNAPSHOT'}{" "}
                  <span>
                    {mode === "sample" ? "Reference baseline" : "Current baseline"} ·
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
                      <p>{mode === 'sample' ? 'Your preset. Add perps and adjust the inputs.' : snapshotProtocol.id === 'jupiter' ? 'Verified position inventory. Current prices and payoff are not modeled.' : 'Fixed sizes. Snapshot oracle prices.'}</p>
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
              <div className="monitoring-section"><AlertsPanel snapshot={snapshot} stale={stale || expired || Boolean(loading)} scopeChanged={Boolean(previousScope || loading)} /></div>
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
        {mode === 'live' && (!snapshot || !scenario) && <AlertsPanel snapshot={null} scopeChanged={Boolean(loading)} />}
        {mode === 'live' && snapshot && addressPanel}
        <footer>
          <span className="footer-brand">
            <Mark size={20} />
            Made for a clearer view.
          </span>
          <span>
            Solana · {mode === "sample" ? "Examples" : protocol.label} <span className="footer-dot">/</span>{" "}
            {mode === "sample" ? "Reference data" : "Mainnet public account data"}
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
                        ? "Reference fixture — no live read"
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
                  {snapshot.catalog && (
                    <div>
                      <dt>Market catalog</dt>
                      <dd>
                        {snapshot.catalog.label} · {snapshot.catalog.markets} perpetual
                        identities captured from {snapshot.catalog.source} at{" "}
                        {time(snapshot.catalog.capturedAt)}. The same list serves every preset
                        and every protocol selection; it names identities, not an account or a
                        venue read.
                      </dd>
                    </div>
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
                    <dd>{snapshot.accountSlot ?? (snapshot.source === "sample" ? "Unavailable (fixture)" : "Not supplied by provider")}</dd>
                  </div>
                  <div>
                    <dt>Observed RPC slot</dt>
                    <dd>{snapshot.observedSlot ?? (snapshot.source === "sample" ? "Unavailable (fixture)" : "Not supplied by provider")}</dd>
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
                  {snapshot.source === 'sample' ? 'Reference prices are fixed or user-edited; no provider is read when you edit them. ' : apiSnapshot ? "Account and price data are separate public API reads. Pacifica does not supply Solana observation slots or oracle confidence intervals. " : "Reads may come from different slots; this is not an atomic same-slot snapshot. "}
                  Live scenarios expire at most 120 seconds after retrieval.
                  Price age is checked separately and can require an earlier refresh.
                  These are conservative app freshness rules, not protocol
                  liquidation rules.
                </p>
              </section>
              <section>
                <h3>{snapshot.source === 'sample' ? 'Reference prices' : 'Oracle observations'}</h3>
                {snapshot.positions.map((p) => (
                  <div className="oracle-row" key={p.id}>
                    <strong>{p.market}</strong>
                    <p>
                      {snapshot.source === 'sample' ? `Reference price: ${formatDecimal(p.price, 8)} ${p.quote}` : apiSnapshot ? `API price timestamp: ${p.oracle.observedAt ? time(p.oracle.observedAt) : "Unavailable"}` : `Oracle slot: ${p.oracle.slot ?? "Unavailable"} · Read slot: ${p.oracle.readSlot ?? "Unavailable"}`}
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
