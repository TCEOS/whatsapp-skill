#!/usr/bin/env bun
// Number-first code pairing and bounded recovery of an unfinished login.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, requireArg, fail } from './lib/args.mjs';
import { createSocket, cleanPhone, readLocalSession, sessionDir } from './lib/session.mjs';
import { completePairing } from './lib/pairing.mjs';
import { acquirePairLock } from './lib/pair-lock.mjs';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
    console.log(`Pair a WhatsApp number (one code per attempt).
Usage: bun scripts/pair.mjs --phone <digits> --session <name> [--timeout 300]
Recover an unfinished login WITHOUT another code:
       bun scripts/pair.mjs --phone <digits> --session <name> --resume
Explicitly start fresh, archiving this session's old credentials:
       bun scripts/pair.mjs --phone <digits> --session <name> --reset

515 triggers credential persistence and immediate socket replacement.
Success requires authenticated open, pending notifications and 30s stability.
This verifies the transport; the user must also confirm the phone left Logging in.
Use only one active process per session. --verbose may expose private metadata.`);
    process.exit(0);
}
const phone = cleanPhone(requireArg(args, 'phone', '5491123456789'));
const session = String(args.session || 'default');
if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(session) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(session)) fail('Invalid session name; use letters, digits, underscores or hyphens.');
const seconds = Number(args.timeout || 300);
if (!Number.isFinite(seconds) || seconds < 40 || seconds > 1800) fail('--timeout must be 40-1800 seconds.');
if (args.resume && args.reset) fail('--resume and --reset cannot be combined.');
const dataDir = args['data-dir'] ? String(args['data-dir']) : undefined;
const dir = sessionDir(session, dataDir);
const base = path.dirname(dir);
fs.mkdirSync(base, { recursive: true });
let release;
let active;
try {
    release = acquirePairLock(base, session);
    const pre = readLocalSession(session, dataDir);
    if (args.resume && !pre.registered) throw new Error('No registered credentials to resume. Start a fresh pairing attempt.');
    if (pre.registered && !args.resume && !args.reset) throw new Error('Stored registered credentials exist; they do NOT prove the phone completed login. Use --resume to verify/recover, or --reset for an explicit fresh attempt.');
    // Reset is reversible: preserve auth data, never delete a registered session implicitly.
    if (fs.existsSync(dir) && (args.reset || (pre.exists && !pre.registered))) {
        const backupRoot = path.join(base, '.pair-backups');
        fs.mkdirSync(backupRoot, { recursive: true });
        const backup = path.join(backupRoot, `${session}-${Date.now()}`);
        fs.renameSync(dir, backup);
        console.log(`Previous credentials archived locally: ${backup}`);
    }
    fs.mkdirSync(dir, { recursive: true });
    console.log(`${args.resume ? 'Recovering' : 'Pairing'} ${phone} (session "${session}")...`);
    const createConnection = async () => {
        active = await createSocket(session, { dataDir, verbose: !!args.verbose });
        if (args.resume && active.sock.authState.creds.me?.id?.split(':')[0].split('@')[0] !== phone) throw new Error('Stored session belongs to a different phone number.');
        return active;
    };
    const result = await completePairing({
        createConnection, phone, timeoutMs: seconds * 1000,
        onCode(code) {
            const formatted = code.match(/.{1,4}/g).join('-');
            fs.writeFileSync(path.join(dir, 'code.txt'), `${formatted}\n`);
            console.log(`\nYOUR PAIRING CODE: ${formatted}\n`);
            console.log('WhatsApp > Linked devices > Link a device > Link with phone number.');
            console.log('Use this code once; waiting for restart and authenticated initialization.');
        },
        onProgress: (message) => console.log(message),
    });
    active = result.connection;
    console.log(`TRANSPORT VERIFIED for session "${session}": authenticated open, pending notifications received, stable for 30s.`);
    console.log('Confirm on the phone that Logging in has disappeared and the device is listed. Do not infer this from creds.json.');
    try { fs.unlinkSync(path.join(dir, 'code.txt')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
} catch (error) {
    console.error(`ERROR: ${error.message}`);
    console.error('Login is NOT confirmed. Do not generate another code while a previous attempt is pending.');
    process.exitCode = 2;
} finally {
    if (active) {
        active.sock.end?.(new Error('Pairing check finished'));
        active.sock.ws?.close();
        try { await active.monitor.flushCreds(); } catch (error) { console.error(`Credential save failed: ${error.message}`); process.exitCode = 2; }
        active.monitor.dispose();
    }
    release?.();
}
process.exit(process.exitCode || 0);
