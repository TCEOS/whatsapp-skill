#!/usr/bin/env bun
// Send a WhatsApp message with a paired session (no HTTP, no server).
// Usage:
//   bun scripts/send.mjs --session my-wpp --to 15555550101 --text "hola"
//   bun scripts/send.mjs --session my-wpp --to 15555550101 --image ./foto.jpg --caption "mira"
//   bun scripts/send.mjs --session my-wpp --to <group-id>@g.us --text "hola grupo"
//   bun scripts/send.mjs --session my-wpp --to 15555550101 --document ./file.pdf
import crypto from 'node:crypto';
import path from 'node:path';
import { parseArgs, requireArg, fail } from './lib/args.mjs';
import { connectSession, closeAndExit, toJid, readLocalSession, loadFileOrUrl, toStickerWebp, toVoiceOgg, simulatePresence, sessionDir } from './lib/session.mjs';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(`Send a WhatsApp message with a paired session.

Usage:
  bun scripts/send.mjs --session <name> --to <phone|jid> --text <msg>
                       [--image <path|url> | --video <path|url> | --document <path|url> | --audio <path|url>
                        | --sticker <path|url> | --sticker-gif <path|url> | --location "lat,lng"
                        | --voice <path|url> | --poll <question>]
                       [--typing <sec> | --recording <sec>]
                       [--disappearing <0|86400|604800|7776000>] [--burn <sec>]
                       [--event-name <n> --event-start <iso|epoch> --event-description <t>
                        --event-end <iso|epoch> --event-location "lat,lng" --event-guests]
                       [--caption <text>] [--data-dir <path>] [--verbose]
                       [--location-name <n> --location-address <a>]
                       [--contact-name <n> --contact-phone <digits>]

Examples:
  bun scripts/send.mjs --session ventas --to 15555550101 --text "Hola!"
  bun scripts/send.mjs --session ventas --to 15555550101 --image ./foto.jpg --caption "Mira esto"
  bun scripts/send.mjs --session ventas --to 15555550101 --video ./clip.mp4 --caption "Mira"
  bun scripts/send.mjs --session ventas --to 15555550101 --image ./foto.jpg --view-once
  bun scripts/send.mjs --session ventas --to 123456789@g.us --text "Hola grupo"
  bun scripts/send.mjs --session ventas --to 15555550101 --sticker ./foto.jpg
  bun scripts/send.mjs --session ventas --to 15555550101 --sticker-gif ./anim.gif
  bun scripts/send.mjs --session ventas --to 15555550101 --location "-12.0464,-77.0428" --location-name "Lima"
  bun scripts/send.mjs --session ventas --to 15555550101 --contact-name "Juan" --contact-phone 15555550101
  bun scripts/send.mjs --session ventas --to 15555550101 --audio ./tema.mp3
  bun scripts/send.mjs --session ventas --to 15555550101 --voice ./nota.ogg
  bun scripts/send.mjs --session ventas --to 15555550101 --text "Hola!" --typing 5
  bun scripts/send.mjs --session ventas --to 15555550101 --text "Te mando audio" --recording 3
  bun scripts/send.mjs --session ventas --to 15555550101 --text "Texto corregido" --edit <message-id>
  bun scripts/send.mjs --session ventas --to 15555550101 --text "Se autodestruye" --disappearing 86400
  bun scripts/send.mjs --session ventas --to 15555550101 --text "Me borro en 1 minuto" --burn 60
  bun scripts/send.mjs --session ventas --to 15555550101 --poll "Mejor dia?" --options "Lunes,Viernes" --selectable 1
  bun scripts/send.mjs --session ventas --to 15555550101 --event-name "Reunion" --event-start "2026-10-20T18:00:00-05:00" --event-description "Traer laptop"

Audio (both kinds) is transcoded to Opus/OGG with ffmpeg. --voice arrives
as a voice-note bubble. Stickers are converted to WebP with ffmpeg (must be installed).
The session must already be paired (see pair.mjs).`);
	process.exit(0);
}

const session = requireArg(args, 'session', 'ventas');
let to;
try {
	to = toJid(requireArg(args, 'to', '15555550101'));
} catch (e) {
	fail(e.message);
}
const text = args.text ? String(args.text) : undefined;
const caption = args.caption ? String(args.caption) : undefined;
const image = args.image ? String(args.image) : undefined;
const video = args.video ? String(args.video) : undefined;
const viewOnce = !!args['view-once'];
const document = args.document ? String(args.document) : undefined;
const audio = args.audio ? String(args.audio) : undefined;
const voice = args.voice ? String(args.voice) : undefined;
const typingRaw = args.typing !== undefined ? args.typing : undefined;
const recordingRaw = args.recording !== undefined ? args.recording : undefined;
const poll = args.poll ? String(args.poll) : undefined;
const pollOptions = args.options ? String(args.options).split(',').map((s) => s.trim()).filter(Boolean) : [];
const selectable = args.selectable !== undefined ? Number(args.selectable) : 1;
const eventName = args['event-name'] ? String(args['event-name']) : undefined;
const eventStartRaw = args['event-start'] ? String(args['event-start']) : undefined;
const eventEndRaw = args['event-end'] ? String(args['event-end']) : undefined;
const eventDescription = args['event-description'] ? String(args['event-description']) : undefined;
const eventLocationRaw = args['event-location'] ? String(args['event-location']) : undefined;
const eventGuests = !!args['event-guests'];
const editId = args.edit ? String(args.edit) : undefined;
const disappearingRaw = args.disappearing !== undefined ? args.disappearing : undefined;
const burnRaw = args.burn !== undefined ? args.burn : undefined;
const sticker = args.sticker ? String(args.sticker) : undefined;
const stickerGif = args['sticker-gif'] ? String(args['sticker-gif']) : undefined;
const location = args.location ? String(args.location) : undefined;
const locationName = args['location-name'] ? String(args['location-name']) : undefined;
const locationAddress = args['location-address'] ? String(args['location-address']) : undefined;
const contactName = args['contact-name'] ? String(args['contact-name']) : undefined;
const contactPhoneRaw = args['contact-phone'] ? String(args['contact-phone']) : undefined;
const contactPhone = contactPhoneRaw ? contactPhoneRaw.replace(/\D/g, '') : undefined;
const contactEmail = args['contact-email'] ? String(args['contact-email']) : undefined;
const contactOrg = args['contact-org'] ? String(args['contact-org']) : undefined;
const contactTitle = args['contact-title'] ? String(args['contact-title']) : undefined;
const contactAddress = args['contact-address'] ? String(args['contact-address']) : undefined;
const contactUrl = args['contact-url'] ? String(args['contact-url']) : undefined;
const contactNote = args['contact-note'] ? String(args['contact-note']) : undefined;
const timeoutMs = Number(args.timeout || 60) * 1000;
const verbose = !!args.verbose;
const dataDir = args['data-dir'] ? String(args['data-dir']) : undefined;

const contactGiven = contactName || contactPhoneRaw;
if (!text && !image && !video && !document && !audio && !voice && !sticker && !stickerGif && !location && !contactGiven && !poll && !eventName && !editId && disappearingRaw === undefined) {
	fail('Nothing to send. Provide --text and/or --image/--video/--document/--audio/--voice/--sticker/--sticker-gif/--location/--contact-phone/--poll/--event-name.');
}
if ([image, video, document, audio, voice, sticker, stickerGif, location, contactGiven, poll, eventName].filter(Boolean).length > 1) {
	fail('Send only one media attachment per message (--image, --video, --document, --audio, --voice, --sticker, --sticker-gif, --location, --contact-phone, --poll or --event-name).');
}
if (viewOnce && !image && !video) {
	fail('View-once needs --image or --video.');
}
if (editId) {
	if (!text) fail('Edit needs --text with the new content.');
	if ([image, document, audio, voice, sticker, stickerGif, location, contactGiven, poll, eventName].some(Boolean)) {
		fail('Edit only applies to text: drop the media flags.');
	}
}
let disappearing = null;
let burnSecs = null;
if (burnRaw !== undefined) {
	if (burnRaw === true) fail('Missing --burn value in seconds (example: --burn 60).');
	burnSecs = Number(burnRaw);
	if (!Number.isInteger(burnSecs) || burnSecs < 5 || burnSecs > 172800) {
		fail(`Invalid --burn: ${burnRaw}. Use 5-172800 seconds (example: --burn 60).`);
	}
}
if (disappearingRaw !== undefined) {
	if (disappearingRaw === true) fail('Missing --disappearing value. Use 0 (off), 86400 (24h), 604800 (7d) or 7776000 (90d).');
	disappearing = Number(disappearingRaw);
	if (![0, 86400, 604800, 7776000].includes(disappearing)) {
		fail(`Invalid --disappearing: ${disappearingRaw}. Use 0 (off), 86400 (24h), 604800 (7d) or 7776000 (90d).`);
	}
}
if ((sticker || stickerGif) && text) {
	fail('Stickers do not take captions: drop --text or the sticker flag.');
}
if (poll) {
	if (text) fail('Poll takes --options/--selectable, not --text.');
	if (pollOptions.length < 2 || pollOptions.length > 12) {
		fail('Poll needs 2-12 --options (comma-separated).');
	}
	if (!Number.isInteger(selectable) || selectable < 1 || selectable > pollOptions.length) {
		fail(`Invalid --selectable: ${args.selectable}. Use 1-${pollOptions.length}.`);
	}
}
if (contactName || contactPhoneRaw) {
	if (!contactName || !contactPhone || !/^\d{7,15}$/.test(contactPhone)) {
		fail('Contact needs --contact-name and --contact-phone (7-15 digits).');
	}
	if (text) fail('Contact takes --contact-name/--contact-phone, not --text.');
}
function parseEventDate(raw, flag) {
	const s = String(raw).trim();
	const ms = /^\d+$/.test(s) ? Number(s) * 1000 : Date.parse(s);
	if (!Number.isFinite(ms)) fail(`Invalid --${flag}. Use ISO ("2026-10-20T18:00:00-05:00") or epoch seconds.`);
	return new Date(ms);
}
let event = null;
if (eventName) {
	if (text) fail('Event takes --event-* flags, not --text.');
	if (!eventStartRaw) fail('Event needs --event-start (ISO or epoch seconds).');
	const startDate = parseEventDate(eventStartRaw, 'event-start');
	if (startDate.getTime() <= Date.now()) fail('Event --event-start must be in the future.');
	let endDate;
	if (eventEndRaw) {
		endDate = parseEventDate(eventEndRaw, 'event-end');
		if (endDate.getTime() <= startDate.getTime()) fail('Event --event-end must be after --event-start.');
	}
	let eventLocation;
	if (eventLocationRaw) {
		const m = eventLocationRaw.split(',').map((s) => Number(s.trim()));
		if (m.length !== 2 || m.some((n) => Number.isNaN(n))) fail('Invalid --event-location. Format: "lat,lng".');
		eventLocation = { degreesLatitude: m[0], degreesLongitude: m[1] };
	}
	event = {
		name: eventName,
		...(eventDescription ? { description: eventDescription } : {}),
		startDate,
		...(endDate ? { endDate } : {}),
		...(eventLocation ? { location: eventLocation } : {}),
		...(eventGuests ? { extraGuestsAllowed: true } : {}),
	};
}
function presenceSecs(raw, flag) {
	if (raw === true) return 3;
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1 || n > 30) {
		fail(`Invalid --${flag}. Use 1-30 seconds (example: --${flag} 5).`);
	}
	return n;
}
let presence = null;
if (typingRaw !== undefined && recordingRaw !== undefined) {
	fail('Use --typing or --recording, not both.');
}
if (typingRaw !== undefined) presence = { kind: 'composing', secs: presenceSecs(typingRaw, 'typing') };
if (recordingRaw !== undefined) presence = { kind: 'recording', secs: presenceSecs(recordingRaw, 'recording') };
let coords = null;
if (location) {
	if (text) fail('Location takes --location-name/--location-address, not --text.');
	const m = location.split(',').map((s) => Number(s.trim()));
	if (m.length !== 2 || m.some((n) => Number.isNaN(n)) || m[0] < -90 || m[0] > 90 || m[1] < -180 || m[1] > 180) {
		fail('Invalid --location. Format: --location "lat,lng" (example: "-12.0464,-77.0428").');
	}
	coords = { degreesLatitude: m[0], degreesLongitude: m[1] };
}

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
	if (disappearing !== null) {
		await sock.sendMessage(to, { disappearingMessagesInChat: disappearing });
		console.log(disappearing === 0 ? `Disappearing messages OFF in ${to}.` : `Disappearing messages ON (${disappearing}s) in ${to}.`);
	}
	const hasContent = text || image || video || document || audio || voice || sticker || stickerGif || location || contactGiven || poll || eventName || editId;
	if (!hasContent) {
		await closeAndExit(sock, 0);
	}
	if (presence) {
		console.log(`Showing "${presence.kind === 'recording' ? 'recording...' : 'typing...'}" for ${presence.secs}s...`);
		await simulatePresence(sock, to, presence.kind, presence.secs);
	}
	let content;
	if (image) content = { image: await loadFileOrUrl(image), caption, ...(viewOnce ? { viewOnce: true } : {}) };
	else if (video) {
		const isGif = /\.gif(\?|$)/i.test(video);
		content = { video: await loadFileOrUrl(video), caption, ...(viewOnce ? { viewOnce: true } : {}), gifPlayback: isGif && !viewOnce };
	}
	else if (document) {
		const buf = await loadFileOrUrl(document);
		const filename = document.split('/').pop().split('?')[0] || 'file';
		content = { document: buf, fileName: filename, caption };
	} else if (audio) content = { audio: await toVoiceOgg(audio), mimetype: 'audio/ogg; codecs=opus' };
	else if (voice) content = { audio: await toVoiceOgg(voice), mimetype: 'audio/ogg; codecs=opus', ptt: true };
	else if (sticker) content = { sticker: await toStickerWebp(sticker, false) };
	else if (stickerGif) content = { sticker: await toStickerWebp(stickerGif, true) };
	else if (coords) content = {
		location: {
			...coords,
			...(locationName ? { name: locationName } : {}),
			...(locationAddress ? { address: locationAddress } : {}),
		},
	};
	else if (contactPhone) {
		const nameParts = contactName.split(/\s+/);
		const first = nameParts[0];
		const last = nameParts.slice(1).join(' ');
		const lines = [
			'BEGIN:VCARD',
			'VERSION:3.0',
			`FN:${contactName}`,
			`N:${last};${first};;;`,
			...(contactOrg ? [`ORG:${contactOrg}`] : []),
			...(contactTitle ? [`TITLE:${contactTitle}`] : []),
			`TEL;type=CELL;type=VOICE;waid=${contactPhone}:+${contactPhone}`,
			...(contactEmail ? [`EMAIL;type=INTERNET:${contactEmail}`] : []),
			...(contactAddress ? [`ADR;type=HOME:;;${contactAddress};;;;`] : []),
			...(contactUrl ? [`URL:${contactUrl}`] : []),
			...(contactNote ? [`NOTE:${contactNote}`] : []),
			'END:VCARD',
		];
		content = {
			contacts: {
				displayName: contactName,
				contacts: [{ vcard: lines.join('\n') }],
			},
		};
	}
	else if (poll) {
		const messageSecret = crypto.randomBytes(32);
		const sentPoll = await sock.sendMessage(to, { poll: { name: poll, values: pollOptions, selectableCount: selectable, messageSecret } });
		const pollId = sentPoll?.key?.id ?? 'unknown';
		// Save options + secret so poll-results.mjs can decrypt future votes.
		// (Bun.write creates parent directories automatically.)
		try {
			await Bun.write(
				path.join(sessionDir(session, dataDir), 'polls', `${pollId}.json`),
				JSON.stringify({ id: pollId, jid: to, name: poll, options: pollOptions, selectableCount: selectable, secretHex: messageSecret.toString('hex'), createdAt: new Date().toISOString() }, null, 2),
			);
		} catch {}
		console.log(`Poll sent to ${to} (id: ${pollId}).`);
		await closeAndExit(sock, 0);
	}
	else if (event) content = { event };
	else if (editId) content = { text, edit: { remoteJid: to, id: editId, fromMe: true } };
	else content = { text };

	const sent = await sock.sendMessage(to, content);
	console.log(`Sent to ${to} (id: ${sent?.key?.id ?? 'unknown'}).`);
	await closeAndExit(sock, 0);
} catch (e) {
	fail(`Send failed: ${e.message}`, 2);
}
