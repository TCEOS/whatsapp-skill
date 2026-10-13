// Pairing lifecycle, testable without WhatsApp or credential files.
export function disconnectCode(update) {
	const error = update?.lastDisconnect?.error;
	return Number(error?.output?.statusCode ?? error?.statusCode ?? error?.cause?.output?.statusCode) || undefined;
}

export function monitorSocket(sock, saveCreds) {
	const state = { connection: null, qr: null, receivedPendingNotifications: false };
	let writes = Promise.resolve();
	let writeError;
	const save = () => {
		writes = writes.then(saveCreds).catch((error) => { writeError = error; });
		return writes;
	};
	const update = (value) => {
		Object.assign(state, value);
		if (value.connection === 'close') state.code = disconnectCode(value);
	};
	sock.ev.on('creds.update', save);
	sock.ev.on('connection.update', update);
	return {
		state,
		async flushCreds() { await save(); if (writeError) throw writeError; },
		wait(predicate, timeoutMs) {
			return new Promise((resolve) => {
				let timer, interval;
				const finish = (matched) => { clearTimeout(timer); clearInterval(interval); resolve(matched); };
				if (predicate(state)) return finish(true);
				interval = setInterval(() => { if (predicate(state)) finish(true); }, 25);
				timer = setTimeout(() => finish(false), Math.max(0, timeoutMs));
			});
		},
		dispose() { sock.ev.off('creds.update', save); sock.ev.off('connection.update', update); },
	};
}

export async function completePairing({ createConnection, phone, timeoutMs = 300000,
	stableMs = 30000, maxReconnects = 4, retryDelayMs = 1500, onCode = () => {}, onProgress = () => {} }) {
	const deadline = Date.now() + timeoutMs;
	let codeRequested = false;
	let reconnects = 0;
	let current;
	const remaining = () => Math.max(0, deadline - Date.now());
	const close = async () => {
		if (!current) return;
		try {
			current.sock.end?.(new Error('Pairing transport closed'));
			current.sock.ws?.close();
			await current.monitor.flushCreds();
		} finally { current.monitor.dispose(); current = null; }
	};
	try {
		while (remaining() > 0) {
			current = await createConnection();
			const { sock, monitor } = current;
			// qr is the server's registration-ready event. 'connecting' is too early.
			if (!sock.authState.creds.registered) {
				if (codeRequested) throw new Error('Pairing interrupted before credentials were acknowledged. Retry explicitly for a new code.');
				await monitor.wait((s) => !!s.qr || s.connection === 'close', remaining());
				if (monitor.state.connection !== 'close' && monitor.state.qr) {
					codeRequested = true; // never repeat, even if the request throws
					const code = await sock.requestPairingCode(phone);
					onCode(code);
				}
			}
			await monitor.wait((s) => s.connection === 'close' ||
				(s.connection === 'open' && s.receivedPendingNotifications), remaining());
			if (monitor.state.connection === 'close') {
				const code = monitor.state.code;
				onProgress(`Connection closed (code ${code ?? 'unknown'}).`);
				if ([401, 440, 403, 411].includes(code)) throw new Error(`WhatsApp rejected the session (code ${code}); no automatic reset or new code.`);
				if (++reconnects > maxReconnects) throw new Error('Reconnect limit reached; pairing is not confirmed.');
				if (code === 515) onProgress('Restart required (515): saving credentials and reconnecting with the SAME session.');
				await close(); // flush before the replacement socket loads credentials
				if (code !== 515) await new Promise((r) => setTimeout(r, Math.min(retryDelayMs, remaining())));
				continue;
			}
			if (monitor.state.connection !== 'open' || !monitor.state.receivedPendingNotifications) {
				throw new Error('Timed out before authenticated open and pending-notification initialization. Stored credentials are not proof of success.');
			}
			onProgress(`Authenticated socket open; keeping it alive for ${stableMs / 1000}s to finish initialization.`);
			if (remaining() < stableMs) throw new Error('Not enough time to verify a stable connection. Resume with saved credentials.');
			if (await monitor.wait((s) => s.connection === 'close', stableMs)) {
				const code = monitor.state.code;
				if ([401, 440, 403, 411].includes(code)) throw new Error(`WhatsApp rejected the session during initialization (code ${code}).`);
				if (++reconnects > maxReconnects) throw new Error('Reconnect limit reached during initialization.');
				await close();
				continue;
			}
			if (!sock.authState.creds.registered || !sock.authState.creds.account) throw new Error('Authenticated account credentials are incomplete.');
			await monitor.flushCreds();
			return { connection: current, reconnects };
		}
		throw new Error('Pairing deadline exceeded; connection is not confirmed.');
	} catch (error) { await close(); throw error; }
}
