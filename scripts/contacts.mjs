#!/usr/bin/env bun
// Check contacts with a paired session (no HTTP, no server).
// Usage:
//   bun scripts/contacts.mjs --session my-wpp check --jid 15555550101
//   bun scripts/contacts.mjs --session my-wpp photo --jid 15555550101
import { parseArgs, requireArg, fail } from './lib/args.mjs';
import { connectSession, closeAndExit, toJid, readLocalSession } from './lib/session.mjs';

const args = parseArgs(process.argv.slice(2));
const [cmd] = args._;
if (args.help || !cmd) {
	console.log(`Check contacts with a paired session.

Usage:
  bun scripts/contacts.mjs --session <name> <command> [options]

Commands:
  check --jid <phone|jid>   Verify the number exists on WhatsApp
  photo --jid <phone|jid>   Print the profile picture URL

Examples:
  bun scripts/contacts.mjs --session ventas check --jid 15555550101
  bun scripts/contacts.mjs --session ventas photo --jid 15555550101`);
	process.exit(args.help ? 0 : 1);
}

const session = requireArg(args, 'session', 'ventas');
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
	if (cmd === 'check') {
		let jid;
		try {
			jid = toJid(requireArg(args, 'jid', '15555550101'));
		} catch (e) {
			fail(e.message);
		}
		const [res] = await sock.onWhatsApp(jid);
		if (res?.exists) console.log(`${jid} EXISTS on WhatsApp.`);
		else console.log(`${jid} does NOT exist on WhatsApp.`);
	} else if (cmd === 'photo') {
		let jid;
		try {
			jid = toJid(requireArg(args, 'jid', '15555550101'));
		} catch (e) {
			fail(e.message);
		}
		const url = await sock.profilePictureUrl(jid, 'image');
		console.log(url || 'No profile picture.');
	} else {
		fail(`Unknown command: ${cmd}. Use check or photo.`);
	}
	await closeAndExit(sock, 0);
} catch (e) {
	fail(`Contacts command failed: ${e.message}`, 2);
}
