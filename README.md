# whatsapp-skill

[![CI](https://github.com/TCEOS/whatsapp-skill/actions/workflows/ci.yml/badge.svg)](https://github.com/TCEOS/whatsapp-skill/actions/workflows/ci.yml) · [MIT license](LICENSE)

Read and send WhatsApp messages from an agent through local Bun scripts.

An [Agent Skill](https://agentskills.io/specification) built on [Baileys](https://github.com/WhiskeySockets/Baileys). The agent runs a script, reads its output, and loads further instructions when needed. There is no long-running server or MCP transport.

History reads use a local cache. Start with counts, search for relevant messages, and open the full text only when you need it. Large results go to a file instead of filling the agent's context.

## Try the output without linking WhatsApp

Requires [Bun](https://bun.sh). Python 3 is needed only for the installer and skill validator.

```sh
git clone https://github.com/TCEOS/whatsapp-skill.git
cd whatsapp-skill/scripts
bun install --frozen-lockfile
cd ..
bun assets/demo.mjs
```

The demo uses invented messages and calls the same filtering and formatting functions as the history script. It does not connect to WhatsApp or read a session. [Sample output](assets/demo-output.txt).

## Link your account

Run from the repository root:

```sh
bun scripts/pair.mjs --phone <your-number-with-country-code> --session personal
```

Use digits only. On your phone, open **Linked devices → Link a device → Link with phone number**, then enter the code printed by the script. Keep the phone available until initialization completes. Stored credentials alone do not establish a completed login.

The session is saved under `data/personal/`. You can use a different session name for another account. `bun scripts/status.mjs` lists saved sessions offline; it does not test whether they can connect.

## Read a conversation

Find a chat already in the cache, then use its JID:

```sh
bun scripts/history.mjs --session personal --chats --search "Project group"
bun scripts/history.mjs --session personal --to <jid> --stats
bun scripts/history.mjs --session personal --to <jid> --cached --search "deadline" --limit 20
```

The default response contains a sender dictionary and rows of `[epochSeconds, sender, text]`. Text previews are capped at 240 characters. Add `--ids` to include message IDs. Use an ID to inspect one complete message:

```sh
bun scripts/history.mjs --session personal --to <jid> --cached --message-id <id> --max-text 0
```

| Need | Option |
| --- | --- |
| Date range | `--after 2026-01-01T00:00:00Z --before 2026-02-01T00:00:00Z` |
| Older page | `--cursor <nextCursor>` |
| Named JSON fields | `--format json` |
| File export | `--output-file ./history.json` |
| Larger local page | `--cached --limit 1000` |

Results above 12,000 serialized characters automatically export to a local file. The terminal receives a small receipt with the file path and count. This limits what gets printed; it is not a tokenizer or a fixed token guarantee. Explicit output paths must not already exist.

Without `--cached`, the script connects to WhatsApp and can request up to 50 older messages using a real saved message key. A response timeout is reported separately from an empty cache. History reads do not mark the chat as read.

### History has limits

The cache contains messages received while the skill is connected, including initial history synchronization. It is not a complete backup of the phone. Search and statistics cover cached messages, and a null cursor does not prove that the conversation has ended.

If an older version discarded the initial sync, reconnecting may return no history. The script needs an actual message ID and timestamp to request older messages; [the history reference](references/scripts-reference.md) explains the anchor options. It does not fabricate a key or silently delete and re-pair your session.

## Send and manage chats

Sending is explicit:

```sh
bun scripts/send.mjs --session personal --to <phone-or-jid> --text "Meeting moved to 10:00."
bun scripts/send.mjs --session personal --to <phone-or-jid> --document ./agenda.pdf
bun scripts/groups.mjs --session personal list
```

There are also scripts for media, reactions, polls, contacts, chat settings, labels, and Business operations. Every script supports `--help`. See the [script reference](references/scripts-reference.md) for supported arguments and account requirements.

## Install in an agent

For an agent that reads the Agent Skills format:

```sh
python scripts/install-skill.py --target .agents/skills
```

The installed skill is currently named `baileys-skill`, under `.agents/skills/baileys-skill/`. Run `bun install --frozen-lockfile` inside its `scripts/` directory. Point your agent at the installed [SKILL.md](SKILL.md); it routes to the instructions for each operation. Host support varies, so check your agent's skill discovery rules.

## How it works

```text
Agent → SKILL.md → Bun script → Baileys → WhatsApp
                         ↕
                data/<session>/
                credentials + message cache
```

Message listeners attach before the connection opens, including during pairing. Incoming history is persisted under `data/<session>/history/`. Cached reads work offline; live operations connect directly to WhatsApp through Baileys.

[lharries/whatsapp-mcp](https://github.com/lharries/whatsapp-mcp) provides WhatsApp tools through an MCP server. This repository takes a script-based approach for agents that can execute local commands. Pick the interface your agent supports.

## Privacy and account limits

Credentials and message caches are plaintext files on your machine. Keep `data/` out of Git, backups you share, and issue attachments. Anyone who can read those files may gain access to session material or conversation text.

Baileys communicates with WhatsApp. If you run these scripts through an agent, the selected output may also be sent to that agent's model provider. Review the commands, output, and your agent's data settings before using private conversations.

This uses an unofficial WhatsApp client library and is not affiliated with Meta. Protocol changes can break live operations, and using an unofficial client carries account risk. There is no promise of ban prevention or complete history recovery.

## Development

```sh
bun test scripts/tests
python scripts/verify-skill.py
bun assets/demo.mjs
```

Offline tests do not establish live compatibility for every account or platform. See [CONTRIBUTING.md](CONTRIBUTING.md) for bug reports and changes, and [SECURITY.md](SECURITY.md) for sensitive reports.

## Credits and license

WhatsApp connectivity comes from [Baileys](https://github.com/WhiskeySockets/Baileys). The existing MIT license credits Nizar Izzuddin Yatim Fadlan; that notice is retained in [LICENSE](LICENSE).
