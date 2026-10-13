# Scripts reference — whatsapp-skill

All scripts run with Bun from the skill root (or installed copy root).
Notation: `bun scripts/<name>.mjs ...`. Every script accepts `--help` and
`--data-dir <path>` (default `<skill>/data`). `--verbose` enables debug logs.

Exit codes: `0` ok · `1` bad arguments · `2` connection/operation failed ·
`3` session not paired (pair it first).

## pair.mjs — link a number with a code

```bash
bun scripts/pair.mjs --phone 15555550101 --session ventas
```

- Prints one `YOUR PAIRING CODE: XXXX-XXXX` per attempt. Handles `515` with saved credentials, not a new code.
- Exit 0 requires authenticated open, pending notifications and 30s stability; still confirm the phone left `Logging in...` with the user.
- Existing registered credentials: use `--resume` (no new code) to recover/verify.
- `--reset` archives only the named session in `data/.pair-backups/` before a fresh attempt.
- `--timeout 300` defaults to five minutes; range 40–1800 seconds. At most four reconnects.
- Pairing uses a process lock; stop other live commands using that session first.
- Flow detail: `references/pairing.md`, user steps: `assets/user-link-steps.md`.

## history.mjs — read conversation messages

```bash
bun scripts/history.mjs --session personal --chats --search "Example Contact"
bun scripts/history.mjs --session personal --to <jid> --limit 20
bun scripts/history.mjs --session personal --to <jid> --cursor <nextCursor> --limit 20
bun scripts/history.mjs --session personal --to <jid> --cached
bun scripts/history.mjs --session personal --to <jid> --stats
bun scripts/history.mjs --session personal --to <jid> --cached --search calendario --after 2026-10-01 --limit 200
bun scripts/history.mjs --session personal --to <jid> --cached --limit 5000 --max-text 0 --output-file ./messages.json
```

- All socket-based scripts preserve received messages and contacts under ignored `data/<session>/history/`. Listeners are attached before authenticated open and during pairing, so initial sync is retained. There is no database or background server.
- `--chats` lists the cached chat index; `--search` filters its names or JIDs. An absent name does not prove the chat does not exist. Use `groups.mjs list` to resolve group JIDs.
- `--cached` reads without a connection. Otherwise, the script connects and reads saved messages, requesting older history if the page is incomplete. `--stats` is always offline and returns counts and date coverage instead of bodies.
- Token-efficient default: compact JSON rows `[epochSeconds, senderIndex, text]` with one sender dictionary, 240 characters per text preview, no repeated field names or IDs. A `truncated` count signals previews. Use `--max-text 0` for complete text, `--ids` for row IDs, or `--format json` for detailed metadata. Full content stays in the cache.
- Filter before output with `--search <text>`, `--after <ISO date/time>`, `--before <ISO date/time>` and `--message-id <id>`. Text search is case/accent insensitive and examines full stored text before clipping. Specify an ISO offset for local-time boundaries. Internal protocol messages are hidden unless `--include-system` is set.
- `--limit` is 1–5000 (default 10). Each network call fetches at most 50 older messages; larger limits mainly serve saved history. `--wait` is 5–120 seconds (default 20). Run only one live command per session.
- Output exceeding 12,000 characters is automatically saved under `data/<session>/history/exports/`; stdout returns only count, path and cursor. Set `--output-file <path>` to export explicitly, or `--max-output-chars <n>` to change the cap (0 disables it). Export files are never overwritten. To inspect a large chat, start with `--stats`, then filtered cached pages; export bulk content instead of injecting it all into an agent's context.
- Pagination uses an actual key and its `messageTimestamp` in epoch seconds, restored correctly from protobuf Long values after disk reload. A cursor belongs to its chat; messages sharing a timestamp are paginated by key position. PN/LID aliases share cached records; phone-number JIDs are used for on-demand requests when their mapping is known.
- A network request must match an actual ON_DEMAND response's request ID. A timeout with no stored messages exits 2 instead of reporting success with `messages: []`. Partial cached results report `source: cache` and a warning if the request times out. `endOfHistory: false` deliberately avoids inferring completeness from an empty response.
- Credentials saved by older versions may have no history cache: reconnecting does not replay previously processed initial sync. Bootstrap only with a verified message key and timestamp from that conversation:

```bash
bun scripts/history.mjs --session personal --to <jid> --anchor-id <real-id> --anchor-timestamp <epoch-seconds> --anchor-from-me false --participant <group-sender-jid>
```

Omit `--participant` for a direct conversation. This requests that real message and older history from the phone; it does not fabricate a message or send chat text. Never use an all-zero ID or arbitrary timestamp. If no real key exists locally, explain the missing initial cache and capture incoming messages. Do not silently unlink, reset credentials, weaken authentication checks, or treat a Desktop/UI reading as proof that Baileys returned messages. A reading task is complete only after real messages are obtained.

## send.mjs — text and media

```bash
bun scripts/send.mjs --session ventas --to 15555550101 --text "Hola!"
bun scripts/send.mjs --session ventas --to 15555550101 --image ./foto.jpg --caption "Mira"
bun scripts/send.mjs --session ventas --to 15555550101 --image https://example.com/a.jpg
bun scripts/send.mjs --session ventas --to 15555550101 --document ./informe.pdf
bun scripts/send.mjs --session ventas --to 15555550101 --audio ./tema.mp3
bun scripts/send.mjs --session ventas --to 15555550101 --voice ./nota.ogg
bun scripts/send.mjs --session ventas --to 123456789@g.us --text "Hola grupo"
```

- `--to`: digits (→ `@s.whatsapp.net`) or full JID (`@s.whatsapp.net`, `@g.us`, `@lid`).
- One attachment per message. `--caption` applies to image/document.
- `--audio` sends a regular audio file; `--voice` sends a voice-note bubble
  (`ptt`). Both are transcoded to Opus/OGG with ffmpeg.
- `--video` sends video (gif autoplays). `--view-once` with `--image`/`--video`
  sends a view-once message.
- `--sticker` / `--sticker-gif`: any image (or gif/mp4) converted to WebP with ffmpeg. No `--text` with stickers.
- `--location "lat,lng"` + `--location-name` / `--location-address`.
- `--contact-name` + `--contact-phone` sends a vCard contact. Optional:
  `--contact-email`, `--contact-org`, `--contact-title`, `--contact-address`,
  `--contact-url`, `--contact-note`.
- `--poll "Pregunta" --options "A,B" [--selectable 1]` sends a poll (2-12 options).
- `poll-results.mjs --session S --id ID` prints the tally stored by the daemon
  (instant, days later). Add `--voters` to include who voted (hidden by default).
  `--live --to J --wait N` tallies votes cast live.
- `poll-watch.mjs --session S [--poll-id ID]` is the long-running daemon that
  records every vote into `<id>.votes.json`. Run one connection at a time.

## delete.mjs — delete for everyone

```bash
bun scripts/delete.mjs --session ventas --to 15555550101 --id <message-id>
```

Only recent messages (about 2 days). Add `--participant <jid>` to delete
someone else's message as group admin.
- `--event-name` + `--event-start` (ISO or epoch, future) sends an event.
  Optional: `--event-end`, `--event-description`, `--event-location "lat,lng"`, `--event-guests`.
- `--typing <sec>` / `--recording <sec>` (1-30, default 3) shows
  "typing..." / "recording..." before sending.
- `--text "nuevo" --edit <id>` edits your own text message.
- `--disappearing <0|86400|604800|7776000>` sets the chat timer (off/24h/7d/90d),
  alone or combined with a message.
- Prints the sent message id.

## react.mjs — emoji reactions

```bash
bun scripts/react.mjs --session ventas --to 15555550101 --id EXAMPLE_MESSAGE_ID --emoji "❤️"
```

- `--id` is the message id (returned by `send.mjs`, `key.id` of any message).
- Default emoji `❤️`. Add `--participant <jid>` for group messages from others.

## groups.mjs — groups
```bash
bun scripts/groups.mjs --session ventas list
bun scripts/groups.mjs --session ventas info --jid 123456789@g.us
bun scripts/groups.mjs --session ventas create --subject "Equipo" --participants 15555550102,15555550103
bun scripts/groups.mjs --session ventas photo --jid 123456789@g.us --image ./logo.jpg
bun scripts/groups.mjs --session ventas subject --jid 123456789@g.us --subject "Nuevo nombre"
bun scripts/groups.mjs --session ventas description --jid 123456789@g.us --description "Info"
bun scripts/groups.mjs --session ventas participants --jid 123456789@g.us --action add --participants 15555550102
bun scripts/groups.mjs --session ventas settings --jid 123456789@g.us --setting announcement
bun scripts/groups.mjs --session ventas member-add-mode --jid 123456789@g.us --mode admin_add
bun scripts/groups.mjs --session ventas requests --jid 123456789@g.us
bun scripts/groups.mjs --session ventas invite-code --jid 123456789@g.us
bun scripts/groups.mjs --session ventas revoke-invite --jid 123456789@g.us
bun scripts/groups.mjs --session ventas invite-info --code AbCdEfGhIjKlMnOpQrStUv
bun scripts/groups.mjs --session ventas accept-invite --code AbCdEfGhIjKlMnOpQrStUv
bun scripts/groups.mjs --session ventas leave --jid 123456789@g.us
```

- `list` prints `<jid> | <subject> | <n> members`.
- `info` prints subject/size/participant JIDs as JSON.
- `create` prints the new group JID (message it via `send.mjs --to <jid>`).
- `photo` sets the group picture from a file or URL.

## contacts.mjs — number checks

```bash
bun scripts/contacts.mjs --session ventas check --jid 15555550101
bun scripts/contacts.mjs --session ventas photo --jid 15555550101
```

- `check` prints `EXISTS` / `does NOT exist` (via `onWhatsApp`).
- `photo` prints the profile picture URL (empty when none).

## chats.mjs — organize chats

```bash
bun scripts/chats.mjs --session ventas archive --jid 15555550101
bun scripts/chats.mjs --session ventas unarchive --jid 15555550101
bun scripts/chats.mjs --session ventas pin --jid 15555550101
bun scripts/chats.mjs --session ventas unpin --jid 15555550101
bun scripts/chats.mjs --session ventas mute --jid 15555550101 --duration 3600
bun scripts/chats.mjs --session ventas unmute --jid 15555550101
bun scripts/chats.mjs --session ventas read --jid 15555550101 --ids id1,id2
bun scripts/chats.mjs --session ventas unread --jid 15555550101 --id <message-id>
bun scripts/chats.mjs --session ventas star --jid 15555550101 --id <message-id>
bun scripts/chats.mjs --session ventas clear --jid 15555550101
bun scripts/chats.mjs --session ventas delete --jid 15555550101
```

`clear` wipes messages, `delete` removes the whole chat (local history).

## labels.mjs — labels (no list API)

```bash
bun scripts/labels.mjs --session ventas create --name "Cliente" [--id <id>] [--color 0-19]
bun scripts/labels.mjs --session ventas chat-add --jid 15555550101 --label-id <id>
bun scripts/labels.mjs --session ventas chat-remove --jid 15555550101 --label-id <id>
bun scripts/labels.mjs --session ventas message-add --jid 15555550101 --message-id <id> --label-id <id>
bun scripts/labels.mjs --session ventas message-remove --jid 15555550101 --message-id <id> --label-id <id>
```

Baileys exposes no list-labels call; manage them in the phone UI.
`watch` listens for phone-made label edits and prints their IDs.

## status.mjs — local sessions (offline)

```bash
bun scripts/status.mjs
bun scripts/status.mjs --data-dir ./mis-datos
```

Prints stored credential state per session: `REGISTERED CREDS (offline; login not verified)` / `INCOMPLETE credentials` / `no creds`. It never establishes phone-side success.
Reads `creds.json` only — no network.

## lib/ — shared helpers (not run directly)

- `lib/session.mjs`: `connectSession` (connect + reconnect until open/timeout/logout),
  `createSocket` + `monitorSocket` + `completePairing` (verified pairing flow), `readLocalSession`, `sessionDir`,
  `toJid`, `cleanPhone`, `loadFileOrUrl`, `toStickerWebp`, `toVoiceOgg`,
  `simulatePresence`, `closeAndExit`.
- `lib/args.mjs`: tiny argv parser, `requireArg`, `fail`.

## business.mjs — catalog, products, orders (needs WhatsApp Business)

```bash
bun scripts/business.mjs --session ventas catalog --jid 15555550101
bun scripts/business.mjs --session ventas collections --jid 15555550101
bun scripts/business.mjs --session ventas product-create --name "Remera" --price 999 --currency USD --description "Algodon" [--url --retailer-id --country --hidden --images a,b]
bun scripts/business.mjs --session ventas product-update --id abc123 --price 899
bun scripts/business.mjs --session ventas product-delete --ids abc123,def456
bun scripts/business.mjs --session ventas product-send --to 15555550101 --product-id abc123 --title "Remera" --description "Algodon" --price 999 --currency USD [--image --url --retailer-id --business-owner --caption]
bun scripts/business.mjs --session ventas order-details --order-id xxx --token yyy
```

> KNOWN ISSUE: `product-send` with a fictitious productId renders
> "Something is wrong" in the card image slot. Verified: our upload is
> correct (URL + hashes + thumbnail); the phone resolves the image from the
> business CATALOG, so a real catalog + real productId is required for a
> perfect card. Personal accounts get a server-side error on writes.

Personal accounts get a clean server-side error on product/order writes.
