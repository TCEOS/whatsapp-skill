import { test, expect } from 'bun:test';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { proto } from 'baileys';
import { filterMessages, formatMessages, historyStats } from '../lib/history-view.mjs';
import { createHistoryStore } from '../lib/history-store.mjs';
import { selectPage, encodeCursor, decodeCursor } from '../lib/history-page.mjs';

const jid = '123@s.whatsapp.net';
const message = (id, timestamp = 1700000000, chat = jid) => ({ key: { remoteJid: chat, id, fromMe: false }, messageTimestamp: timestamp, message: { conversation: 'A'.repeat(400) } });
test('initial history survives process reload; upserts deduplicate without truncation', () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baileys-history-'));
	try {
		const store = createHistoryStore(directory), sock = { ev: new EventEmitter() };
		store.bind(sock);
		sock.ev.emit('messaging-history.set', { messages: [message('A')], contacts: [{ id: jid, name: 'Contact' }] });
		sock.ev.emit('messages.upsert', { messages: [message('A'), message('B', 1700000001)] });
		const reloaded = createHistoryStore(directory);
		expect(reloaded.get(jid).map(m => m.key.id)).toEqual(['B', 'A']);
		expect(reloaded.get(jid)[0].message.conversation.length).toBe(400);
		expect(reloaded.list()[0].name).toBe('Contact');
	} finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('PN/LID mapping arriving after a message retains the old cached message', () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baileys-history-'));
	try {
		const store = createHistoryStore(directory);
		store.messages([message('A', 1700000000, '456@lid')]);
		store.contacts([{ id: jid, lid: '456@lid', name: 'Contact' }]);
		expect(createHistoryStore(directory).get(jid).map(m => m.key.id)).toEqual(['A']);
	} finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('pagination retains messages in the same second and rejects another chat cursor', () => {
	const messages = [message('C'), message('B'), message('A')];
	const cursor = decodeCursor(encodeCursor(messages[0], jid), jid);
	const page = selectPage(messages, cursor, 2);
	const older = selectPage(messages, decodeCursor(encodeCursor(page[1], jid), jid), 2);
	 expect(page.map(m => m.key.id)).toEqual(['B', 'A']);
	 expect(older).toEqual([]);
	 expect(() => decodeCursor(encodeCursor(messages[0], jid), 'different@g.us')).toThrow();
	 expect(() => decodeCursor('garbage', jid)).toThrow();
	 for (const invalid of [{ id: { not: 'a string' } }, { participant: 123 }]) {
		 const token = Buffer.from(JSON.stringify({ ...cursor, ...invalid })).toString('base64url');
		 expect(() => decodeCursor(token, jid)).toThrow();
	 }
});
test('cached CLI fails for missing history and returns complete text for saved messages', () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baileys-history-cli-'));
	try {
		const session = path.join(directory, 'fixture');
		fs.mkdirSync(session);
		fs.writeFileSync(path.join(session, 'creds.json'), JSON.stringify({ registered: true }));
		const command = [process.execPath, fileURLToPath(new URL('../history.mjs', import.meta.url)), '--data-dir', directory,
			'--session', 'fixture', '--to', jid, '--cached', '--format', 'json', '--max-text', '0'];
		const empty = Bun.spawnSync(command);
		expect(empty.exitCode).toBe(2);
		expect(empty.stdout.toString()).toBe('');
		createHistoryStore(session).messages([message('A')]);
		const saved = Bun.spawnSync(command);
		expect(saved.exitCode).toBe(0);
		const result = JSON.parse(saved.stdout.toString());
		expect(result.messages[0].text).toHaveLength(400);
		expect(result.source).toBe('cache');
		expect(result.endOfHistory).toBe(false);
		const noMatches = Bun.spawnSync([...command, '--search', 'not-present']);
		expect(noMatches.exitCode).toBe(0);
		expect(JSON.parse(noMatches.stdout.toString()).count).toBe(0);
		expect(JSON.parse(noMatches.stdout.toString()).query.search).toBe('not-present');
		createHistoryStore(session).messages(Array.from({ length: 10 }, (_, i) => message(`export-${i}`, 1700000000 + i)));
		const exported = Bun.spawnSync([...command, '--format', 'compact', '--max-output-chars', '1000', '--limit', '10']);
		expect(exported.exitCode).toBe(0);
		const receipt = JSON.parse(exported.stdout.toString());
		expect(receipt.count).toBe(10);
		expect(receipt.messages).toBeUndefined();
		expect(JSON.parse(fs.readFileSync(receipt.file, 'utf8')).messages).toHaveLength(10);
	} finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('protobuf timestamps and binary values survive disk reload', () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baileys-history-proto-'));
	try {
		const original = proto.WebMessageInfo.fromObject({ ...message('A'), message: { imageMessage: { caption: 'A', jpegThumbnail: Buffer.from([1, 2, 3]) } } });
		createHistoryStore(directory).messages([original]);
		const reloaded = createHistoryStore(directory).get(jid)[0];
		expect(Number(reloaded.messageTimestamp)).toBe(1700000000);
		expect(Buffer.from(reloaded.message.imageMessage.jpegThumbnail)).toEqual(Buffer.from([1, 2, 3]));
		expect(decodeCursor(encodeCursor(reloaded, jid), jid).timestamp).toBe(1700000000);
	} finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('compact output reduces metadata and filters complete text before clipping', () => {
	const messages = Array.from({ length: 50 }, (_, i) => message(String(i), 1700000000 + i));
	const compact = JSON.stringify(formatMessages(messages, { maxText: 0 }));
	const detailed = JSON.stringify(formatMessages(messages, { format: 'json', maxText: 0 }));
	 expect(compact.length).toBeLessThan(detailed.length);
	const long = message('find'); long.message.conversation = 'A'.repeat(400) + ' calendario';
	const found = filterMessages([long], { search: 'CALENDARIO', after: 1699999999, before: 1700000001 });
	 expect(found).toHaveLength(1);
	 expect(formatMessages(found).truncated).toBe(1);
	 expect(formatMessages(found).messages[0][2]).toHaveLength(241);
	 expect(historyStats(found).characters).toBe(411);
	 expect(filterMessages(found, { after: 1700000002 })).toHaveLength(0);
});
test('both identifiers return identical records and pagination for one contact', () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baileys-history-alias-'));
	try {
		const store = createHistoryStore(directory);
		store.messages([message('A', 1700000000, '456@lid')]);
		store.contacts([{ id: jid, lid: '456@lid' }]);
		store.messages([message('B', 1700000001, jid)]);
		expect(store.get(jid)).toEqual(store.get('456@lid'));
		expect(store.resolve('456@lid')).toBe(jid);
	} finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('connected CLI applies filters before choosing its cached page', () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'baileys-history-live-fixture-'));
	try {
		const session = path.join(directory, 'fixture');
		fs.mkdirSync(session);
		fs.writeFileSync(path.join(session, 'creds.json'), JSON.stringify({ registered: true }));
		const relevant = message('relevant', 1700000000);
		relevant.message.conversation = 'Calendar proposal';
		const unrelated = message('unrelated', 1700000001);
		unrelated.message.conversation = 'Unrelated text';
		createHistoryStore(session).messages([unrelated, relevant]);
		const sessionModule = fileURLToPath(new URL('../lib/session.mjs', import.meta.url));
		const storeModule = fileURLToPath(new URL('../lib/history-store.mjs', import.meta.url));
		const preload = path.join(directory, 'fixture-preload.mjs');
		fs.writeFileSync(preload, `import { mock } from 'bun:test';
import * as actual from ${JSON.stringify(sessionModule)};
import { createHistoryStore } from ${JSON.stringify(storeModule)};
mock.module(${JSON.stringify(sessionModule)}, () => ({ ...actual,
 connectSession: async () => ({ sock: {}, historyStore: createHistoryStore(${JSON.stringify(session)}) }),
 closeAndExit: async (_, code) => process.exit(code),
}));`);
		const result = Bun.spawnSync([process.execPath, '--preload', preload,
			fileURLToPath(new URL('../history.mjs', import.meta.url)), '--data-dir', directory,
			'--session', 'fixture', '--to', jid, '--search', 'Calendar', '--limit', '1', '--format', 'json']);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout.toString());
		expect(output.messages.map(m => m.id)).toEqual(['relevant']);
		expect(output.query.search).toBe('Calendar');
	} finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
