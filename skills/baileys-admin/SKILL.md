---
name: baileys-admin
description: Manage local WhatsApp sessions (list state, re-pair, delete) and Business commerce (catalog, products, orders) for the script skill. Use when the user says sesiones, estado, desvincular, borrar sesion, catalogo, producto, orden, or a session misbehaves.
license: MIT
metadata:
  author: baileys-skill
  version: "3.1"
---

# Baileys Admin (local sessions)

Sessions are folders, not server records. No HTTP involved.

## Fragments

```bash
# List stored credentials (offline; login is not verified)
bun scripts/status.mjs
# Pair a new session (ask for the phone number first)
bun scripts/pair.mjs --phone 15555550101 --session ventas

# Delete a session locally (unlink). Phone stays untouched.
rm -rf data/ventas        # Linux/macOS
Remove-Item -Recurse data/ventas   # Windows PowerShell

# Pair into a custom location
bun scripts/pair.mjs --phone 15555550101 --session ventas --data-dir ./mis-datos
```

## Business (needs WhatsApp Business account)

```bash
# Catalog and collections (read-only)
bun scripts/business.mjs --session ventas catalog --jid 15555550101
bun scripts/business.mjs --session ventas collections --jid 15555550101

# Products
bun scripts/business.mjs --session ventas product-create --name "Remera" --price 999 --currency USD --description "Algodon"
bun scripts/business.mjs --session ventas product-update --id abc123 --price 899
bun scripts/business.mjs --session ventas product-delete --ids abc123,def456

# Send a product message / read an order
bun scripts/business.mjs --session ventas product-send --to 15555550101 --product-id abc123 --title "Remera" --description "Algodon" --price 999 --currency USD --business-owner 15555550101 --caption "Mira esto!"
bun scripts/business.mjs --session ventas order-details --order-id xxx --token yyy
```

`product-send` needs a WhatsApp Business catalog behind `--business-owner`
(or your own if business); personal accounts get a server-side error.

> KNOWN ISSUE (verified 2026-10-13): with a fictitious `product-id` (no real
> catalog behind it) the phone shows "Something is wrong" in the card image
> slot. Our side is correct — the image uploads to WhatsApp servers with URL,
> hashes and thumbnail (verified by intercepting the prepared payload). The
> phone resolves the card image from the BUSINESS CATALOG, not from the
> message, so only a real catalog + real productId renders a perfect card.
> `--caption` is accepted but current Baileys drops it from the card.

Personal accounts get a clean server-side error on product/order writes.

## Troubleshooting

- `Session logged out from the phone` → delete its folder and pair again.
- `Connection timeout` → inspect the disconnect code; use pairing recovery below before requesting a new code.
- Product/order commands need a WhatsApp BUSINESS account; personal accounts
  get a server-side error (the script reports it, exit 2).
- Scripts exit `2` on connection/operation errors, `3` when the session is not paired.

Detail: `references/setup.md` (data layout) and `references/pairing.md` (errors).

## Incomplete login / Logging in

Offline `status.mjs` only reports stored credentials. Never equate `registered: true` with a completed phone login. For `Logging in...`, follow `skills/baileys-pairing/SKILL.md` and `references/pairing.md`: bounded `--resume` first, no automatic code rotation, explicit `--reset` only for the failed session after cancelling the pending phone attempt. Reset archives credentials instead of deleting them.
