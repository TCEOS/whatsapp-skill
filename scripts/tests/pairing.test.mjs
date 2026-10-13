import { test, expect } from 'bun:test';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { monitorSocket, completePairing, disconnectCode } from '../lib/pairing.mjs';
import { acquirePairLock } from '../lib/pair-lock.mjs';

function connection(creds = {}, save = async () => {}) {
	const sock = { ev: new EventEmitter(), authState: { creds }, ws: { close() {} }, end() {} };
	return { sock, monitor: monitorSocket(sock, save) };
}
const closed = (code) => ({ connection: 'close', lastDisconnect: { error: { output: { statusCode: code } } } });
const options = { phone: '15555550101', timeoutMs: 250, stableMs: 10, retryDelayMs: 0 };

test('515 flushes credentials before replacement; reuses auth and requests exactly one code', async () => {
	let requests = 0, creates = 0, persisted = false;
	const result = await completePairing({ ...options, createConnection: async () => {
		if (++creates === 1) {
			const c = connection({}, async () => { await Bun.sleep(5); persisted = !!c.sock.authState.creds.registered; });
			c.sock.requestPairingCode = async () => {
				requests++;
				Object.assign(c.sock.authState.creds, { registered: true, account: {} });
				c.sock.ev.emit('creds.update', {});
				c.sock.ev.emit('connection.update', closed(515));
				return 'ABCDEFGH';
			};
			c.sock.ev.emit('connection.update', { qr: 'server-ready' });
			return c;
		}
		expect(persisted).toBe(true);
		const c = connection({ registered: true, account: {} });
		c.sock.requestPairingCode = async () => { throw new Error('Must reuse credentials'); };
		c.sock.ev.emit('connection.update', { connection: 'open', receivedPendingNotifications: true });
		return c;
	} });
	expect(creates).toBe(2);
	expect(requests).toBe(1);
	expect(result.reconnects).toBe(1);
	result.connection.monitor.dispose();
});

test('registered creds without authenticated open never count as success', async () => {
	await expect(completePairing({ ...options, timeoutMs: 40,
		createConnection: async () => connection({ registered: true, account: {} }) })).rejects.toThrow('Timed out');
});

test('open without pending-notification initialization never counts as success', async () => {
	await expect(completePairing({ ...options, timeoutMs: 40, createConnection: async () => {
		const c = connection({ registered: true, account: {} });
		c.sock.ev.emit('connection.update', { connection: 'open' });
		return c;
	} })).rejects.toThrow('Timed out');
});

test('401 after credentials were saved is terminal, not success or a code refresh', async () => {
	let creates = 0;
	await expect(completePairing({ ...options, createConnection: async () => {
		creates++;
		const c = connection({ registered: true, account: {} });
		c.sock.ev.emit('connection.update', closed(401));
		return c;
	} })).rejects.toThrow('code 401');
	expect(creates).toBe(1);
});

test('pending attempt times out without replacing its code', async () => {
	let requests = 0;
	await expect(completePairing({ ...options, timeoutMs: 50, createConnection: async () => {
		const c = connection();
		c.sock.ev.emit('connection.update', { qr: 'ready' });
		c.sock.requestPairingCode = async () => { requests++; return 'ABCDEFGH'; };
		return c;
	} })).rejects.toThrow('Timed out');
	expect(requests).toBe(1);
});

test('disconnect during stabilization invalidates success', async () => {
	await expect(completePairing({ ...options, stableMs: 60, createConnection: async () => {
		const c = connection({ registered: true, account: {} });
		c.sock.ev.emit('connection.update', { connection: 'open', receivedPendingNotifications: true });
		setTimeout(() => c.sock.ev.emit('connection.update', closed(401)), 5);
		return c;
	} })).rejects.toThrow('during initialization');
});

test('credential write failure prevents success', async () => {
	await expect(completePairing({ ...options, createConnection: async () => {
		const c = connection({ registered: true, account: {} }, async () => { throw new Error('disk full'); });
		c.sock.ev.emit('connection.update', { connection: 'open', receivedPendingNotifications: true });
		return c;
	} })).rejects.toThrow('disk full');
});

test('connection state captured before wait and listeners disposed', async () => {
	const c = connection();
	c.sock.ev.emit('connection.update', closed(515));
	expect(await c.monitor.wait((s) => s.connection === 'close', 10)).toBe(true);
	expect(c.monitor.state.code).toBe(515);
	expect(disconnectCode({ lastDisconnect: { error: { cause: { output: { statusCode: 515 } } } } })).toBe(515);
	c.monitor.dispose();
	expect(c.sock.ev.listenerCount('connection.update')).toBe(0);
	expect(c.sock.ev.listenerCount('creds.update')).toBe(0);
});

test('session lock prevents simultaneous pairing and releases for the next attempt', () => {
	const base = fs.mkdtempSync(path.join(os.tmpdir(), 'baileys-pair-test-'));
	try {
		const release = acquirePairLock(base, 'personal');
		expect(() => acquirePairLock(base, 'personal')).toThrow('Another pairing process');
		release();
		acquirePairLock(base, 'personal')();
	} finally { fs.rmSync(base, { recursive: true, force: true }); }
});
