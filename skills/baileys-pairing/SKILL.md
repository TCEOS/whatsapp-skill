---
name: baileys-pairing
description: Pair/link a WhatsApp number with a pairing code via script. Use when the user says vincular, sincronizar, pairing code, codigo de vinculacion, conectar numero, or needs a session paired. Always ask for the phone number first.
license: MIT
metadata:
  author: baileys-skill
  version: "3.1"
---

# Baileys Pairing (code only, no QR)

## Pairing and confirmation

1. Obtain the user's phone number (country code + 10–15 digits, no `+`). Reuse a number they already supplied for this session; never invent it.
2. Run `bun scripts/pair.mjs --phone <digits> --session <name>` and show its code with `assets/user-link-steps.md`.
3. Keep the process running: it handles `515` by saving credentials and immediately reconnecting the same session. It requests only one code per attempt.
4. Wait for `TRANSPORT VERIFIED`: authenticated `open`, pending notifications received and 30 seconds without disconnecting. This verifies the transport, not the phone screen.
5. Ask the user whether `Logging in...` disappeared and the device is listed in Linked devices. If they report it is stuck, do not claim pairing succeeded, even after exit 0.

`status.mjs` is offline. `registered: true`, `creds.me`, and a credentials file do **not** establish a working login.

## Recover a stuck login

First stop any other process using this session. Preserve credentials and try:

```bash
bun scripts/pair.mjs --phone <digits> --session <name> --resume --timeout 120
```

This reconnects with saved registered credentials and generates no code. One session lock prevents concurrent pair processes. Reconnection is bounded to four replacements and the configured timeout.

If WhatsApp rejects/revokes the session (e.g. `401`), or resume repeatedly fails, explain the observed code. Have the user cancel the pending phone flow and remove the failed linked device if listed. Then a fresh attempt can use `--reset`: it archives only that named session's auth directory under `data/.pair-backups/` before requesting one new code. Do not reset another working session.

Do not repeatedly request new codes while a previous code is pending. A socket restart after `515` needs saved credentials, not another pairing request. Never recommend a hardcoded WhatsApp version copied from an old forum comment as a universal fix.

Sources, diagnosis and retry details: `references/pairing.md`.
