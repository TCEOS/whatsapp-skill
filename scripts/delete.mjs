#!/usr/bin/env bun
// Delete a message (for everyone) with a paired session (no HTTP, no server).
// Works on your own messages (and, as group admin, on others' via --participant).
// Usage:
//   bun scripts/delete.mjs --session personal --to 15555550101 --id <message-id>
import { parseArgs, requireArg, fail } from './lib/args.mjs';
import { connectSession, closeAndExit, toJid, readLocalSession } from './lib/session.mjs';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(`Delete a message for everyone with a paired session.

Usage:
  bun scripts/delete.mjs --session <name> --to <phone|jid> --id <message-id> [--participant <jid>]

Examples:
  bun scripts/delete.mjs --session personal --to 15555550101 --id EXAMPLE_MESSAGE_ID

WhatsApp only allows deleting recent messages (about 2 days). Use --participant
with the author's JID to delete someone else's message as group admin.`);
	process.exit(0);
}

const session = requireArg(args, 'session', 'personal');
let to;
try {
	to = toJid(requireArg(args, 'to', '15555550101'));
} catch (e) {
	fail(e.message);
}
const id = requireArg(args, 'id', 'EXAMPLE_MESSAGE_ID');
const participant = args.participant ? String(args.participant) : undefined;
const timeoutMs = Number(args.timeout || 60) * 1000;
const verbose = !!args.verbose;
const dataDir = args['data-dir'] ? String(args['data-dir']) : undefined;

const local = readLocalSession(session, dataDir);
if (!local.exists || !local.registered) {
	fail(`Session "${session}" is not paired. Pair it first: bun scripts/pair.mjs --phone <digits> --session ${session}`, 3);
}

let sock;
try {
	({ sock } = await connectSession(session, { dataDir, timeoutMs, verbose }));
} catch (e) {
	fail(`Could not connect with session "${session}": ${e.message}`, 2);
}

try {
	await sock.sendMessage(to, {
		delete: { remoteJid: to, id, fromMe: !participant, ...(participant ? { participant } : {}) },
	});
	console.log(`Deleted message ${id} in ${to}.`);
	await closeAndExit(sock, 0);
} catch (e) {
	fail(`Delete failed: ${e.message}`, 2);
}
