# WhatsApp Contacts

Session must be paired first (`references/pairing.md`).

## Fragments

```bash
# Does the number exist on WhatsApp?
bun scripts/contacts.mjs --session ventas check --jid 15555550101

# Profile picture URL
bun scripts/contacts.mjs --session ventas photo --jid 15555550101
```

On `does NOT exist` → stop and ask the user for the correct number; do not guess.

Detail: `references/scripts-reference.md` (contacts section).
