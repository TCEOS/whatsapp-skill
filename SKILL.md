---
name: whatsapp-skill
description: Read, search and send WhatsApp messages; link accounts and manage groups, contacts and sessions through local Bun scripts. Use for WhatsApp conversations, history, media, pairing codes and chat management.
license: MIT
metadata:
  author: TCEOS
  version: "0.2.0"
  runtime: Bun with script dependencies installed; WhatsApp network access for live operations; Python for installation and validation
---

# WhatsApp Skill

This is the only skill entrypoint. Choose the operation below and read its linked
document as ordinary reference material. Load only what the request needs.
Baileys supplies the WhatsApp connection; this skill runs local Bun scripts.

## Choose the operation

| Request | Read |
|---|---|
| Install Bun, dependencies or the skill; troubleshoot setup | [references/setup.md](references/setup.md) |
| Link an account, use a pairing code, recover a stuck login | [references/pairing.md](references/pairing.md) |
| Read or search conversations, use history filters and pagination | [references/scripts-reference.md](references/scripts-reference.md#historymjs--read-conversation-messages) |
| Send text or media; edit, react, poll or delete a message | [references/messages.md](references/messages.md) |
| List, inspect or manage groups | [references/groups.md](references/groups.md) |
| Verify a number or obtain a profile photo | [references/contacts.md](references/contacts.md) |
| Archive, pin, mute, mark read, star or label a chat | [references/chats.md](references/chats.md) |
| Inspect, recover or remove sessions; Business catalog operations | [references/sessions.md](references/sessions.md) |

Exact arguments and exit codes: [references/scripts-reference.md](references/scripts-reference.md).
Each script also supports `--help` without a live session.

## Run scripts

Run from this skill's directory. Install dependencies once with
`bun install --frozen-lockfile` inside `scripts/`, then return to the skill root.

```sh
bun scripts/status.mjs
bun scripts/history.mjs --session personal --chats --search "Project group"
bun scripts/history.mjs --session personal --to <jid> --stats
bun scripts/history.mjs --session personal --to <jid> --cached --search "deadline"
```

For a new pairing, use the phone number supplied by the user, or ask for it first.
Never invent a number or code. Read the pairing guide before running
`bun scripts/pair.mjs --phone <digits> --session <name>`. Stored credentials alone
do not prove that phone-side login finished. Reuse a working session rather than
resetting or linking it again.

## History and local data

- Start with `--stats`, then filter cached messages and read small pages. Output is compact with 240-character previews. Use `--max-text 0` for relevant full messages; bulk results export above 12,000 characters or with `--output-file`.
- Empty caches and timeouts do not establish an empty conversation or the end of history. Older requests need real message keys. Claim a reading task is complete only after actual messages are obtained.
- One live command per session. Initial history and incoming messages are cached before the connection opens; the cache is not a complete phone backup.
- Credentials and caches live under `data/<session>/`, or the configured `--data-dir` / `BAILEYS_DATA_DIR`. Keep this plaintext data local and out of commits, issue reports and shared exports. Selected output may reach the agent's model provider.

## Install and validate

`python scripts/install-skill.py --target .agents/skills` installs one directory,
`whatsapp-skill/`, with this central `SKILL.md` and plain reference documents.
An existing `baileys-skill/` installation is migrated without discarding its
sessions or dependencies. Linked installations need their directory link renamed.

After changes, run `python scripts/verify-skill.py`. See the setup guide for host
discovery paths and installation details.
