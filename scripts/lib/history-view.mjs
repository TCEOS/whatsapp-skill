import { normalizeMessageContent, jidNormalizedUser } from 'baileys';

export function messageText(message) {
	const content = normalizeMessageContent(message.message);
	const type = content ? Object.keys(content).find(k => k !== 'messageContextInfo') : 'unknown';
	const text = content?.conversation ?? content?.extendedTextMessage?.text
		?? content?.imageMessage?.caption ?? content?.videoMessage?.caption ?? content?.documentMessage?.caption
		?? (content?.pollCreationMessage || content?.pollCreationMessageV2 || content?.pollCreationMessageV3)?.name
		?? content?.eventMessage?.name ?? content?.contactMessage?.displayName
		?? (content?.reactionMessage ? `reaction ${content.reactionMessage.text}` : `[${type}]`);
	return { type, text };
}
export function filterMessages(messages, { search = '', after = 0, before = Infinity, messageId, includeSystem = false } = {}) {
	const term = search.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
	return messages.filter(m => {
		const timestamp = Number(m.messageTimestamp || 0);
		if (timestamp < after || timestamp > before || (messageId && m.key.id !== messageId)) return false;
		const { type, text } = messageText(m);
		if (!includeSystem && ['protocolMessage', 'senderKeyDistributionMessage', 'messageContextInfo'].includes(type)) return false;
		return !term || text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().includes(term);
	});
}
export function formatMessages(messages, { format = 'compact', maxText = 240, ids = false, ownJid } = {}) {
	const senders = {}, senderIndex = new Map();
	let truncated = 0;
	const rows = messages.map(m => {
		const sender = m.key.participant || m.participant || (m.key.fromMe ? (ownJid ? jidNormalizedUser(ownJid) : 'me') : m.key.remoteJid);
		const { type, text: original } = messageText(m);
		const clipped = maxText > 0 && original.length > maxText;
		if (clipped) truncated++;
		const text = clipped ? `${original.slice(0, maxText)}…` : original;
		const seconds = Number(m.messageTimestamp || 0);
		if (format === 'json') return { id: m.key.id, fromMe: !!m.key.fromMe, sender, pushName: m.pushName || null,
			timestamp: seconds ? new Date(seconds * 1000).toISOString() : null, type, text, ...(clipped ? { truncated: true } : {}) };
		if (!senderIndex.has(sender)) {
			const index = senderIndex.size;
			senderIndex.set(sender, index);
			senders[index] = m.key.fromMe ? 'me' : m.pushName || sender;
		}
		return [seconds, senderIndex.get(sender), text, ...(ids ? [m.key.id] : [])];
	});
	return format === 'json' ? { messages: rows, ...(truncated ? { truncated } : {}) }
		: { columns: ['epochSeconds', 'sender', 'text', ...(ids ? ['id'] : [])], senders, messages: rows, ...(truncated ? { truncated } : {}) };
}
export function historyStats(messages) {
	let oldest = Infinity, newest = 0, fromMe = 0, characters = 0;
	for (const message of messages) {
		const timestamp = Number(message.messageTimestamp || 0);
		if (timestamp) { oldest = Math.min(oldest, timestamp); newest = Math.max(newest, timestamp); }
		if (message.key.fromMe) fromMe++;
		characters += messageText(message).text.length;
	}
	return { count: messages.length, fromMe, oldest: oldest < Infinity ? new Date(oldest * 1000).toISOString() : null,
		newest: newest ? new Date(newest * 1000).toISOString() : null, characters };
}
