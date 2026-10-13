# Setup — baileys-skill skill (scripts only)

No server. No HTTP. No database. No Docker. No PostgreSQL.

## Requirements

| Requirement | Check | Install |
|---|---|---|
| Bun >= 1.0 | `bun --version` | https://bun.sh (`irm bun.sh/install.ps1 \| iex` on Windows) |
| Network to WhatsApp | live ops only | — |
| Python 3 (optional) | `python --version` | only for `scripts/verify-skill.py` / `install-skill.py` |

## Install

```bash
cd <skill-dir>/scripts && bun install
```

This installs `baileys` (direct WhatsApp connection used by every script)
and `pino` (script logging). Stickers (`--sticker`), voice notes (`--voice`)
and audio (`--audio`) also need **ffmpeg** on PATH (Windows: `winget install ffmpeg`). If you installed this skill into an agent
(`scripts/install-skill.py`), run `bun install` inside the installed copy too.

## Layout

```
<skill-dir>/
  SKILL.md            router (this skill)
  skills/<name>/      sub-skills, each with its own SKILL.md
  scripts/            executables: pair, send, groups, contacts, status (+ lib/)
  scripts/lib/        shared session/args helpers (not run directly)
  references/         on-demand docs
  assets/             static resources (user-facing steps)
  data/               local sessions (created at runtime, git-ignored)
```

## Verify

```bash
bun scripts/status.mjs            # offline: lists sessions (empty at first is OK)
python scripts/verify-skill.py    # validates the whole skill pack
```

Windows: `powershell -ExecutionPolicy Bypass -File scripts/check-prereqs.ps1`
Linux/macOS: `bash scripts/check-prereqs.sh`

## Install this skill into agents (universal, agentskills.io)

| Agent | Project path | User path |
|---|---|---|
| Codex | `.agents/skills/baileys-skill/` | `~/.codex/skills/baileys-skill/` |
| Standard | `.agents/skills/baileys-skill/` | `~/.agents/skills/baileys-skill/` |
| Claude Code | `.claude/skills/baileys-skill/` | `~/.claude/skills/baileys-skill/` |
| Cursor | `.cursor/skills/baileys-skill/` | `~/.cursor/skills/baileys-skill/` |
| Copilot / VS Code | `.github/skills/baileys-skill/` | `~/.copilot/skills/baileys-skill/` |
| OpenCode / Gemini | `.agents/skills/baileys-skill/` | `~/.agents/skills/baileys-skill/` |

```bash
python scripts/install-skill.py --target .agents/skills
```

## Troubleshooting

- `bun: command not found` → install Bun, restart the shell.
- `Module not found "baileys"` → run `bun install` inside `scripts/`.
- Scripts hang at connect → no route to WhatsApp servers (firewall/VPN); retry.
- Never commit `data/` (session credentials, equivalent to passwords).

## Local Codex installation on Windows

To use an existing local skill with its current dependencies and sessions, link the directory into the Codex user's skill folder (do not copy auth data into a separate installation):

```powershell
New-Item -ItemType Junction -Path "$env:USERPROFILE\.codex\skills\baileys-skill" -Target '<absolute-skill-directory>'
```

Run scripts from that linked skill root. The source directory must remain available; edits are shared. The root `SKILL.md` routes into bundled `skills/` references. No separate dependency install or phone pairing is needed for a linked installation.
