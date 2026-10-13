#!/usr/bin/env bun
// Manage WhatsApp groups with a paired session (no HTTP, no server).
// Usage:
//   bun scripts/groups.mjs --session my-wpp <command> [options]
// Run with --help for the full command list.
import { parseArgs, requireArg, fail } from './lib/args.mjs';
import { connectSession, closeAndExit, toJid, readLocalSession, loadFileOrUrl } from './lib/session.mjs';

const args = parseArgs(process.argv.slice(2));
const [cmd] = args._;
if (args.help || !cmd) {
	console.log(`Manage WhatsApp groups with a paired session.

Usage:
  bun scripts/groups.mjs --session <name> <command> [options]

Basics:
  list                                            List participating groups
  info --jid <group@g.us>                         Show group metadata
  create --subject <name> --participants <a,b,c>  Create a group (phones or JIDs)
  photo --jid <group@g.us> --image <path|url>     Change the group picture
  subject --jid <group@g.us> --subject <name>     Rename the group
  description --jid <group@g.us> --description <t> Change the description
  leave --jid <group@g.us>                        Leave the group

Participants:
  participants --jid <g> --action <add|remove|promote|demote> --participants <a,b,c>

Settings:
  settings --jid <g> --setting <announcement|not_announcement|locked|unlocked>
  member-add-mode --jid <g> --mode <admin_add|all_member_add>

Join requests:
  requests --jid <group@g.us>                     List pending join requests
  requests --jid <g> --action <approve|reject> --participants <a,b,c>

Invites:
  invite-code --jid <group@g.us>                  Get the invite code
  revoke-invite --jid <group@g.us>                Revoke it and get a new one
  invite-info --code <code>                       Preview a group from its invite code
  accept-invite --code <code>                     Join a group with an invite code

Examples:
  bun scripts/groups.mjs --session ventas list
  bun scripts/groups.mjs --session ventas create --subject "Equipo" --participants 15555550102,15555550103`);
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

function asJid(value, example) {
	try {
		return toJid(value);
	} catch (e) {
		fail(e.message);
	}
}

function asParticipants(raw, example) {
	const list = String(raw || '').split(',').map((p) => p.trim()).filter(Boolean);
	if (list.length === 0) fail(`Missing --participants (example: --participants ${example}).`);
	try {
		return list.map((p) => toJid(p));
	} catch (e) {
		fail(e.message);
	}
}

function oneOf(value, allowed, flag) {
	const v = String(value || '').toLowerCase();
	if (!allowed.includes(v)) fail(`Invalid --${flag}: ${value}. Use ${allowed.join(', ')}.`);
	return v;
}

// ---- Validate everything BEFORE connecting (fail fast, offline-friendly) ----
const JID_EX = '123456789@g.us';
let plan;
if (cmd === 'list') {
	plan = { cmd };
} else if (cmd === 'info') {
	plan = { cmd, groupJid: asJid(requireArg(args, 'jid', JID_EX)) };
} else if (cmd === 'create') {
	plan = { cmd, subject: requireArg(args, 'subject', '"Mi grupo"'), participants: asParticipants(args.participants, '15555550102,15555550103') };
} else if (cmd === 'photo') {
	const image = args.image ? String(args.image) : undefined;
	if (!image) fail('Missing required --image (example: --image ./logo.jpg).');
	plan = { cmd, groupJid: asJid(requireArg(args, 'jid', JID_EX)), image };
} else if (cmd === 'subject') {
	plan = { cmd, groupJid: asJid(requireArg(args, 'jid', JID_EX)), subject: requireArg(args, 'subject', '"Nuevo nombre"') };
} else if (cmd === 'description') {
	plan = { cmd, groupJid: asJid(requireArg(args, 'jid', JID_EX)), description: args.description !== undefined ? String(args.description) : '' };
} else if (cmd === 'leave') {
	plan = { cmd, groupJid: asJid(requireArg(args, 'jid', JID_EX)) };
} else if (cmd === 'participants') {
	plan = {
		cmd,
		groupJid: asJid(requireArg(args, 'jid', JID_EX)),
		action: oneOf(requireArg(args, 'action', 'add'), ['add', 'remove', 'promote', 'demote'], 'action'),
		participants: asParticipants(args.participants, '15555550102,15555550103'),
	};
} else if (cmd === 'settings') {
	plan = {
		cmd,
		groupJid: asJid(requireArg(args, 'jid', JID_EX)),
		setting: oneOf(requireArg(args, 'setting', 'announcement'), ['announcement', 'not_announcement', 'locked', 'unlocked'], 'setting'),
	};
} else if (cmd === 'member-add-mode') {
	plan = {
		cmd,
		groupJid: asJid(requireArg(args, 'jid', JID_EX)),
		mode: oneOf(requireArg(args, 'mode', 'admin_add'), ['admin_add', 'all_member_add'], 'mode'),
	};
} else if (cmd === 'requests') {
	const groupJid = asJid(requireArg(args, 'jid', JID_EX));
	if (!args.action) {
		plan = { cmd, groupJid, list: true };
	} else {
		plan = {
			cmd,
			groupJid,
			action: oneOf(args.action, ['approve', 'reject'], 'action'),
			participants: asParticipants(args.participants, '15555550102'),
		};
	}
} else if (cmd === 'invite-code' || cmd === 'revoke-invite') {
	plan = { cmd, groupJid: asJid(requireArg(args, 'jid', JID_EX)) };
} else if (cmd === 'invite-info' || cmd === 'accept-invite') {
	plan = { cmd, code: requireArg(args, 'code', 'AbCdEfGhIjKlMnOpQrStUv') };
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
		case 'list': {
			const groups = await sock.groupFetchAllParticipating();
			const values = Object.values(groups);
			if (values.length === 0) console.log('No groups.');
			for (const g of values) {
				console.log(`- ${g.id} | ${g.subject} | ${g.participants?.length ?? '?'} members`);
			}
			break;
		}
		case 'info': {
			const meta = await sock.groupMetadata(plan.groupJid);
			console.log(JSON.stringify({ id: meta.id, subject: meta.subject, size: meta.size, participants: meta.participants?.map((p) => p.id) }, null, 2));
			break;
		}
		case 'create': {
			const group = await sock.groupCreate(plan.subject, plan.participants);
			console.log(`Created group "${group.subject}" (${group.id}).`);
			break;
		}
		case 'photo': {
			let buf;
			try {
				buf = await loadFileOrUrl(plan.image);
			} catch (e) {
				fail(`Cannot load image: ${e.message}`);
			}
			await sock.updateProfilePicture(plan.groupJid, buf);
			console.log(`Group picture updated for ${plan.groupJid}.`);
			break;
		}
		case 'subject': {
			await sock.groupUpdateSubject(plan.groupJid, plan.subject);
			console.log(`Subject updated for ${plan.groupJid}.`);
			break;
		}
		case 'description': {
			await sock.groupUpdateDescription(plan.groupJid, plan.description);
			console.log(`Description updated for ${plan.groupJid}.`);
			break;
		}
		case 'leave': {
			await sock.groupLeave(plan.groupJid);
			console.log(`Left group ${plan.groupJid}.`);
			break;
		}
		case 'participants': {
			const res = await sock.groupParticipantsUpdate(plan.groupJid, plan.participants, plan.action);
			console.log(JSON.stringify(res));
			break;
		}
		case 'settings': {
			await sock.groupSettingUpdate(plan.groupJid, plan.setting);
			console.log(`Setting "${plan.setting}" applied to ${plan.groupJid}.`);
			break;
		}
		case 'member-add-mode': {
			await sock.groupMemberAddMode(plan.groupJid, plan.mode);
			console.log(`Member add mode "${plan.mode}" applied to ${plan.groupJid}.`);
			break;
		}
		case 'requests': {
			if (plan.list) {
				const pending = await sock.groupRequestParticipantsList(plan.groupJid);
				console.log(JSON.stringify(pending));
			} else {
				const res = await sock.groupRequestParticipantsUpdate(plan.groupJid, plan.participants, plan.action);
				console.log(JSON.stringify(res));
			}
			break;
		}
		case 'invite-code': {
			const code = await sock.groupInviteCode(plan.groupJid);
			console.log(`Invite code for ${plan.groupJid}: ${code}`);
			console.log(`Link: https://chat.whatsapp.com/${code}`);
			break;
		}
		case 'revoke-invite': {
			const code = await sock.groupRevokeInvite(plan.groupJid);
			console.log(`New invite code for ${plan.groupJid}: ${code}`);
			break;
		}
		case 'invite-info': {
			const meta = await sock.groupGetInviteInfo(plan.code);
			console.log(JSON.stringify({ id: meta.id, subject: meta.subject, size: meta.size }, null, 2));
			break;
		}
		case 'accept-invite': {
			const jid = await sock.groupAcceptInvite(plan.code);
			console.log(`Joined group ${jid}.`);
			break;
		}
	}
	await closeAndExit(sock, 0);
} catch (e) {
	fail(`Groups command failed: ${e.message}`, 2);
}
