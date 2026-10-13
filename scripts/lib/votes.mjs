// Shared poll-vote helpers: identity variants, combo decryption, tally.
import { jidNormalizedUser, decryptPollVote } from 'baileys';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { sessionDir } from './session.mjs';

/** Identity string variants (PN, LID, with/without :device suffix) for vote decryption. */
export function identityVariants(j) {
	if (!j) return [];
	const out = [String(j)];
	const noSuffix = String(j).replace(/:\d+@/g, '@');
	if (noSuffix !== out[0]) out.push(noSuffix);
	try {
		const n = jidNormalizedUser(String(j));
		if (!out.includes(n)) out.push(n);
	} catch {}
	return [...new Set(out)];
}

/**
 * Decrypt one poll vote trying every (creator × voter) identity combination.
 * The phone may encrypt for LID forms instead of PN forms.
 * Returns { vote, usedVoter } or throws listing tried combinations.
 */
export async function decryptPollVoteAttempt(sock, { saved, pollId, creatorCandidates }, upd, voterRaw) {
	let voterLid = null;
	try {
		const [info] = await sock.onWhatsApp(voterRaw);
		if (info?.lid) voterLid = String(info.lid);
	} catch {}
	const voterCandidates = [...new Set([...identityVariants(voterRaw), ...identityVariants(voterLid)])];
	const pollEncKey = Buffer.from(saved.secretHex, 'hex');
	const tried = [];
	for (const c of creatorCandidates) {
		for (const v of voterCandidates) {
			tried.push(`${c}|${v}`);
			try {
				const vote = decryptPollVote(upd.vote, {
					pollEncKey,
					pollCreatorJid: c,
					pollMsgId: pollId,
					voterJid: v,
				});
				return { vote, usedVoter: v };
			} catch {}
		}
	}
	throw new Error(`tried: ${tried.join(' ; ')}`);
}

/** Build creator identity candidates from our creds (PN + LID forms). */
export async function creatorCandidatesFor(session, dataDir) {
	const out = [];
	try {
		const creds = JSON.parse(await Bun.file(path.join(sessionDir(session, dataDir), 'creds.json')).text());
		if (creds?.me?.id) out.push(...identityVariants(creds.me.id));
		if (creds?.me?.lid) out.push(...identityVariants(creds.me.lid));
	} catch {}
	return [...new Set(out)];
}

/** Map a decrypted vote's selected option hashes back to option names. */
export function voteOptionNames(saved, vote) {
	const hashes = new Map();
	for (const name of saved.options || []) {
		hashes.set(createHash('sha256').update(Buffer.from(name)).digest().toString(), name);
	}
	const names = [];
	for (const sel of vote?.selectedOptions || []) {
		const h = Buffer.from(sel).toString();
		if (hashes.has(h)) names.push(hashes.get(h));
	}
	return names;
}

/** Aggregate stored votes ({ voter: { options:[names] } }) into a tally. */
export function tallyStoredVotes(saved, votesByVoter) {
	const results = (saved.options || []).map((name) => ({ option: name, votes: 0, voters: [] }));
	const idx = new Map(results.map((r, i) => [r.option, i]));
	for (const [voter, v] of Object.entries(votesByVoter || {})) {
		for (const name of v.options || []) {
			const i = idx.get(name);
			if (i !== undefined) {
				results[i].votes++;
				results[i].voters.push(voter);
			}
		}
	}
	return { poll: saved.name, totalVoters: Object.keys(votesByVoter || {}).length, results };
}

/** Path of the votes file for a poll. */
export function votesPath(session, dataDir, pollId) {
	return path.join(sessionDir(session, dataDir), 'polls', `${pollId}.votes.json`);
}

/** Path of the poll secret file. */
export function pollPath(session, dataDir, pollId) {
	return path.join(sessionDir(session, dataDir), 'polls', `${pollId}.json`);
}
