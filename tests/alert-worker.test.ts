import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { openAlertStore } from '../scripts/lib/alert-store.mjs';
import { type AlertStore } from '../src/lib/alerts';

const execute = promisify(execFile);
const temporary: string[] = [];
async function path() { const directory = await mkdtemp(join(tmpdir(), 'buffer-alert-test-')); temporary.push(directory); return join(directory, 'alerts.sqlite'); }
async function worker(file: string, args: string[] = ['--fixture']) {
  return execute(process.execPath, ['scripts/alert-worker.mjs', ...args], { cwd: resolve('.'), env: { ...process.env, BUFFER_ALERT_STORE: file }, timeout: 25_000 });
}
function read(file: string): AlertStore { const db = openAlertStore(file); try { return db.read(); } finally { db.close(); } }
afterEach(async () => { await Promise.all(temporary.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

describe('SQLite durable mock worker', () => {
  it('survives restart with a single event and delivery', async () => {
    const file = await path();
    await worker(file); await worker(file);
    const store = read(file);
    expect(store.rules).toHaveLength(1);
    expect(store.events).toHaveLength(1);
    expect(store.deliveries).toHaveLength(1);
    expect(store.outbox[0].attempts).toBe(1);
  }, 30_000);
  it('serializes independent concurrent runners without duplicate rules or sends', async () => {
    const file = await path();
    await Promise.all(Array.from({ length: 6 }, () => worker(file)));
    const store = read(file);
    expect(store.rules).toHaveLength(1);
    expect(store.events).toHaveLength(1);
    expect(store.outbox).toHaveLength(1);
    expect(store.deliveries).toHaveLength(1);
  }, 30_000);
  it('recovers a claim committed before a worker exits and honors pause before completion', async () => {
    const file = await path();
    await worker(file, ['--fixture', '--claim-only']);
    let store = read(file);
    expect(store.outbox[0].state).toBe('claimed');
    expect(store.deliveries).toHaveLength(0);
    const db = openAlertStore(file);
    db.transaction((state: AlertStore) => { state.outbox[0].leaseUntil = new Date(Date.now() - 1000).toISOString(); return state; });
    db.close();
    await worker(file);
    store = read(file);
    expect(store.outbox[0].attempts).toBe(2);
    expect(store.deliveries).toHaveLength(1);
    await worker(file, ['--pause', store.rules[0].id]);
    await worker(file);
    expect(read(file).deliveries).toHaveLength(1);
    expect(read(file).rules[0].enabled).toBe(false);
  }, 30_000);
  it('atomically rolls back an interrupted state transaction', async () => {
    const file = await path();
    await worker(file, ['--fixture', '--claim-only']);
    const before = read(file);
    await execute(process.execPath, ['--input-type=module', '-e', `
      import { DatabaseSync } from 'node:sqlite';
      const db = new DatabaseSync(process.env.BUFFER_ALERT_STORE);
      db.exec('BEGIN IMMEDIATE');
      db.prepare('UPDATE alert_state SET body=? WHERE id=1').run('corrupt-uncommitted');
      process.exit(0);
    `], { env: { ...process.env, BUFFER_ALERT_STORE: file } });
    expect(read(file)).toEqual(before);
  }, 30_000);
  it('fails closed on corrupt persisted state and invalid snapshot files', async () => {
    const file = await path();
    await worker(file);
    await execute(process.execPath, ['--input-type=module', '-e', `
      import { DatabaseSync } from 'node:sqlite';
      const db = new DatabaseSync(process.env.BUFFER_ALERT_STORE);
      db.prepare('UPDATE alert_state SET body=? WHERE id=1').run('{"version":1}');
      db.close();
    `], { env: { ...process.env, BUFFER_ALERT_STORE: file } });
    await expect(worker(file)).rejects.toThrow('Invalid alert store');
    const bad = join(temporary[0], 'invalid.json');
    await writeFile(bad, '{"source":"live"}');
    await expect(worker(await path(), ['--snapshot', bad])).rejects.toThrow('Invalid local snapshot');
  }, 30_000);
});
