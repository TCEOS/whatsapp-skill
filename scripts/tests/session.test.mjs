import { test, expect } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sessionDir } from '../lib/session.mjs';

test('session identifiers cannot escape the selected data directory', () => {
	const base = fs.mkdtempSync(path.join(os.tmpdir(), 'whatsapp-session-'));
	try {
		expect(sessionDir('personal-1', base)).toBe(path.join(base, 'personal-1'));
		for (const name of ['..', '../outside', '..\\outside', '/outside', 'C:\\outside', 'a/b', 'a\\b', 'CON', 'nul', 'COM1', '', true]) {
			expect(() => sessionDir(name, base)).toThrow('Invalid session name');
		}
		expect(fs.readdirSync(base)).toEqual([]);
	} finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('an existing session link cannot redirect credential operations', () => {
	const base = fs.mkdtempSync(path.join(os.tmpdir(), 'whatsapp-session-link-'));
	try {
		const destination = path.join(base, 'outside');
		fs.mkdirSync(destination);
		fs.symlinkSync(destination, path.join(base, 'personal'), process.platform === 'win32' ? 'junction' : 'dir');
		expect(() => sessionDir('personal', base)).toThrow('symbolic link or junction');
		expect(fs.readdirSync(destination)).toEqual([]);
	} finally { fs.rmSync(base, { recursive: true, force: true }); }
});
