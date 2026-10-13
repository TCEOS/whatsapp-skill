# WhatsApp Groups

Session must be paired first (`references/pairing.md`).

## Fragments

```bash
# List participating groups
bun scripts/groups.mjs --session ventas list

# Group metadata (subject, size, participant JIDs)
bun scripts/groups.mjs --session ventas info --jid 123456789@g.us

# Create a group (comma-separated phones or JIDs)
bun scripts/groups.mjs --session ventas create --subject "Equipo" --participants 15555550102,15555550103

# Change the group picture (file or URL)
bun scripts/groups.mjs --session ventas photo --jid 123456789@g.us --image ./logo.jpg

# Rename / description
bun scripts/groups.mjs --session ventas subject --jid 123456789@g.us --subject "Nuevo nombre"
bun scripts/groups.mjs --session ventas description --jid 123456789@g.us --description "Info del grupo"

# Participants: add | remove | promote | demote
bun scripts/groups.mjs --session ventas participants --jid 123456789@g.us --action add --participants 15555550102

# Settings: announcement | not_announcement | locked | unlocked
bun scripts/groups.mjs --session ventas settings --jid 123456789@g.us --setting announcement

# Join requests: list, approve, reject
bun scripts/groups.mjs --session ventas requests --jid 123456789@g.us
bun scripts/groups.mjs --session ventas requests --jid 123456789@g.us --action approve --participants 15555550102

# Invites: get code, revoke, preview, join
bun scripts/groups.mjs --session ventas invite-code --jid 123456789@g.us
bun scripts/groups.mjs --session ventas revoke-invite --jid 123456789@g.us
bun scripts/groups.mjs --session ventas invite-info --code AbCdEfGhIjKlMnOpQrStUv
bun scripts/groups.mjs --session ventas accept-invite --code AbCdEfGhIjKlMnOpQrStUv
```

Then message the group with its JID:

```bash
bun scripts/send.mjs --session ventas --to <group-id>@g.us --text "Hola grupo"
```

Detail: `references/scripts-reference.md` (groups section).
