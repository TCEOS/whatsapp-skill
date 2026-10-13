---
name: baileys-messages
description: Send WhatsApp text, images, video, documents, audio, view-once via script. Use when the user says enviar mensaje, mandar foto, video, documento, audio, ver una vez, or needs to send anything with a paired session.
license: MIT
metadata:
  author: baileys-skill
  version: "3.0"
---

# Baileys Messages

Session must be paired first (`skills/baileys-pairing/SKILL.md`).
`--to` accepts digits (`15555550101` → `@s.whatsapp.net`) or a full JID
(`...@s.whatsapp.net`, `...@g.us`, `...@lid`).

## Fragments

```bash
# Text
bun scripts/send.mjs --session ventas --to 15555550101 --text "Hola!"

# Image from file or URL, with caption
bun scripts/send.mjs --session ventas --to 15555550101 --image ./foto.jpg --caption "Mira esto"
bun scripts/send.mjs --session ventas --to 15555550101 --image https://example.com/a.jpg

# Video (gif autoplays) and view-once photo/video
bun scripts/send.mjs --session ventas --to 15555550101 --video ./clip.mp4
bun scripts/send.mjs --session ventas --to 15555550101 --image ./foto.jpg --view-once

# Document / audio / voice note
bun scripts/send.mjs --session ventas --to 15555550101 --document ./informe.pdf
bun scripts/send.mjs --session ventas --to 15555550101 --audio ./tema.mp3
bun scripts/send.mjs --session ventas --to 15555550101 --voice ./nota.ogg

# To a group
bun scripts/send.mjs --session ventas --to 123456789@g.us --text "Hola grupo"

# Stickers (converted to WebP with ffmpeg)
bun scripts/send.mjs --session ventas --to 15555550101 --sticker ./foto.jpg
bun scripts/send.mjs --session ventas --to 15555550101 --sticker-gif ./animacion.gif

# Location
bun scripts/send.mjs --session ventas --to 15555550101 --location "-12.0464,-77.0428" --location-name "Lima"

# Contact (vCard, optional extra fields)
bun scripts/send.mjs --session ventas --to 15555550101 --contact-name "Juan" --contact-phone 15555550101
bun scripts/send.mjs --session ventas --to 15555550101 --contact-name "Example Contact" --contact-phone 15555550103 --contact-email maria@example.com --contact-org "Empresa Ejemplo" --contact-title "Gerenta"

# Poll (2-12 options)
bun scripts/send.mjs --session ventas --to 15555550101 --poll "Mejor dia?" --options "Lunes,Viernes" --selectable 1

# Edit your own text message
bun scripts/send.mjs --session ventas --to 15555550101 --text "Texto corregido" --edit <message-id>

# Disappearing messages (timer only, or with a message)
bun scripts/send.mjs --session ventas --to 15555550101 --disappearing 86400
bun scripts/send.mjs --session ventas --to 15555550101 --text "Se autodestruye" --disappearing 86400
bun scripts/send.mjs --session ventas --to 15555550101 --disappearing 0

# Poll results: instant file mode, or live window
bun scripts/poll-results.mjs --session ventas --id <poll-id>
bun scripts/poll-results.mjs --session ventas --id <poll-id> --voters
bun scripts/poll-results.mjs --session ventas --to 15555550101 --id <poll-id> --live --wait 60

# Long polls (days/weeks): daemon collector, then read any time
bun scripts/poll-watch.mjs --session ventas --poll-id <poll-id>
bun scripts/poll-results.mjs --session ventas --id <poll-id>

# Typing / recording indicator before sending (1-30s)
bun scripts/send.mjs --session ventas --to 15555550101 --text "Hola!" --typing 5
bun scripts/send.mjs --session ventas --to 15555550101 --text "Te mando audio" --recording 3

# Event
bun scripts/send.mjs --session ventas --to 15555550101 --event-name "Reunion" --event-start "2026-10-20T18:00:00-05:00" --event-description "Traer laptop"

# React with an emoji (needs the message id)
bun scripts/react.mjs --session ventas --to 15555550101 --id EXAMPLE_MESSAGE_ID --emoji "❤️"

# Delete a message for everyone
bun scripts/delete.mjs --session ventas --to 15555550101 --id EXAMPLE_MESSAGE_ID
```

## Rules

- One media attachment per message.
- On `Session ... is not paired` (exit 3) → pair first, do not retry blindly.
- On `JID does not exist`-style failures → ask the user for the correct number.

Detail: `references/scripts-reference.md` (send section).
