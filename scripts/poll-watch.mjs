#!/usr/bin/env bun
// Long-running poll vote collector (daemon). Stays online, decrypts every
// vote for tracked polls and appends them to data/<session>/polls/<id>.votes.json.
// Run it under pm2 / screen / a service for days-long polls. One connection
// at a time: stop it before running other scripts with the same session.
// Usage:
//   bun scripts/poll-watch.mjs --session personal [--poll-id <id>] [--data-dir <path>] [--verbose]
import { normalizeMessageContent } from 'baileys';
import path from 'node:path';
import { parseArgs, requireArg, fail } from './lib/args.mjs';
import { connectSession, readLocalSession, sessionDir } from './lib/session.mjs';
import { decryptPollVoteAttempt, creatorCandidatesFor, voteOptionNames, votesPath } from './lib/votes.mjs';
import fs from 'node:fs';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(`Long-running poll vote collector (daemon).

Usage:
  bun scripts/poll-watch.mjs --session <name> [--poll-id <id>] [--data-dir <path>] [--verbose]

Watches one poll (--poll-id) or every tracked poll (each data/<session>/polls/*.json
saved by send.mjs --poll). Every decrypted vote is appended to <id>.votes.json.
Read the tally any time with: poll-results.mjs --session <name> --id <id>.
Stop with Ctrl+C. Only past votes cast while watching are recorded.`);
	process.exit(0);
}

const session = requireArg(args, 'session', 'personal');
const onlyPollId = args['poll-id'] ? String(args['poll-id']) : undefined;
const verbose = !!args.verbose;
const dataDir = args['data-dir'] ? String(args['data-dir']) : undefined;

const local = readLocalSession(session, dataDir);
if (!local.exists || !local.registered) {
	fail(`Session "${session}" is not paired. Pair it first: bun scripts/pair.mjs --phone <digits> --session ${session}`, 3);
}

function loadTracked() {
	const pollsDir = path.join(sessionDir(session, dataDir), 'polls');
	const tracked = new Map();
	if (!fs.existsSync(pollsDir)) return tracked;
	for (const f of fs.readdirSync(pollsDir)) {
		if (!f.endsWith('.json') || f.endsWith('.votes.json')) continue;
		const id = f.slice(0, -5);
		if (onlyPollId && id !== onlyPollId) continue;
		try {
			const saved = JSON.parse(fs.readFileSync(path.join(pollsDir, f), 'utf-8'));
			if (saved?.secretHex && Array.isArray(saved?.options)) tracked.set(id, saved);
		} catch {}
	}
	return tracked;
}

const tracked = loadTracked();
if (tracked.size === 0) {
	fail(onlyPollId
		? `Poll ${onlyPollId} has no saved secret. Send it with send.mjs --poll first.`
		: `No tracked polls. Send one with send.mjs --poll first.`);
}

let sock;
try {
	// No timeout: runs until stopped (Ctrl+C). Reconnects by itself.
	({ sock } = await connectSession(session, { dataDir, timeoutMs: Infinity, verbose }));
} catch (e) {
	fail(`Could not connect with session "${session}": ${e.message}`, 2);
}

const meId = sock.user?.id || '?';
const creatorCandidates = await creatorCandidatesFor(session, dataDir);
console.log(`Watching ${tracked.size} poll(s) as ${meId}. Press Ctrl+C to stop.`);

function loadVotes(pollId) {
	try {
		return JSON.parse(fs.readFileSync(votesPath(session, dataDir, pollId), 'utf-8'));
	} catch {
		return { pollId, votes: {} };
	}
}

function saveVotes(pollId, data) {
	try {
		fs.writeFileSync(votesPath(session, dataDir, pollId), JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2));
	} catch (e) {
		console.error(`WARN: could not persist votes: ${e.message}`);
	}
}

sock.ev.on('messages.upsert', async ({ messages }) => {
	for (const m of messages || []) {
		try {
			const content = normalizeMessageContent(m.message);
			const upd = content?.pollUpdateMessage;
			if (!upd) continue;
			const pid = upd.pollCreationMessageKey?.id;
			const saved = pid && tracked.get(pid);
			if (!saved) continue;
			const voterRaw = m.key.participant || m.key.remoteJid;
			try {
				const { vote, usedVoter } = await decryptPollVoteAttempt(sock, { saved, pollId: pid, creatorCandidates }, upd, voterRaw);
				const names = voteOptionNames(saved, vote);
				const data = loadVotes(pid);
				data.pollId = pid;
				data.votes = data.votes || {};
				data.votes[usedVoter] = { options: names, ts: new Date().toISOString() };
				saveVotes(pid, data);
				console.log(`Vote on "${saved.name}" from ${usedVoter}: ${names.join(', ') || '(empty)'}.`);
			} catch (e) {
				console.error(`WARN: undecryptable vote for ${pid}: ${e.message}`);
			}
		} catch {}
	}
});

process.on('SIGINT', async () => {
	console.log('Stopping watcher...');
	try { sock.ws?.close(); } catch {}
	process.exit(0);
});

// Stay alive forever.
await new Promise(() => {});
