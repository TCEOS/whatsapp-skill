#!/usr/bin/env python3
"""verify-skill.py — validate the baileys-skill skill pack (scripts-only, no HTTP/MCP server)."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FAIL = []

def fail(msg):
    FAIL.append(msg)
    print(f"FAIL: {msg}")

def ok(msg):
    print(f"OK: {msg}")

FRONTMATTER_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

def parse_frontmatter(text):
    if not text.startswith("---"):
        return None, "missing YAML frontmatter ---"
    try:
        fm_raw = text.split("---", 2)[1]
    except IndexError:
        return None, "frontmatter block not closed"
    fm = {}
    for line in fm_raw.splitlines():
        if re.match(r"^\s{2,}\S", line):
            continue
        m = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line.strip())
        if m:
            fm[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return fm, None

def check_skill(skill_md: Path, root_name: str | None = None):
    rel = skill_md.relative_to(ROOT)
    text = skill_md.read_text(encoding="utf-8")
    fm, err = parse_frontmatter(text)
    if err:
        fail(f"{rel}: {err}")
        return
    name = fm.get("name", "")
    desc = fm.get("description", "")
    if not FRONTMATTER_NAME.fullmatch(name or ""):
        fail(f"{rel}: invalid name {name!r}")
    else:
        ok(f"{rel}: name={name}")
    if len(name) > 64 or len(name) < 1:
        fail(f"{rel}: name must be 1-64 chars")
    # Repository checkouts may be named whatsapp-skill or unpacked as an archive.
    # Installed sub-skills must still match their frontmatter names.
    if skill_md.parent.name != name and skill_md != ROOT / "SKILL.md":
        fail(f"{rel}: directory {skill_md.parent.name!r} must match skill name {name!r}")
    else:
        ok(f"{rel}: skill directory/package checked")
    if not (1 <= len(desc) <= 1024):
        fail(f"{rel}: description must be 1-1024 chars (got {len(desc)})")
    else:
        ok(f"{rel}: description length={len(desc)}")
    body = text.split("---", 2)[2]
    if len(body.splitlines()) > 500:
        fail(f"{rel}: body > 500 lines — split into references/")
    else:
        ok(f"{rel}: body lines={len(body.splitlines())}")
    return name, desc, body

def main():
    subs = sorted((ROOT / "skills").glob("*/SKILL.md")) if (ROOT / "skills").exists() else []
    if not (ROOT / "SKILL.md").exists():
        fail("SKILL.md missing at skill root")
        return 1
    root = check_skill(ROOT / "SKILL.md")
    if root:
        _, desc, body = root
        for kw in ("whatsapp", "pair", "send"):
            if kw not in desc.lower() and kw not in body.lower():
                fail(f"root SKILL.md missing keyword {kw!r}")
        for phrase in ("bun install", "pair.mjs --phone", "skills/baileys-pairing/SKILL.md",
                       "skills/baileys-setup/SKILL.md", "references/scripts-reference.md"):
            if phrase not in body:
                fail(f"root SKILL.md missing required phrase: {phrase}")
        ok("root required phrases present" if not FAIL else "root phrase check done")
        # pairing order: number question must precede the pair command
        lower = body.lower()
        num_pos = min([p for p in (lower.find("phone number"), lower.find("phone"), lower.find("number")) if p != -1], default=-1)
        pair_pos = body.find("pair.mjs")
        if num_pos == -1 or pair_pos == -1 or num_pos > pair_pos:
            fail("root must ask for the phone number BEFORE running pair.mjs")
        else:
            ok("pairing order: number -> code")

    if len(subs) < 6:
        fail(f"expected >= 6 sub-skills in skills/, found {len(subs)}")
    else:
        ok(f"sub-skills found: {len(subs)}")
    for sm in subs:
        check_skill(sm)

    for rel in ["references/setup.md", "references/pairing.md",
                "references/scripts-reference.md", "assets/user-link-steps.md",
                "scripts/package.json", "scripts/lib/session.mjs", "scripts/lib/args.mjs",
                "scripts/pair.mjs", "scripts/lib/pairing.mjs", "scripts/lib/pair-lock.mjs",
                "scripts/tests/pairing.test.mjs", "scripts/history.mjs",
                "scripts/lib/history-store.mjs", "scripts/lib/history-page.mjs", "scripts/lib/history-view.mjs", "scripts/tests/history.test.mjs",
                "scripts/send.mjs", "scripts/groups.mjs",
                "scripts/contacts.mjs", "scripts/status.mjs", "scripts/react.mjs",
                "scripts/business.mjs", "scripts/poll-results.mjs",
                "scripts/poll-watch.mjs", "scripts/delete.mjs", "scripts/chats.mjs",
                "scripts/labels.mjs", "scripts/lib/votes.mjs",
                "scripts/install-skill.py", "scripts/check-prereqs.sh",
                "scripts/check-prereqs.ps1", "README.md", "LICENSE"]:
        if not (ROOT / rel).exists():
            fail(f"missing file: {rel}")
    ok("file inventory checked")

    # Pure skill assertions: no server, no HTTP, no MCP server, no QR lib
    for rel in ["src", "drizzle", "Dockerfile", "docker-compose.yml", "package.json",
                "tsconfig.json", "docs", "dist", "node_modules"]:
        if (ROOT / rel).exists():
            fail(f"must not exist in a pure skill: {rel}")
    ok("no server leftovers at root")
    gi = (ROOT / ".gitignore")
    gi_text = gi.read_text(encoding="utf-8") if gi.exists() else ""
    if "node_modules" not in gi_text or "data/" not in gi_text:
        fail(".gitignore must exclude node_modules and data/")
    else:
        ok(".gitignore excludes node_modules and data/")
    banned = {
        "qrcode-terminal": ["scripts/package.json"],
        "Bun.serve": ["scripts/*.mjs", "scripts/lib/*.mjs"],
        "from 'express'": ["scripts/*.mjs", "scripts/lib/*.mjs"],
        "curl ": ["SKILL.md", "skills/*/SKILL.md", "references/*.md", "scripts/*.mjs"],
    }
    import glob as _glob
    for needle, patterns in banned.items():
        hits = []
        for pat in patterns:
            for f in _glob.glob(str(ROOT / pat)):
                if needle in Path(f).read_text(encoding="utf-8", errors="ignore"):
                    hits.append(Path(f).relative_to(ROOT).as_posix())
        if needle == "qrcode-terminal" and not hits:
            ok("no qrcode-terminal dependency")
        elif hits:
            fail(f"banned {needle!r} found in: {', '.join(hits)}")
        elif needle != "qrcode-terminal":
            ok(f"no {needle!r} in skill sources")

    print(f"RESULT: {'PASS' if not FAIL else f'{len(FAIL)} FAILURES'}")
    return 0 if not FAIL else 1

if __name__ == "__main__":
    sys.exit(main())
