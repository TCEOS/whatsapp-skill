---
name: baileys-skill
description: Drive WhatsApp with local Bun scripts (read cached and on-demand history, pair by code, send text/media, groups, contacts, sessions). Use when the user mentions WhatsApp, Baileys, leer mensajes, historial, vincular, sincronizar, pairing code, codigo de vinculacion, enviar mensaje, grupos, or works with baileys-skill. No server, no HTTP, no MCP protocol.
license: MIT
metadata:
  runtime: Bun >=1.0 with script dependencies installed; WhatsApp network access for live operations
  author: baileys-skill
  version: "3.2"
  spec: agentskills.io
---

# WhatsApp Agent Skill

This Agent Skill combines `SKILL.md` instructions and executable Bun scripts
that connect to WhatsApp through Baileys. It does not implement MCP.
The public repository is `TCEOS/whatsapp-skill`; the installed skill name is
`baileys-skill` for compatibility with existing installations.

Sessions are local folders (`data/<session>/` with `creds.json` + keys).
Nothing listens on any port. No database, no Docker, no PostgreSQL.

## 1. What you must install (do this first)

1. **Bun >= 1.0** — check `bun --version` (https://bun.sh).
2. **Script dependencies** (once):
   ```bash
   cd <skill-dir>/scripts && bun install
   ```

That is all. Detail: `skills/baileys-setup/SKILL.md` + `references/setup.md`.

## 2. Mandatory sync flow — phone number first, then code

NEVER invent a phone number or a pairing code. Always in this order:

1. **Ask the user for the phone number.** Country code + digits, no `+`,
   no spaces (e.g. `15555550101`). Do not continue without it.
2. **Run the pairing script with that number:**
   ```bash
   bun scripts/pair.mjs --phone 15555550101 --session ventas
   ```
3. **Show the printed 8-char code to the user** with the link steps from
   `assets/user-link-steps.md`, and wait for authenticated initialization. Then ask whether the phone left `Logging in...`; saved credentials alone never prove success.

Normative detail: `skills/baileys-pairing/SKILL.md` + `references/pairing.md`.
There is no QR flow: code only.

## 3. Everyday operations (fragments)

```bash
# Stored credentials (offline; does not verify completed login)
bun scripts/status.mjs

# Read messages or find an already cached chat (does not mark it read)
bun scripts/history.mjs --session personal --chats --search "Example Contact"
bun scripts/history.mjs --session personal --to <jid> --limit 20
bun scripts/history.mjs --session personal --to <jid> --cached --cursor <nextCursor>

# Send text / media (session must be paired)
bun scripts/send.mjs --session ventas --to 15555550101 --text "Hola!"
bun scripts/send.mjs --session ventas --to 15555550101 --image ./foto.jpg --caption "Mira"

# Groups and contacts (session must be paired)
bun scripts/groups.mjs --session ventas list
bun scripts/groups.mjs --session ventas create --subject "Equipo" --participants 15555550102,15555550103
bun scripts/contacts.mjs --session ventas check --jid 15555550101

# React to a message
bun scripts/react.mjs --session ventas --to 15555550101 --id <message-id> --emoji "❤️"

# Delete a message for everyone
bun scripts/delete.mjs --session ventas --to 15555550101 --id <message-id>
```

Every script supports `--help` and validates its arguments without network.
Full usage per script: `references/scripts-reference.md`.

## 4. Which sub-skill to read

| Task | Read |
|---|---|
| Install Bun + script dependencies, verify | `skills/baileys-setup/SKILL.md` |
| Link/pair a number (number-first code flow) | `skills/baileys-pairing/SKILL.md` |
| Send text, images, documents, audio | `skills/baileys-messages/SKILL.md` |
| List/create/info of groups | `skills/baileys-groups/SKILL.md` |
| Check numbers, profile photos | `skills/baileys-contacts/SKILL.md` |
| Archive, pin, mute, read, star, clear chats | `skills/baileys-chats/SKILL.md` |
| Read conversation messages, history, pagination, zero-message diagnosis | `references/scripts-reference.md` (history section) |
| Local sessions: list, state, re-pair, delete | `skills/baileys-admin/SKILL.md` |
| Business catalog, products, orders (needs WhatsApp Business) | `skills/baileys-admin/SKILL.md` (business section) |

## 5. Rules for agents

- Progressive disclosure: this file routes; load one sub-skill per task; load `references/*` on demand.
- Run the bundled scripts; do not reimplement Baileys calls inline.
- Never commit `data/` (session credentials). It is git-ignored.
- History is cached from Baileys events in `data/<session>/history/`, with full text and message keys. Attach listeners before the connection opens, including during pairing.
- An empty cache or request timeout is not an empty conversation. Never use invented message IDs, call it end of history, or claim a reading task is done without actual messages. For a session whose initial sync was discarded, use a verified real anchor as documented in the history reference; do not reset or re-pair implicitly.
- Minimize tokens for history: start with `--stats`, then use `--cached --search` or date filters and small pages. Default output is compact with 240-character previews; use `--max-text 0` only for relevant messages. Bulk output auto-exports above 12,000 characters, or use `--output-file`; do not dump thousands of full messages into context.
- Exit codes: `0` ok, `1` bad arguments, `2` connection/operation failed, `3` session not paired.
- Validate this skill with `python scripts/verify-skill.py` after edits.

## 6. Install this skill in any agent (universal)

Follows https://agentskills.io/specification (Claude Code, Cursor, Copilot,
Windsurf, OpenCode, Codex CLI, Gemini CLI, any compatible reader).

```bash
python scripts/install-skill.py --target .agents/skills
```

It installs this router plus every `skills/*` sub-skill (scripts included).
After installing, run `bun install` inside the installed `scripts/` once.
