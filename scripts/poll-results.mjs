#!/usr/bin/env bun
// Show poll results. Two modes (no HTTP, no server):
//   1. File mode (default): reads data/<session>/polls/<id>.votes.json recorded
//      by poll-watch.mjs (daemon). Instant, works days/weeks later.
//   2. Live mode (--live): listens --wait seconds and tallies votes cast
//      during the window (needs the poll secret from send.mjs --poll).
// Usage:
//   bun scripts/poll-results.mjs --session personal --id <poll-id>
//   bun scripts/poll-results.mjs --session personal --to 15555550102 --id <poll-id> --live --wait 60
import { normalizeMessageContent } from 'baileys';
import { parseArgs, requireArg, fail } from './lib/args.mjs';
import { connectSession, closeAndExit, toJid, readLocalSession, sessionDir } from './lib/session.mjs';
import { decryptPollVoteAttempt, creatorCandidatesFor, voteOptionNames, tallyStoredVotes, pollPath, votesPath } from './lib/votes.mjs';
import path from 'node:path';
import fs from 'node:fs';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(`Show poll results (file or live).

Usage:
  bun scripts/poll-results.mjs --session <name> --id <poll-id> [--voters] [--live] [--to <phone|jid>] [--wait <sec>]

File mode (default): prints the tally stored by poll-watch.mjs. Instant.
  bun scripts/poll-results.mjs --session personal --id 3EB0F82AF5C8436DB14CB6

Live mode: listens --wait seconds (5-300, default 30) and tallies votes cast
during the window. Needs the poll secret saved by send.mjs --poll.
  bun scripts/poll-results.mjs --session personal --to 15555550102 --id <id> --live --wait 60`);
	process.exit(0);
}

const session = requireArg(args, 'session', 'personal');
const pollId = requireArg(args, 'id', '3EB0F82AF5C8436DB14CB6');
const live = !!args.live;
const showVoters = !!args.voters;
const dataDir = args['data-dir'] ? String(args['data-dir']) : undefined;
const verbose = !!args.verbose;

const local = readLocalSession(session, dataDir);
if (!local.exists || !local.registered) {
	fail(`Session "${session}" is not paired. Pair it first: bun scripts/pair.mjs --phone <digits> --session ${session}`, 3);
}

function loadSaved() {
	try {
		const saved = JSON.parse(fs.readFileSync(pollPath(session, dataDir, pollId), 'utf-8'));
		if (saved?.secretHex && Array.isArray(saved?.options)) return saved;
	} catch {}
	return null;
}

function shape(tally) {
	if (showVoters) return tally;
	return { ...tally, results: tally.results.map(({ option, votes }) => ({ option, votes })) };
}

if (!live) {
	const saved = loadSaved();
	if (!saved) fail(`Poll ${pollId} is unknown. Send it with send.mjs --poll first.`);
	let stored = { votes: {} };
	try {
		stored = JSON.parse(fs.readFileSync(votesPath(session, dataDir, pollId), 'utf-8'));
	} catch {}
	if (Object.keys(stored.votes || {}).length === 0) {
		console.log(JSON.stringify({ ...shape({ poll: saved.name, totalVoters: 0, results: (saved.options || []).map((option) => ({ option, votes: 0, voters: [] })) }), note: 'No votes recorded yet. Run poll-watch.mjs (daemon) or use --live while someone votes.' }, null, 2));
		process.exit(0);
	}
	console.log(JSON.stringify(shape(tallyStoredVotes(saved, stored.votes)), null, 2));
	process.exit(0);
}

// ---- Live mode ----
let to;
try {
	to = toJid(requireArg(args, 'to', '15555550102'));
} catch (e) {
	fail(e.message);
}
const waitSecs = args.wait !== undefined ? Number(args.wait) : 30;
if (!Number.isInteger(waitSecs) || waitSecs < 5 || waitSecs > 300) {
	fail(`Invalid --wait. Use 5-300 seconds (example: --wait 60).`);
}
const timeoutMs = Number(args.timeout || 90) * 1000;

const saved = loadSaved();
if (!saved) fail(`Poll ${pollId} has no saved secret (created before tracking?). Send a fresh poll with send.mjs --poll.`);

let sock;
try {
	({ sock } = await connectSession(session, { dataDir, timeoutMs, verbose }));
} catch (e) {
	fail(`Could not connect with session "${session}": ${e.message}`, 2);
}

const creatorCandidates = await creatorCandidatesFor(session, dataDir);
const byVoter = new Map();

console.log(`Listening for votes on "${saved.name}" for ${waitSecs}s... vote now!`);
sock.ev.on('messages.upsert', async ({ messages }) => {
	for (const m of messages || []) {
		try {
			const content = normalizeMessageContent(m.message);
			const upd = content?.pollUpdateMessage;
			if (!upd || upd.pollCreationMessageKey?.id !== pollId) continue;
			const voterRaw = m.key.participant || m.key.remoteJid;
			try {
				const { vote, usedVoter } = await decryptPollVoteAttempt(sock, { saved, pollId, creatorCandidates }, upd, voterRaw);
				byVoter.set(usedVoter, vote);
				console.log(`Vote from ${usedVoter}.`);
			} catch (e) {
				console.error(`WARN: could not decrypt a vote: ${e.message}`);
			}
		} catch {}
	}
});

await new Promise((r) => setTimeout(r, waitSecs * 1000));

const tally = { poll: saved.name, totalVoters: byVoter.size, results: (saved.options || []).map((name) => ({ option: name, votes: 0, voters: [] })) };
const idx = new Map(tally.results.map((r, i) => [r.option, i]));
for (const [voter, vote] of byVoter) {
	for (const name of voteOptionNames(saved, vote)) {
		const i = idx.get(name);
		if (i !== undefined) {
			tally.results[i].votes++;
			tally.results[i].voters.push(voter);
		}
	}
}
console.log(JSON.stringify(shape(tally), null, 2));
await closeAndExit(sock, 0);
