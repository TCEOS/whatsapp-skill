---
name: baileys-chats
description: Read WhatsApp conversation messages and organize chats and labels via script (history, archive, pin, mute, read, unread, star, clear, delete, labels). Use when the user says leer mensajes, historial, conversacion, archivar, fijar, silenciar, marcar leido, destacar, borrar chat, etiqueta, label, or needs chat management with a paired session.
license: MIT
metadata:
  author: baileys-skill
  version: "3.0"
---

# Baileys Chats

Session must be paired first (`skills/baileys-pairing/SKILL.md`).

## Read a conversation

```bash
bun scripts/history.mjs --session personal --chats --search <name>
bun scripts/history.mjs --session personal --to <jid> --limit 20
bun scripts/history.mjs --session personal --to <jid> --cached --cursor <nextCursor>
```

This reads message content without marking it read. See `references/scripts-reference.md` (history section) for the persistent cache, real anchor recovery and timeout handling. Never interpret zero cached messages or a timeout as an empty conversation or completed reading task.

## Fragments

```bash
# Archive / unarchive / pin / unpin
bun scripts/chats.mjs --session personal archive --jid 15555550101
bun scripts/chats.mjs --session personal unarchive --jid 15555550101
bun scripts/chats.mjs --session personal pin --jid 15555550101
bun scripts/chats.mjs --session personal unpin --jid 15555550101

# Mute (seconds) / unmute
bun scripts/chats.mjs --session personal mute --jid 15555550101 --duration 3600
bun scripts/chats.mjs --session personal unmute --jid 15555550101

# Read / unread / star
bun scripts/chats.mjs --session personal read --jid 15555550101 --ids id1,id2
bun scripts/chats.mjs --session personal unread --jid 15555550101 --id <message-id>
bun scripts/chats.mjs --session personal star --jid 15555550101 --id <message-id>
bun scripts/chats.mjs --session personal star --jid 15555550101 --id <message-id> --unstar

# Danger zone (local history)
bun scripts/chats.mjs --session personal clear --jid 15555550101
bun scripts/chats.mjs --session personal delete --jid 15555550101

# Labels (no list API: labels live in the phone UI)
bun scripts/labels.mjs --session personal create --name "Prueba Skill"
bun scripts/labels.mjs --session personal chat-add --jid 15555550101 --label-id <id>
bun scripts/labels.mjs --session personal chat-remove --jid 15555550101 --label-id <id>
bun scripts/labels.mjs --session personal message-add --jid 15555550101 --message-id <id> --label-id <id>
bun scripts/labels.mjs --session personal message-remove --jid 15555550101 --message-id <id> --label-id <id>

# Capture IDs of phone-created labels (touch one on the phone while it listens)
bun scripts/labels.mjs --session personal watch --timeout 60
```

`clear` wipes messages, `delete` removes the whole chat. Both act on local history.

Detail: `references/scripts-reference.md` (chats section).
