#!/usr/bin/env bun
// Synthetic fixture only. No session files, socket, or WhatsApp network calls.
import { filterMessages, formatMessages, historyStats } from '../scripts/lib/history-view.mjs';

const chat = 'demo-chat';
const fixture = [
	['demo-004', 1767226200, false, 'Alex', 'The deadline is Friday at 17:00 UTC.'],
	['demo-003', 1767225900, true, 'Me', 'I will send the draft before the deadline.'],
	['demo-002', 1767225600, false, 'Alex', 'Please keep the sample anonymous.'],
	['demo-001', 1767225300, false, 'Alex', 'The draft needs a summary, setup commands, and a note about the history cache. ' + 'This fixture is invented for the offline demo. '.repeat(8)],
].map(([id, timestamp, fromMe, pushName, text]) => ({
	key: { id, remoteJid: chat, fromMe }, messageTimestamp: timestamp,
	pushName, message: { conversation: text },
}));

const filtered = filterMessages(fixture, { search: 'deadline' });
console.log('Synthetic messages; no WhatsApp connection.');
console.log('1. Inspect counts without printing message bodies');
console.log(JSON.stringify(historyStats(fixture)));
console.log('2. Search the cache and print compact rows');
console.log(JSON.stringify(formatMessages(filtered, { ids: true })));
console.log('3. Retrieve the complete text of one selected message');
console.log(JSON.stringify(formatMessages(filterMessages(fixture, { messageId: 'demo-001' }), { format: 'json', maxText: 0 })));

const verbose = JSON.stringify(formatMessages(fixture, { format: 'json', maxText: 0 }));
const compact = JSON.stringify(formatMessages(fixture));
console.log('Character counts for this fixture only; these are not token counts:');
console.log(JSON.stringify({ verbose: verbose.length, compact: compact.length }));
