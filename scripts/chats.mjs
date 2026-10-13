#!/usr/bin/env bun
// Manage chats with a paired session (no HTTP, no server).
// Usage:
//   bun scripts/chats.mjs --session personal <command> [options]
// Run with --help for the full command list.
import { parseArgs, requireArg, fail } from './lib/args.mjs';
import { connectSession, closeAndExit, toJid, readLocalSession } from './lib/session.mjs';

const args = parseArgs(process.argv.slice(2));
const [cmd] = args._;
if (args.help || !cmd) {
	console.log(`Manage chats with a paired session.

Usage:
  bun scripts/chats.mjs --session <name> <command> [options]

Organization:
  archive --jid <phone|jid>               Archive the chat
  unarchive --jid <phone|jid>             Unarchive the chat
  pin --jid <phone|jid>                   Pin the chat on top
  unpin --jid <phone|jid>                 Unpin the chat
  mute --jid <phone|jid> --duration <sec> Mute notifications (unmute to remove)
  unmute --jid <phone|jid>                Unmute the chat

Read state:
  read --jid <phone|jid> --ids <id1,id2>  Mark messages as read
  unread --jid <phone|jid> --id <msg-id>   Mark the chat as unread

Starred:
  star --jid <phone|jid> --id <msg-id>     Star a message (--unstar to remove)

Danger zone (local history):
  clear --jid <phone|jid>                 Clear all messages in the chat
  delete --jid <phone|jid>                Delete the whole chat

Examples:
  bun scripts/chats.mjs --session personal mute --jid 15555550101 --duration 3600
  bun scripts/chats.mjs --session personal star --jid 15555550101 --id EXAMPLE_MESSAGE_ID`);
	process.exit(args.help ? 0 : 1);
}

const session = requireArg(args, 'session', 'personal');
const timeoutMs = Number(args.timeout || 60) * 1000;
const verbose = !!args.verbose;
const dataDir = args['data-dir'] ? String(args['data-dir']) : undefined;

const local = readLocalSession(session, dataDir);
if (!local.exists || !local.registered) {
	fail(`Session "${session}" is not paired. Pair it first: bun scripts/pair.mjs --phone <digits> --session ${session}`, 3);
}

function asJid(value, example) {
	try {
		return toJid(value);
	} catch (e) {
		fail(e.message);
	}
}

// ---- Validate BEFORE connecting (fail fast, offline-friendly) ----
const JID_EX = '15555550101';
const NEED_JID = ['archive', 'unarchive', 'pin', 'unpin', 'mute', 'unmute', 'read', 'unread', 'star', 'clear', 'delete'];
let plan;
if (!NEED_JID.includes(cmd)) {
	fail(`Unknown command: ${cmd}. Run with --help.`);
}
const groupJid = asJid(requireArg(args, 'jid', JID_EX));
if (cmd === 'mute') {
	const duration = Number(requireArg(args, 'duration', '3600'));
	if (!Number.isInteger(duration) || duration < 1) fail(`Invalid --duration: ${args.duration}. Use seconds > 0.`);
	plan = { cmd, groupJid, duration };
} else if (cmd === 'read') {
	const ids = String(requireArg(args, 'ids', 'id1,id2')).split(',').map((s) => s.trim()).filter(Boolean);
	if (ids.length === 0) fail('Missing --ids.');
	plan = { cmd, groupJid, ids };
} else if (cmd === 'unread' || cmd === 'star') {
	plan = { cmd, groupJid, id: requireArg(args, 'id', 'EXAMPLE_MESSAGE_ID'), unstar: !!args.unstar };
} else {
	plan = { cmd, groupJid };
}

let sock;
try {
	({ sock } = await connectSession(session, { dataDir, timeoutMs, verbose }));
} catch (e) {
	fail(`Could not connect with session "${session}": ${e.message}`, 2);
}

try {
	switch (plan.cmd) {
		case 'archive':
			await sock.chatModify({ archive: true, lastMessages: [] }, plan.groupJid);
			console.log(`Archived ${plan.groupJid}.`);
			break;
		case 'unarchive':
			await sock.chatModify({ archive: false, lastMessages: [] }, plan.groupJid);
			console.log(`Unarchived ${plan.groupJid}.`);
			break;
		case 'pin':
			await sock.chatModify({ pin: true }, plan.groupJid);
			console.log(`Pinned ${plan.groupJid}.`);
			break;
		case 'unpin':
			await sock.chatModify({ pin: false }, plan.groupJid);
			console.log(`Unpinned ${plan.groupJid}.`);
			break;
		case 'mute':
			await sock.chatModify({ mute: plan.duration }, plan.groupJid);
			console.log(`Muted ${plan.groupJid} for ${plan.duration}s.`);
			break;
		case 'unmute':
			await sock.chatModify({ mute: null }, plan.groupJid);
			console.log(`Unmuted ${plan.groupJid}.`);
			break;
		case 'read':
			await sock.readMessages(plan.ids.map((id) => ({ remoteJid: plan.groupJid, id })));
			console.log(`Marked ${plan.ids.length} message(s) as read in ${plan.groupJid}.`);
			break;
		case 'unread':
			await sock.chatModify({
				markRead: false,
				lastMessages: [{ key: { remoteJid: plan.groupJid, id: plan.id, fromMe: false }, messageTimestamp: Math.floor(Date.now() / 1000) }],
			}, plan.groupJid);
			console.log(`Marked ${plan.groupJid} as unread.`);
			break;
		case 'star':
			await sock.chatModify({ star: { messages: [{ id: plan.id, fromMe: true }], star: !plan.unstar } }, plan.groupJid);
			console.log(`${plan.unstar ? 'Unstarred' : 'Starred'} message ${plan.id}.`);
			break;
		case 'clear':
			await sock.chatModify({ clear: true, lastMessages: [] }, plan.groupJid);
			console.log(`Cleared messages in ${plan.groupJid}.`);
			break;
		case 'delete':
			await sock.chatModify({ delete: true, lastMessages: [] }, plan.groupJid);
			console.log(`Deleted chat ${plan.groupJid}.`);
			break;
	}
	await closeAndExit(sock, 0);
} catch (e) {
	fail(`Chats command failed: ${e.message}`, 2);
}
