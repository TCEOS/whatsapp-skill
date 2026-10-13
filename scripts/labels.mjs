#!/usr/bin/env bun
// Manage WhatsApp labels with a paired session (no HTTP, no server).
// NOTE: Baileys has no list-labels API (labels live in app state / phone UI).
// Usage:
//   bun scripts/labels.mjs --session personal <command> [options]
// Run with --help for the full command list.
import { parseArgs, requireArg, fail } from './lib/args.mjs';
import { connectSession, closeAndExit, toJid, readLocalSession } from './lib/session.mjs';

const args = parseArgs(process.argv.slice(2));
const [cmd] = args._;
if (args.help || !cmd) {
	console.log(`Manage WhatsApp labels with a paired session.

Usage:
  bun scripts/labels.mjs --session <name> <command> [options]

Labels:
  create --name <text> [--id <id>] [--color <0-19>]   Create a label

Chats:
  chat-add --jid <phone|jid> --label-id <id>          Label a chat
  chat-remove --jid <phone|jid> --label-id <id>       Unlabel a chat

Messages:
  message-add --jid <phone|jid> --message-id <id> --label-id <id>
  message-remove --jid <phone|jid> --message-id <id> --label-id <id>

Discovery (the phone UI never shows label IDs):
  watch [--timeout <sec>]                 Listen 60s (default) for label edits
                                          made on the phone and print their IDs

Examples:
  bun scripts/labels.mjs --session personal create --name "Prueba Skill"
  bun scripts/labels.mjs --session personal chat-add --jid 15555550101 --label-id 1234567890`);
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
let plan;
if (cmd === 'create') {
	const name = requireArg(args, 'name', '"Prueba Skill"');
	const id = args.id ? String(args.id) : String(Date.now());
	const color = args.color !== undefined ? Number(args.color) : 0;
	if (!Number.isInteger(color) || color < 0 || color > 19) {
		fail(`Invalid --color: ${args.color}. Use 0-19 (WhatsApp has 20 predefined colors).`);
	}
	plan = { cmd, label: { id, name, color } };
} else if (cmd === 'chat-add' || cmd === 'chat-remove') {
	plan = { cmd, jid: asJid(requireArg(args, 'jid', JID_EX)), labelId: requireArg(args, 'label-id', '1234567890') };
} else if (cmd === 'message-add' || cmd === 'message-remove') {
	plan = {
		cmd,
		jid: asJid(requireArg(args, 'jid', JID_EX)),
		messageId: requireArg(args, 'message-id', 'EXAMPLE_MESSAGE_ID'),
		labelId: requireArg(args, 'label-id', '1234567890'),
	};
} else if (cmd === 'watch') {
	const secs = args.timeout !== undefined ? Number(args.timeout) : 60;
	if (!Number.isInteger(secs) || secs < 10 || secs > 300) {
		fail(`Invalid --timeout. Use 10-300 seconds (example: --timeout 60).`);
	}
	plan = { cmd, secs };
} else {
	fail(`Unknown command: ${cmd}. Run with --help.`);
}

let sock;
try {
	({ sock } = await connectSession(session, { dataDir, timeoutMs, verbose }));
} catch (e) {
	fail(`Could not connect with session "${session}": ${e.message}`, 2);
}

try {
	switch (plan.cmd) {
		case 'create': {
			await sock.addLabel('', plan.label);
			console.log(`Created label "${plan.label.name}" (id: ${plan.label.id}).`);
			break;
		}
		case 'chat-add': {
			await sock.addChatLabel(plan.jid, plan.labelId);
			console.log(`Labeled chat ${plan.jid} with ${plan.labelId}.`);
			break;
		}
		case 'chat-remove': {
			await sock.removeChatLabel(plan.jid, plan.labelId);
			console.log(`Unlabeled chat ${plan.jid} (${plan.labelId}).`);
			break;
		}
		case 'message-add': {
			await sock.addMessageLabel(plan.jid, plan.messageId, plan.labelId);
			console.log(`Labeled message ${plan.messageId} with ${plan.labelId}.`);
			break;
		}
		case 'message-remove': {
			await sock.removeMessageLabel(plan.jid, plan.messageId, plan.labelId);
			console.log(`Unlabeled message ${plan.messageId} (${plan.labelId}).`);
			break;
		}
		case 'watch': {
			console.log('Touch any label on the phone now (rename it, or move a chat in/out)...');
			const seen = new Map();
			const show = () => {
				for (const [id, info] of seen) {
					console.log(`LABEL id=${id} name="${info.name ?? '?'}" deleted=${!!info.deleted}`);
				}
			};
			sock.ev.on('labels.edit', (label) => {
				if (label?.id) {
					seen.set(String(label.id), { name: label.name, deleted: !!label.deleted });
					show();
				}
			});
			sock.ev.on('labels.association', (assoc) => {
				const id = assoc?.labelId || assoc?.label?.id;
				if (id) {
					const prev = seen.get(String(id)) || {};
					seen.set(String(id), { ...prev, lastAssociation: assoc.association || assoc });
					show();
				}
			});
			await new Promise((r) => setTimeout(r, plan.secs * 1000));
			if (seen.size === 0) console.log('No label activity seen. Try again and touch a label on the phone.');
			break;
		}
	}
	await closeAndExit(sock, 0);
} catch (e) {
	fail(`Labels command failed: ${e.message}`, 2);
}
