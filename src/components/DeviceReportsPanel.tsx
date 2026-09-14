'use client';

import { useEffect, useRef, useState } from 'react';
import type { createReport } from '@/lib/report';
import { formatDecimal } from '@/lib/format';
import { DEVICE_REPORTS_KEY, deleteDeviceReport, listDeviceReports, saveDeviceReport, type DeviceReport } from '@/lib/device-reports';
import styles from './AccountPanel.module.css';

type Report = ReturnType<typeof createReport>;

export default function DeviceReportsPanel({ report }: { report: Report | null }) {
  const [reports, setReports] = useState<DeviceReport[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  function load() {
    try { setReports(listDeviceReports()); setError(''); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'This browser could not open your saved reports.'); }
  }
  useEffect(() => {
    const changed = (event: StorageEvent) => { if (event.key === DEVICE_REPORTS_KEY && dialog.current?.open) load(); };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  function save() {
    if (!report) return;
    try {
      saveDeviceReport(report, `${report.sampleName || 'Public account'} · ${report.scenario.shockPercent}% move`);
      load(); setMessage('Saved on this device. You can return to it after reloading.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'This browser could not save the report. Download JSON instead.'); }
  }
  function remove(id: string) {
    try { deleteDeviceReport(id); load(); setMessage('Report deleted from this device.'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'This browser could not delete the report.'); }
  }
  function download(item: DeviceReport) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(item.report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `buffer-saved-${item.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    <button className="button subtle" ref={trigger} onClick={() => { dialog.current?.showModal(); setMessage(''); load(); }}>My reports</button>
    <dialog className={styles.dialog} ref={dialog} aria-labelledby="device-reports-title" onClose={() => trigger.current?.focus()}>
      <div className={styles.heading}><div><p className="eyebrow">ON THIS DEVICE</p><h2 id="device-reports-title">Saved perspectives.</h2></div><button className="button subtle" aria-label="Close saved reports" onClick={() => dialog.current?.close()}>×</button></div>
      <p>Save a dated scenario and return to its explanation. No sign-up needed. These historical reports stay in this browser and do not refresh with the market.</p>
      <button className="button primary" disabled={!report} onClick={save}>Save current scenario</button>
      <p role="status" aria-live="polite">{message}</p>
      {error && <p role="alert">{error} <button className="button subtle" onClick={load}>Retry</button></p>}
      {!error && reports.length === 0 && <p>No reports saved yet.</p>}
      <ul className={styles.list}>{reports.map(item => <li key={item.id}>
        <strong>{item.title}</strong><small>{new Date(item.created_at).toLocaleString()} · {item.report.sourceMode === 'sample' ? 'Preset fixture' : 'Live snapshot'} · Historical</small>
        <details className={styles.summary}><summary>View saved explanation</summary>
          <p>Perp price P&amp;L change at {item.report.scenario.shockPercent}%</p>
          {item.report.scenario.totalsByQuoteCurrency.map(total => <p className={styles.total} key={total.quote}>{formatDecimal(total.delta, 2, true)} <span>{total.quote}</span></p>)}
          {item.report.scenario.includedPositions.map(position => <div className={styles.contribution} key={position.id}><span>{position.market}</span><strong>{formatDecimal(position.delta, 2, true)} {position.quote}</strong></div>)}
          <p>{item.report.scenario.modeledPositions} of {item.report.scenario.totalPositions} positions modeled. Snapshot: {new Date(item.report.snapshotTime).toLocaleString()}.</p>
          {item.report.scenario.excludedPositions.map(position => <p key={position.id}>{position.market}: {position.reason}</p>)}
          <p className={styles.note}>{item.report.assumptions.join(' ')}</p>
        </details>
        <div className={styles.actions}><button className="button subtle" onClick={() => download(item)}>Download JSON</button><button className="button subtle" onClick={() => remove(item.id)}>Delete</button></div>
      </li>)}</ul>
      <p className={styles.note}>Up to 20 reports on this device. Clearing browser data removes them; download a copy to keep it. Anyone using this browser profile can open this library.</p>
      <a className="button subtle" href="/auth">Sign in for cloud reports</a>
    </dialog>
  </>;
}
