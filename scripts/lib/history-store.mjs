// Persist actual Baileys events before the socket opens, including initial sync.
// Files share the credential directory's privacy and ignored-data lifecycle.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { BufferJSON, proto } from 'baileys';

export function createHistoryStore(sessionDirectory) {
	const directory = path.join(sessionDirectory, 'history');
	fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
	const read = (name, fallback) => {
		try { return JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'), BufferJSON.reviver); }
		catch (error) { if (error.code === 'ENOENT') return fallback; throw new Error(`Cannot read history cache ${name}: ${error.message}`); }
	};
	const write = (name, value) => {
		const destination = path.join(directory, name);
		const temporary = `${destination}.${process.pid}.tmp`;
		fs.writeFileSync(temporary, JSON.stringify(value, BufferJSON.replacer), { mode: 0o600 });
		fs.renameSync(temporary, destination);
	};
	const index = read('index.json', { chats: {}, aliases: {} });
	const loaded = new Map();
	const filename = jid => `${createHash('sha256').update(jid).digest('hex')}.json`;
	const canonical = jid => index.aliases[jid] || jid;
	const load = jid => {
		if (!loaded.has(jid)) {
			const records = read(filename(jid), {});
			// JSON preserves Long's low/high words; rebuild protobufs after process reload.
			for (const id of Object.keys(records)) records[id] = proto.WebMessageInfo.fromObject(records[id]);
			loaded.set(jid, records);
		}
		return loaded.get(jid);
	};
	function contacts(values = []) {
		for (const value of values) {
			if (!value.id) continue;
			index.chats[value.id] = { ...index.chats[value.id], id: value.id,
				name: value.name || value.subject || value.notify || index.chats[value.id]?.name };
			if (value.lid && value.id !== value.lid) index.aliases[value.lid] = value.id;
		}
		write('index.json', index);
	}
	function messages(values = []) {
		const dirty = new Set();
		for (const message of values) {
			const key = message.key;
			if (!key?.remoteJid || !key.id || !message.message) continue;
			// PN and LID may identify the same one-to-one chat. Keep both discoverable.
			const jids = new Set([key.remoteJid, key.remoteJidAlt].filter(Boolean).map(canonical));
			for (const jid of jids) {
				const records = load(jid);
				const previousId = `${key.fromMe ? 1 : 0}:${key.id}:${key.participant || ''}`;
				const id = `${key.fromMe ? 1 : 0}:${key.id}:${key.participant || message.participant || ''}`;
				records[id] = { ...records[previousId], ...records[id], ...message };
				if (previousId !== id) delete records[previousId];
				index.chats[jid] ||= { id: jid };
				dirty.add(jid);
			}
		}
		for (const jid of dirty) write(filename(jid), load(jid));
		if (dirty.size) write('index.json', index);
	}
	return {
		messages, contacts,
		resolve: canonical,
		list: () => Object.values(index.chats),
		get(jid) {
			const destination = canonical(jid);
			const sources = [...Object.keys(index.aliases).filter(alias => canonical(alias) === destination).sort(), destination];
			const records = {};
			for (const source of new Set(sources)) for (const message of Object.values(load(source))) {
				const id = `${message.key.fromMe ? 1 : 0}:${message.key.id}:${message.key.participant || message.participant || ''}`;
				const previous = records[id];
				records[id] = { ...previous, ...message, pushName: message.pushName || previous?.pushName };
			}
			return Object.values(records).sort((a, b) => Number(b.messageTimestamp || 0) - Number(a.messageTimestamp || 0) || String(b.key.id).localeCompare(String(a.key.id)));
		},
		bind(sock) {
			sock.ev.on('messaging-history.set', data => { contacts([...(data.contacts || []), ...(data.chats || [])]); messages(data.messages); });
			sock.ev.on('messages.upsert', data => messages(data.messages));
			sock.ev.on('contacts.upsert', contacts);
			sock.ev.on('contacts.update', contacts);
			sock.ev.on('chats.upsert', contacts);
			sock.ev.on('chats.update', contacts);
		},
	};
}
