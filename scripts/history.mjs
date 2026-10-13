#!/usr/bin/env bun
// Read stored Baileys messages; request older messages using a real message key.
import { proto } from 'baileys';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseArgs, requireArg, fail } from './lib/args.mjs';
import { connectSession, closeAndExit, toJid, readLocalSession, sessionDir } from './lib/session.mjs';
import { createHistoryStore } from './lib/history-store.mjs';
import { decodeCursor, encodeCursor, selectPage } from './lib/history-page.mjs';
import { filterMessages, formatMessages, historyStats } from './lib/history-view.mjs';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(`Read WhatsApp history with persistent local caching.
Usage: bun scripts/history.mjs --session <name> --to <phone|jid> [--limit 10] [--cursor <token>]
       bun scripts/history.mjs --session <name> --chats [--search <name>]
Options:
  --cached           Read saved messages without connecting to WhatsApp.
  --wait 20          Wait 5-120 seconds for an actual on-demand response.
  --limit 10         Output size 1-5000. Network fetches up to 50 older messages per call.
  --format compact|json  Compact rows by default; json includes full message metadata.
  --max-text 240     Preview length (default 240); 0 returns complete text.
  --search <text>    Filter message text locally, without printing unrelated messages.
  --after <ISO> --before <ISO>  Filter dates before printing. ISO offsets are supported.
  --message-id <id>  Read just one saved message; use --max-text 0 for complete text.
  --ids             Include message IDs in compact rows.
  --stats           Offline counts and date coverage instead of message bodies.
  --max-output-chars 12000  Auto-export larger results (0 disables the cap).
  --output-file <path>      Save messages to JSON and print only a small receipt.
  --include-system  Include internal protocol messages (hidden by default).
  --cursor <token>   Read older messages from the same chat.
  --anchor-id <id> --anchor-timestamp <epoch-seconds>
                     Bootstrap a cache lost before this version, using a REAL key.
  --anchor-from-me true|false --participant <jid>  Additional real anchor fields.
Timeouts are errors, not proof of empty history. nextCursor is not an end-of-history guarantee.
Initial history and incoming messages are cached by all paired scripts under data/<session>/history/.`);
	process.exit(0);
}
const session = requireArg(args, 'session', 'personal');
const dataDir = args['data-dir'] ? String(args['data-dir']) : undefined;
const local = readLocalSession(session, dataDir);
if (!local.exists || !local.registered) fail(`Session "${session}" is not paired.`, 3);
const store = createHistoryStore(sessionDir(session, dataDir));
if (args.chats) {
	const term = String(args.search || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
	console.log(JSON.stringify(store.list().filter(c => `${c.id} ${c.name || ''}`.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().includes(term)), null, 2));
	process.exit(0);
}
let to, cursor;
try {
	to = toJid(requireArg(args, 'to', '5491123456789'));
	cursor = args.cursor ? decodeCursor(String(args.cursor), to) : null;
} catch (e) { fail(e.message); }
const limit = Number(args.limit ?? 10);
const waitSecs = Number(args.wait ?? 20);
const timeoutMs = Number(args.timeout ?? 90) * 1000;
if (!Number.isInteger(limit) || limit < 1 || limit > 5000) fail('--limit must be 1-5000.');
if (!Number.isInteger(waitSecs) || waitSecs < 5 || waitSecs > 120) fail('--wait must be 5-120 seconds.');
if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300000) fail('--timeout must be 1-300 seconds.');
const format = String(args.format || 'compact');
const maxText = Number(args['max-text'] ?? 240);
const maxOutputChars = Number(args['max-output-chars'] ?? 12000);
if (!['compact', 'json'].includes(format)) fail('--format must be compact or json.');
if (!Number.isSafeInteger(maxText) || maxText < 0 || maxText > 100000) fail('--max-text must be 0-100000 (0 means complete text).');
if (!Number.isSafeInteger(maxOutputChars) || maxOutputChars < 0 || (maxOutputChars > 0 && maxOutputChars < 1000)) fail('--max-output-chars must be 0 or at least 1000.');
if (args['output-file'] === true) fail('--output-file needs a path.');
const dateArg = name => {
	if (!args[name]) return undefined;
	const milliseconds = Date.parse(String(args[name]));
	if (!Number.isFinite(milliseconds)) fail(`--${name} must be an ISO date/time.`);
	return Math.floor(milliseconds / 1000);
};
const filters = { search: String(args.search || ''), after: dateArg('after'), before: dateArg('before'),
	messageId: args['message-id'], includeSystem: !!args['include-system'] };
if (filters.after && filters.before && filters.after > filters.before) fail('--after must precede --before.');
const saved = historyStore => filterMessages(historyStore.get(to), filters);
const filteredQuery = !!(filters.search || filters.after || filters.before || filters.messageId);
let suppliedAnchor;
if (args['anchor-id'] || args['anchor-timestamp']) {
	const timestamp = Number(args['anchor-timestamp']);
	if (typeof args['anchor-id'] !== 'string' || !args['anchor-id'] || !Number.isSafeInteger(timestamp) || timestamp < 1 || timestamp > Math.floor(Date.now() / 1000) + 300) fail('A real --anchor-id and --anchor-timestamp in epoch seconds are required together.');
	if (args['anchor-from-me'] !== undefined && !['true', 'false'].includes(args['anchor-from-me'])) fail('--anchor-from-me must be true or false.');
	suppliedAnchor = { id: args['anchor-id'], timestamp, fromMe: args['anchor-from-me'] === 'true', participant: args.participant };
}
function output(page, source, responseReceived = false) {
	const result = { chat: to, source, count: page.length, ...formatMessages(page, { format, maxText, ids: !!args.ids, ownJid: local.me?.id }),
		...(filteredQuery ? { query: filters } : {}),
		nextCursor: page.length ? encodeCursor(page.at(-1), to) : cursor ? args.cursor : null,
		responseReceived, endOfHistory: false };
	const serialized = JSON.stringify(result, null, format === 'json' ? 2 : undefined);
	if (args['output-file'] || (maxOutputChars > 0 && serialized.length > maxOutputChars)) {
		const file = args['output-file'] ? path.resolve(String(args['output-file']))
			: path.join(sessionDir(session, dataDir), 'history', 'exports', `${Date.now()}-${randomUUID()}.json`);
		try {
			fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
			fs.writeFileSync(file, JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 });
		} catch (error) { fail(`Cannot export history: ${error.message}`, 2); }
		console.log(JSON.stringify({ chat: to, source, count: page.length, file, characters: serialized.length,
			truncated: result.truncated || 0, nextCursor: result.nextCursor, responseReceived, endOfHistory: false }));
	} else console.log(serialized);
}
if (args.stats) {
	console.log(JSON.stringify({ chat: to, source: 'cache', ...historyStats(saved(store)), endOfHistory: false }));
	process.exit(0);
}
let page = selectPage(saved(store), cursor, limit);
if (args.cached) {
	if (!page.length && !(filteredQuery && store.get(to).length)) fail('No messages are cached for this page. This does not prove the conversation is empty or finished.', 2);
	output(page, 'cache'); process.exit(0);
}
let sock;
const responses = [];
try {
	const connected = await connectSession(session, { dataDir, timeoutMs, verbose: !!args.verbose, syncFullHistory: true,
		onSocket(s) { s.ev.on('messaging-history.set', data => responses.push(data)); } });
	sock = connected.sock;
	const activeStore = connected.historyStore;
	page = selectPage(saved(activeStore), cursor, limit);
	const waitFor = async predicate => {
		const deadline = Date.now() + waitSecs * 1000;
		while (!predicate() && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
		return predicate();
	};
	if (!page.length && !suppliedAnchor && !cursor) {
		await waitFor(() => activeStore.get(to).length > 0);
		page = selectPage(saved(activeStore), cursor, limit);
	}
	if (page.length >= limit && !suppliedAnchor) {
		output(page, 'cache');
	} else {
		const known = activeStore.get(to);
		const last = page.at(-1) || (!cursor ? known[0] : undefined);
		const anchor = suppliedAnchor || (last ? { ...last.key, participant: last.key.participant || last.participant,
			timestamp: Number(last.messageTimestamp) } : cursor);
		if (!anchor) throw new Error('No messages or real anchor are stored for this chat. Reconnecting cannot recreate a discarded initial sync. Supply a real --anchor-id with --anchor-timestamp, or wait for incoming messages; never use a fabricated ID.');
		if (suppliedAnchor) {
			await sock.requestPlaceholderResend({ remoteJid: activeStore.resolve(to), id: anchor.id, fromMe: !!anchor.fromMe,
				...(anchor.participant ? { participant: anchor.participant } : {}) });
		}
		const start = responses.length;
		const requestId = await sock.fetchMessageHistory(Math.min(limit, 50), { remoteJid: activeStore.resolve(to), id: anchor.id, fromMe: !!anchor.fromMe,
			...(anchor.participant ? { participant: anchor.participant } : {}) }, anchor.timestamp);
		const matching = () => responses.slice(start).find(data => data.syncType === proto.Message.HistorySyncType.ON_DEMAND && data.peerDataRequestSessionId === requestId);
		const received = await waitFor(matching);
		page = selectPage(saved(activeStore), cursor, limit);
		const noMatchesInKnownHistory = filteredQuery && activeStore.get(to).length > 0;
		if (!received && !page.length && !noMatchesInKnownHistory) throw new Error(`No matching history response arrived in ${waitSecs}s. This is a timeout, not an empty conversation. Retry when the phone is available.`);
		if (!received) console.error('WARN: older-history request timed out; returning actual cached messages only.');
		if (received && !page.length && !noMatchesInKnownHistory) throw new Error('The phone returned no messages for this real anchor. This does not establish the end of the conversation; verify the anchor and phone availability.');
		output(page, received ? 'baileys' : 'cache', !!received);
	}
	await closeAndExit(sock, 0);
} catch (error) {
	console.error(`ERROR: ${error.message}`);
	if (sock) await closeAndExit(sock, 2);
	process.exit(2);
}
