---
name: baileys-setup
description: Install Bun and the baileys-skill skill script dependencies, verify scripts run offline. Use when setting up the skill, installing, bun install fails, or scripts do not run.
license: MIT
metadata:
  author: baileys-skill
  version: "3.0"
---

# Baileys Setup

Installs the only two requirements. No server, no HTTP, no database, no Docker.

## 1. Install Bun

```bash
bun --version   # need >= 1.0
```

Missing? https://bun.sh — Windows PowerShell:

```powershell
irm bun.sh/install.ps1 | iex
```

## 2. Install script dependencies

```bash
cd <skill-dir>/scripts && bun install
```

Installs `baileys` (direct WhatsApp connection) and `pino` (logging).
If the agent installed this skill elsewhere, run `bun install` inside the
installed copy's `scripts/` too.

## 3. Verify (offline, no WhatsApp needed)

```bash
bun scripts/status.mjs --help
bun scripts/pair.mjs --help
bun scripts/send.mjs --help
bun scripts/groups.mjs --help
bun scripts/contacts.mjs --help
bun scripts/status.mjs          # lists local sessions (empty at first: OK)
python scripts/verify-skill.py  # validates the whole skill pack
```

On Windows run the prereq checker:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-prereqs.ps1
```

Linux/macOS:

```bash
bash scripts/check-prereqs.sh
```

## 4. Where sessions live

`<skill-dir>/data/<session>/` (`creds.json` + keys), created by `pair.mjs`.
Override with `--data-dir <path>` or `BAILEYS_DATA_DIR`. Never commit `data/`.

Detail: `references/setup.md`. Install paths table for agents: same file.
