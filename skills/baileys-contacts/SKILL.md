---
name: baileys-contacts
description: Verify WhatsApp numbers and fetch profile photos via script. Use when the user says verificar numero, existe este numero, foto de perfil, or needs contact checks with a paired session.
license: MIT
metadata:
  author: baileys-skill
  version: "3.0"
---

# Baileys Contacts

Session must be paired first (`skills/baileys-pairing/SKILL.md`).

## Fragments

```bash
# Does the number exist on WhatsApp?
bun scripts/contacts.mjs --session ventas check --jid 15555550101

# Profile picture URL
bun scripts/contacts.mjs --session ventas photo --jid 15555550101
```

On `does NOT exist` → stop and ask the user for the correct number; do not guess.

Detail: `references/scripts-reference.md` (contacts section).
