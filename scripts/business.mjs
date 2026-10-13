#!/usr/bin/env bun
// WhatsApp Business commerce with a paired session (no HTTP, no server).
// NOTE: product/order operations require a WhatsApp BUSINESS account.
// Usage:
//   bun scripts/business.mjs --session my-wpp <command> [options]
// Run with --help for the full command list.
import { parseArgs, requireArg, fail } from './lib/args.mjs';
import { connectSession, closeAndExit, toJid, readLocalSession, loadFileOrUrl } from './lib/session.mjs';

const args = parseArgs(process.argv.slice(2));
const [cmd] = args._;
if (args.help || !cmd) {
	console.log(`WhatsApp Business commerce with a paired session.

Catalog (read-only, works on any account that has one):
  catalog --jid <phone|jid> [--limit <n>]   List catalog products
  collections [--jid <phone|jid>] [--limit] List product collections

Products (require WhatsApp BUSINESS):
  product-create --name <n> --price <n> --currency <USD> --description <t>
                 [--url <u> --retailer-id <id> --country <ISO> --hidden --images <a,b>]
  product-update --id <productId> [--name --price --currency --description --url --retailer-id --hidden/--visible --images <a,b>]
  product-delete --ids <id1,id2,...>

Orders and product messages:
  product-send --to <phone|jid> --product-id <id> --title <t> --description <t>
               --price <n> --currency <USD> [--image <path|url> --url <u> --retailer-id <id>
               --business-owner <phone|jid> --caption <text>]
  order-details --order-id <id> --token <token>

Examples:
  bun scripts/business.mjs --session ventas catalog --jid 15555550101
  bun scripts/business.mjs --session ventas product-create --name "Remera" --price 999 --currency USD --description "Algodon"`);
	process.exit(args.help ? 0 : 1);
}

const session = requireArg(args, 'session', 'ventas');
const timeoutMs = Number(args.timeout || 60) * 1000;
const verbose = !!args.verbose;
const dataDir = args['data-dir'] ? String(args['data-dir']) : undefined;

const local = readLocalSession(session, dataDir);
if (!local.exists || !local.registered) {
	fail(`Session "${session}" is not paired. Pair it first: bun scripts/pair.mjs --phone <digits> --session ${session}`, 3);
}

function asJid(value, example) {
	try {
		return toJid(value);
	} catch (e) {
		fail(e.message);
	}
}

function asPrice(raw) {
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 0) fail(`Invalid --price: ${raw}. Use a non-negative number.`);
	return n;
}

function asImages(raw) {
	if (!raw) return [];
	return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}

// ---- Validate BEFORE connecting (fail fast, offline-friendly) ----
const JID_EX = '15555550101';
let plan;
if (cmd === 'catalog') {
	plan = { cmd, jid: asJid(requireArg(args, 'jid', JID_EX)), limit: args.limit !== undefined ? Number(args.limit) : undefined };
} else if (cmd === 'collections') {
	plan = { cmd, jid: args.jid ? asJid(args.jid) : undefined, limit: args.limit !== undefined ? Number(args.limit) : undefined };
} else if (cmd === 'product-create') {
	plan = {
		cmd,
		name: requireArg(args, 'name', '"Remera"'),
		price: asPrice(requireArg(args, 'price', '999')),
		currency: requireArg(args, 'currency', 'USD'),
		description: args.description ? String(args.description) : '',
		url: args.url ? String(args.url) : undefined,
		retailerId: args['retailer-id'] ? String(args['retailer-id']) : undefined,
		country: args.country ? String(args.country) : undefined,
		hidden: !!args.hidden,
		images: asImages(args.images || args.image),
	};
} else if (cmd === 'product-update') {
	plan = {
		cmd,
		id: requireArg(args, 'id', 'abc123'),
		update: {
			...(args.name ? { name: String(args.name) } : {}),
			...(args.price !== undefined ? { price: asPrice(args.price) } : {}),
			...(args.currency ? { currency: String(args.currency) } : {}),
			...(args.description !== undefined ? { description: String(args.description) } : {}),
			...(args.url !== undefined ? { url: String(args.url) } : {}),
			...(args['retailer-id'] !== undefined ? { retailerId: String(args['retailer-id']) } : {}),
			...(args.hidden ? { isHidden: true } : {}),
			...(args.visible ? { isHidden: false } : {}),
			...((args.images || args.image) ? { images: asImages(args.images || args.image) } : {}),
		},
	};
	if (Object.keys(plan.update).length === 0) fail('Nothing to update. Provide at least one field.');
} else if (cmd === 'product-delete') {
	const ids = String(requireArg(args, 'ids', 'id1,id2')).split(',').map((s) => s.trim()).filter(Boolean);
	if (ids.length === 0) fail('Missing --ids.');
	plan = { cmd, ids };
} else if (cmd === 'product-send') {
	plan = {
		cmd,
		to: asJid(requireArg(args, 'to', JID_EX)),
		productId: requireArg(args, 'product-id', 'abc123'),
		title: requireArg(args, 'title', '"Remera"'),
		description: args.description ? String(args.description) : '',
		price: asPrice(requireArg(args, 'price', '999')),
		currency: requireArg(args, 'currency', 'USD'),
		image: args.image ? String(args.image) : undefined,
		url: args.url ? String(args.url) : undefined,
		retailerId: args['retailer-id'] ? String(args['retailer-id']) : undefined,
		businessOwner: args['business-owner'] ? asJid(String(args['business-owner'])) : undefined,
		caption: args.caption ? String(args.caption) : undefined,
	};
} else if (cmd === 'order-details') {
	plan = { cmd, orderId: requireArg(args, 'order-id', 'xxx'), token: requireArg(args, 'token', 'yyy') };
} else {
	fail(`Unknown command: ${cmd}. Run with --help.`);
}

let sock;
try {
	({ sock } = await connectSession(session, { dataDir, timeoutMs, verbose }));
} catch (e) {
	fail(`Could not connect with session "${session}": ${e.message}`, 2);
}

async function mediaUpload(ref) {
	if (!ref) return undefined;
	if (/^https?:\/\//i.test(ref)) return { url: ref };
	return await loadFileOrUrl(ref);
}

try {
	switch (plan.cmd) {
		case 'catalog': {
			const res = await sock.getCatalog({ jid: plan.jid, ...(plan.limit ? { limit: plan.limit } : {}) });
			for (const p of res.products || []) {
				console.log(`- ${p.id} | ${p.name} | ${p.price} ${p.currency}`);
			}
			if ((res.products || []).length === 0) console.log('Catalog is empty.');
			break;
		}
		case 'collections': {
			const res = await sock.getCollections(plan.jid, plan.limit);
			for (const c of res.collections || []) {
				console.log(`- ${c.id} | ${c.name} | ${(c.products || []).length} products`);
			}
			if ((res.collections || []).length === 0) console.log('No collections.');
			break;
		}
		case 'product-create': {
			const images = [];
			for (const ref of plan.images) images.push(await mediaUpload(ref));
			const created = await sock.productCreate({
				name: plan.name,
				description: plan.description,
				price: plan.price,
				currency: plan.currency,
				...(plan.url ? { url: plan.url } : {}),
				...(plan.retailerId ? { retailerId: plan.retailerId } : {}),
				...(plan.hidden ? { isHidden: true } : {}),
				originCountryCode: plan.country,
				images,
			});
			console.log(`Created product ${created.id} (${created.name}).`);
			break;
		}
		case 'product-update': {
			if (plan.update.images) {
				const images = [];
				for (const ref of plan.update.images) images.push(await mediaUpload(ref));
				plan.update.images = images;
			}
			const updated = await sock.productUpdate(plan.id, plan.update);
			console.log(`Updated product ${updated.id} (${updated.name}).`);
			break;
		}
		case 'product-delete': {
			const res = await sock.productDelete(plan.ids);
			console.log(`Deleted ${res.deleted ?? plan.ids.length} product(s).`);
			break;
		}
		case 'product-send': {
			// NOTE: product images must be uploaded as Buffer (a remote {url}
			// reference renders as "Something is wrong" in the image slot).
			const productImage = plan.image ? await loadFileOrUrl(plan.image) : undefined;
			const sent = await sock.sendMessage(plan.to, {
				product: {
					productId: plan.productId,
					title: plan.title,
					description: plan.description,
					currencyCode: plan.currency,
					priceAmount1000: Math.round(plan.price * 1000),
					...(plan.retailerId ? { retailerId: plan.retailerId } : {}),
					...(plan.url ? { url: plan.url } : {}),
					...(productImage ? { productImage } : {}),
				},
				...(plan.businessOwner ? { businessOwnerJid: plan.businessOwner } : {}),
				...(plan.caption ? { caption: plan.caption } : {}),
			});
			console.log(`Product message sent to ${plan.to} (id: ${sent?.key?.id ?? 'unknown'}).`);
			break;
		}
		case 'order-details': {
			const details = await sock.getOrderDetails(plan.orderId, plan.token);
			console.log(JSON.stringify(details, null, 2));
			break;
		}
	}
	await closeAndExit(sock, 0);
} catch (e) {
	fail(`Business command failed: ${e.message}`, 2);
}
