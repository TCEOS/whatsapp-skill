// Minimal argv parser (no dependencies).
// Supports: --key value, --key=value, --flag, -h/--help, positional _[].
export function parseArgs(argv) {
	const out = { _: [] };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--help' || a === '-h') {
			out.help = true;
		} else if (a.startsWith('--')) {
			const k = a.slice(2);
			const eq = k.indexOf('=');
			if (eq >= 0) {
				out[k.slice(0, eq)] = k.slice(eq + 1);
			} else {
				const next = argv[i + 1];
				if (next === undefined || next.startsWith('--')) {
					out[k] = true;
				} else {
					out[k] = next;
					i++;
				}
			}
		} else {
			out._.push(a);
		}
	}
	return out;
}

export function requireArg(args, name, example) {
	const v = args[name];
	if (v === undefined || v === true || v === '') {
		console.error(`Missing required --${name} (example: --${name} ${example ?? 'value'})`);
		process.exit(1);
	}
	return String(v);
}

export function fail(msg, code = 1) {
	console.error(`ERROR: ${msg}`);
	process.exit(code);
}
