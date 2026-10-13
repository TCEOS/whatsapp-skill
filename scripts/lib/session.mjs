// Shared Baileys session helper (direct connection, no HTTP, no server).
// Auth state lives in local files: <dataDir>/<session>/ (creds.json + keys).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import makeWASocket, {
	useMultiFileAuthState,
	isJidBroadcast,
	fetchLatestBaileysVersion,
	DisconnectReason,
	jidNormalizedUser,
	decryptPollVote,
} from 'baileys';
import pino from 'pino';
import { monitorSocket } from './pairing.mjs';
import { createHistoryStore } from './history-store.mjs';

// Silence third-party libsignal noise so script output stays readable.
const __noiseFilters = ['Closing session', 'SessionEntry', 'pendingPreKey', 'Session already closed'];
for (const __m of ['log', 'info', 'warn', 'debug']) {
	const __orig = console[__m].bind(console);
	console[__m] = (...a) => {
		try {
			const s = a.map((x) => String(x)).join(' ');
			if (__noiseFilters.some((f) => s.includes(f))) return;
		} catch {}
		__orig(...a);
	};
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_ROOT = path.resolve(HERE, '..', '..');

export function sessionDir(name, dataDir) {
	// Session names are identifiers, never filesystem paths (including on Windows).
	if (typeof name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name)
		|| /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) {
		throw new Error('Invalid session name; use 1-64 letters, digits, underscores or hyphens.');
	}
	const base = dataDir || process.env.BAILEYS_DATA_DIR || path.join(SKILL_ROOT, 'data');
	const directory = path.resolve(base, name);
	try {
		if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('Session directory must not be a symbolic link or junction.');
	} catch (error) { if (error.code !== 'ENOENT') throw error; }
	return directory;
}

export function readLocalSession(name, dataDir) {
	const dir = sessionDir(name, dataDir);
	const credsPath = path.join(dir, 'creds.json');
	if (!fs.existsSync(credsPath)) return { exists: false, dir };
	try {
		const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
		return { exists: true, dir, registered: !!creds.registered, me: creds.me || null };
	} catch {
		return { exists: true, dir, registered: false, me: null };
	}
}

function makeLogger(verbose) {
	return pino({ level: verbose ? 'debug' : 'silent' });
}

/**
 * Connects (and reconnects on transient closes) until the socket opens,
 * the session logs out, or timeoutMs elapses.
 * Resolves with { sock, saveCreds }. Reconnects on transient closes.
 */
export async function connectSession(name, opts = {}) {
	const {
		dataDir,
		timeoutMs = 60000,
		verbose = false,
		onConnecting,
		getMessage,
		onSocket,
		syncFullHistory = false,
	} = opts;
	const dir = sessionDir(name, dataDir);
	fs.mkdirSync(dir, { recursive: true });
	const logger = makeLogger(verbose);
	const historyStore = createHistoryStore(dir);

	let version, versionTimer;
	try {
		// Con límite: sin red el fetch nativo cuelga indefinidamente.
		const v = await Promise.race([
			fetchLatestBaileysVersion(),
			new Promise((_, rej) => { versionTimer = setTimeout(() => rej(new Error('version fetch timeout')), 10000); }),
		]);
		version = v.version;
	} catch {
		console.error('WARN: could not fetch latest WA version (offline?), using Baileys default');
	} finally { clearTimeout(versionTimer); }

	const deadline = Date.now() + timeoutMs;
	let sock;
	let saveCreds;

	while (true) {
		if (Date.now() > deadline) throw new Error('Connection timeout');
		const auth = await useMultiFileAuthState(dir);
		saveCreds = auth.saveCreds;
		sock = makeWASocket({
			...(version ? { version } : {}),
			auth: auth.state,
			printQRInTerminal: false,
			syncFullHistory,
			...(syncFullHistory ? { shouldSyncHistoryMessage: () => true } : {}),
			markOnlineOnConnect: false,
			logger,
			shouldIgnoreJid: (jid) => isJidBroadcast(jid),
			...(getMessage ? { getMessage } : {}),
		});
		sock.ev.on('creds.update', saveCreds);
		historyStore.bind(sock);
		// Subscribe before authenticated open: initial history can arrive immediately.
		onSocket?.(sock);

		// One persistent listener per socket (no accumulation), watchdog
		// clamped to 1h so Infinity timeouts never hot-spin.
		let pending = null;
		let lastState = null;
		sock.ev.on('connection.update', (u) => {
			lastState = u;
			if (u.connection === 'connecting' || u.qr) {
				try { onConnecting?.(); } catch {}
			}
			if (!pending) return;
			if (u.connection === 'open') {
				clearTimeout(pending.timer);
				const resolve = pending.resolve;
				pending = null;
				resolve({ type: 'open' });
			} else if (u.connection === 'close') {
				clearTimeout(pending.timer);
				const resolve = pending.resolve;
				const code = u.lastDisconnect?.error?.output?.statusCode;
				pending = null;
				resolve({ type: 'close', code });
			}
		});
		const waitRound = () => new Promise((resolve) => {
			if (lastState?.connection === 'open') return resolve({ type: 'open' });
			if (lastState?.connection === 'close') {
				return resolve({ type: 'close', code: lastState.lastDisconnect?.error?.output?.statusCode });
			}
			const ms = Math.min(3600000, Math.max(1000, deadline - Date.now()));
			const timer = setTimeout(() => {
				if (pending?.resolve === resolve) pending = null;
				resolve({ type: 'timeout' });
			});
			pending = { resolve, timer };
		});

		while (true) {
			const outcome = await waitRound();
			if (outcome.type === 'open') return { sock, saveCreds, dir, historyStore };
			if (outcome.type === 'close' && outcome.code === DisconnectReason.loggedOut) {
				try { sock.ws?.close(); } catch {}
				throw new Error('Session logged out from the phone. Delete data and pair again.');
			}
			if (Date.now() > deadline) {
				try { sock.ws?.close(); } catch {}
				throw new Error('Connection timeout');
			}
			if (outcome.type === 'close') break; // transient: recreate socket
			// watchdog timeout while still connected: re-arm on the same socket
		}
		try { sock.ws?.close(); } catch {}
		await new Promise((r) => setTimeout(r, 2000));
	}
}

import os from 'node:os';
import crypto from 'node:crypto';

/** Convert any image (or gif/mp4 when animated) to WhatsApp-ready WebP via ffmpeg. */
export async function toStickerWebp(ref, animated) {
	let input = ref;
	let downloaded = false;
	if (/^https?:\/\//i.test(ref)) {
		input = `${os.tmpdir()}/stkr-in-${crypto.randomBytes(6).toString('hex')}`;
		const res = await fetch(ref);
		if (!res.ok) throw new Error(`Download failed (${res.status}): ${ref}`);
		await Bun.write(input, Buffer.from(await res.arrayBuffer()));
		downloaded = true;
	}
	const out = `${os.tmpdir()}/stkr-out-${crypto.randomBytes(6).toString('hex')}.webp`;
	const scale = 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000';
	const vf = animated ? `fps=15,${scale}` : scale;
	const proc = Bun.spawnSync([
		'ffmpeg', '-y', '-i', input,
		...(animated ? ['-t', '10'] : ['-frames:v', '1']),
		'-vf', vf, '-c:v', 'libwebp', '-lossless', '0', '-q:v', '75',
		'-preset', 'picture', '-loop', '0', '-an', '-vsync', '0', '-f', 'webp', out,
	], { stdout: 'ignore', stderr: 'ignore' });
	if (downloaded) {
		try { fs.unlinkSync(input); } catch {}
	}
	if (proc.exitCode !== 0) {
		throw new Error('ffmpeg conversion failed (is ffmpeg installed?)');
	}
	const buf = fs.readFileSync(out);
	try { fs.unlinkSync(out); } catch {}
	return buf;
}

/** Convert any audio to WhatsApp voice-note Opus/OGG via ffmpeg. */
export async function toVoiceOgg(ref) {
	let input = ref;
	let downloaded = false;
	if (/^https?:\/\//i.test(ref)) {
		input = `${os.tmpdir()}/aud-in-${crypto.randomBytes(6).toString('hex')}`;
		const res = await fetch(ref);
		if (!res.ok) throw new Error(`Download failed (${res.status}): ${ref}`);
		await Bun.write(input, Buffer.from(await res.arrayBuffer()));
		downloaded = true;
	}
	const out = `${os.tmpdir()}/aud-out-${crypto.randomBytes(6).toString('hex')}.ogg`;
	const proc = Bun.spawnSync([
		'ffmpeg', '-y', '-i', input,
		'-c:a', 'libopus', '-b:a', '32k', '-vbr', 'on',
		'-ac', '1', '-ar', '16000', '-f', 'ogg', out,
	], { stdout: 'ignore', stderr: 'ignore' });
	if (downloaded) {
		try { fs.unlinkSync(input); } catch {}
	}
	if (proc.exitCode !== 0) {
		throw new Error('ffmpeg conversion failed (is ffmpeg installed?)');
	}
	const buf = fs.readFileSync(out);
	try { fs.unlinkSync(out); } catch {}
	return buf;
}

/** Show "typing..." / "recording..." for N seconds, then stop. Never throws. */
export async function simulatePresence(sock, jid, kind, secs) {
	try {
		await sock.presenceSubscribe(jid);
	} catch {}
	try {
		await sock.sendPresenceUpdate(kind === 'recording' ? 'recording' : 'composing', jid);
	} catch (e) {
		console.error(`WARN: presence update failed: ${e.message}`);
		return;
	}
	await new Promise((r) => setTimeout(r, secs * 1000));
	try {
		await sock.sendPresenceUpdate('paused', jid);
	} catch {}
}

/** Graceful close: flush creds, close socket, exit code. */
export async function closeAndExit(sock, code = 0) {
	try {
		await new Promise((r) => setTimeout(r, 500));
		try { sock.ws?.close(); } catch {}
	} finally {
		process.exit(code);
	}
}

/** Create one socket with listeners installed before yielding to the caller. */
export async function createSocket(name, opts = {}) {
    const { dataDir, verbose = false } = opts;
    const dir = sessionDir(name, dataDir);
    fs.mkdirSync(dir, { recursive: true });
    let version, timer;
    try {
        const v = await Promise.race([
            fetchLatestBaileysVersion(),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('version fetch timeout')), 10000); }),
        ]);
        version = v.version;
    } catch {
        console.error('WARN: could not fetch latest WA version, using Baileys default');
    } finally { clearTimeout(timer); }
    const auth = await useMultiFileAuthState(dir);
    const historyStore = createHistoryStore(dir);
    const sock = makeWASocket({
        ...(version ? { version } : {}),
        auth: auth.state,
        printQRInTerminal: false,
        syncFullHistory: true,
        shouldSyncHistoryMessage: () => true,
        markOnlineOnConnect: false,
        logger: makeLogger(verbose),
        shouldIgnoreJid: (jid) => isJidBroadcast(jid),
    });
    historyStore.bind(sock);
    const monitor = monitorSocket(sock, auth.saveCreds);
    return { sock, monitor, dir, historyStore };
}

/** Normalize user input to a WhatsApp JID. Digits -> @s.whatsapp.net, keep groups/@lid as-is. */
export function toJid(input) {
	const v = String(input).trim();
	if (v.includes('@')) return v;
	if (/^\d+$/.test(v)) return `${v}@s.whatsapp.net`;
	throw new Error(`Invalid JID or phone number: ${input}`);
}

/** Load a local file or remote URL into a Buffer. */
export async function loadFileOrUrl(ref) {
	if (/^https?:\/\//i.test(ref)) {
		const res = await fetch(ref);
		if (!res.ok) throw new Error(`Download failed (${res.status}): ${ref}`);
		return Buffer.from(await res.arrayBuffer());
	}
	return fs.readFileSync(ref);
}

/** Validate E.164 digits without '+'. */
export function cleanPhone(input) {
	const digits = String(input).replace(/\D/g, '');
	if (!/^\d{10,15}$/.test(digits)) {
		throw new Error(`Invalid phone number (need 10-15 digits with country code): ${input}`);
	}
	return digits;
}
