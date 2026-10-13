#!/usr/bin/env bun
// Show stored credentials only; no network or phone login verification.
// Usage:
//   bun scripts/status.mjs [--data-dir <path>]
import { parseArgs } from './lib/args.mjs';
import { sessionDir, readLocalSession, SKILL_ROOT } from './lib/session.mjs';
import fs from 'node:fs';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(`Show stored WhatsApp credentials (offline; does not verify phone login).

Usage:
  bun scripts/status.mjs [--data-dir <path>]

Reads <data-dir>/<session>/creds.json written by pair.mjs. No network needed.`);
	process.exit(0);
}

const base = args['data-dir']
	? String(args['data-dir'])
	: (process.env.BAILEYS_DATA_DIR || `${SKILL_ROOT}/data`);

if (!fs.existsSync(base)) {
	console.log(`No sessions yet (missing ${base}). Pair one: bun scripts/pair.mjs --phone <digits>`);
	process.exit(0);
}

const names = fs.readdirSync(base, { withFileTypes: true })
	.filter((d) => d.isDirectory() && !d.name.startsWith('.'))
	.map((d) => d.name);

if (names.length === 0) {
	console.log(`No sessions in ${base}. Pair one: bun scripts/pair.mjs --phone <digits>`);
	process.exit(0);
}

for (const name of names) {
	const s = readLocalSession(name, base);
	if (!s.exists) {
		console.log(`- ${name}: no creds (incomplete)`);
	} else if (s.registered) {
		console.log(`- ${name}: REGISTERED CREDS (offline; login not verified)${s.me?.id ? ` as ${s.me.id}` : ''}`);
	} else {
		console.log(`- ${name}: INCOMPLETE credentials (pairing not confirmed)`);
	}
}
