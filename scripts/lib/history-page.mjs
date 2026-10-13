export function encodeCursor(message, chat) {
	return Buffer.from(JSON.stringify({ chat, id: message.key.id, fromMe: !!message.key.fromMe,
		participant: message.key.participant || message.participant, timestamp: Number(message.messageTimestamp) })).toString('base64url');
}
export function decodeCursor(token, chat) {
	let cursor;
	try { cursor = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')); } catch {}
	if (typeof cursor?.id !== 'string' || !cursor.id || cursor.id.length > 256
		|| (cursor.participant !== undefined && typeof cursor.participant !== 'string')
		|| typeof cursor.fromMe !== 'boolean' || !Number.isSafeInteger(cursor.timestamp) || cursor.timestamp < 1 || cursor.timestamp > Math.floor(Date.now() / 1000) + 300 || (cursor.chat && cursor.chat !== chat)) throw new Error('Invalid cursor or cursor from a different chat. Use nextCursor from this chat.');
	return cursor;
}
export function selectPage(messages, cursor, limit) {
	if (!cursor) return messages.slice(0, limit);
	const position = messages.findIndex(m => m.key.id === cursor.id && !!m.key.fromMe === cursor.fromMe && (!cursor.participant || (m.key.participant || m.participant) === cursor.participant));
	return (position >= 0 ? messages.slice(position + 1) : messages.filter(m => Number(m.messageTimestamp) < cursor.timestamp)).slice(0, limit);
}
