#!/usr/bin/env bun
// React to a message with an emoji (no HTTP, no server).
// Usage:
//   bun scripts/react.mjs --session personal --to 15555550101 --id <message-id> --emoji "❤️"
import { parseArgs, requireArg, fail } from './lib/args.mjs';
import { connectSession, closeAndExit, toJid, readLocalSession } from './lib/session.mjs';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(`React to a message with an emoji.

Usage:
  bun scripts/react.mjs --session <name> --to <phone|jid> --id <message-id> [--emoji <emoji>] [--participant <jid>]

Examples:
  bun scripts/react.mjs --session personal --to 15555550101 --id EXAMPLE_MESSAGE_ID --emoji "❤️"

Use --participant for reactions in groups to other people's messages.`);
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
const emoji = args.emoji ? String(args.emoji) : '❤️';
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
		react: {
			text: emoji,
			key: { remoteJid: to, fromMe: true, id, ...(participant ? { participant } : {}) },
		},
	});
	console.log(`Reacted ${emoji} to message ${id} in ${to}.`);
	await closeAndExit(sock, 0);
} catch (e) {
	fail(`React failed: ${e.message}`, 2);
}
