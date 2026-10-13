#!/usr/bin/env python3
"""install-skill.py — install the baileys-skill skill pack (router + sub-skills) into any agent skills directory.

Usage:
  python scripts/install-skill.py --target .agents/skills
  python scripts/install-skill.py --target ~/.claude/skills
  python scripts/install-skill.py --list
After installing, run `bun install` inside the installed scripts/ once.
"""
import argparse
import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROUTER_FILES = ["SKILL.md", "README.md", "LICENSE", ".gitignore", ".gitattributes",
                "CONTRIBUTING.md", "SECURITY.md", "CHANGELOG.md"]
ROUTER_DIRS = ["references", "scripts", "assets"]

KNOWN = [
    ".agents/skills",
    ".claude/skills",
    ".cursor/skills",
    ".github/skills",
    "~/.codex/skills",
    "~/.agents/skills",
    "~/.claude/skills",
    "~/.cursor/skills",
]

EXCLUDED = {"node_modules", "data", "__pycache__", ".git"}

def tree_files(src: Path):
    """List publishable source files without following links or private/runtime trees."""
    for directory, directories, files in os.walk(src, followlinks=False):
        directories[:] = [name for name in directories if name not in EXCLUDED]
        for name in directories + files:
            candidate = Path(directory) / name
            if candidate.is_symlink():
                raise ValueError(f"Refusing source symbolic link: {candidate}")
        for name in files:
            if name.endswith((".log", ".tmp", ".pyc")):
                continue
            yield Path(directory) / name

def install(target: Path):
    target = target.expanduser().resolve()
    dest = target / "baileys-skill"
    resolved = dest.resolve()
    if dest.is_symlink() or resolved.is_relative_to(ROOT) or ROOT.is_relative_to(resolved):
        raise ValueError("Install destination must be separate from the source and cannot be a symbolic link.")
    files = [ROOT / name for name in ROUTER_FILES if (ROOT / name).is_file()]
    for name in ROUTER_DIRS + ["skills"]:
        if (ROOT / name).is_dir():
            files.extend(tree_files(ROOT / name))
    # Validate every output before copying. Existing links must not redirect writes.
    for source in files:
        output = dest / source.relative_to(ROOT)
        if source.is_symlink() or not output.resolve().is_relative_to(resolved):
            raise ValueError(f"Refusing symbolic link or escaped destination: {output}")
        for ancestor in [output, *output.parents]:
            if ancestor == target:
                break
            if ancestor.is_symlink():
                raise ValueError(f"Refusing destination symbolic link: {ancestor}")
    for source in files:
        output = dest / source.relative_to(ROOT)
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, output)
    # Upgrades overwrite only bundled files; local data and installed dependencies survive.
    return dest

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", default=".agents/skills")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()
    if args.list:
        print("\n".join(KNOWN))
        return 0
    subs = sorted((ROOT / "skills").glob("*/SKILL.md"))
    if not (ROOT / "SKILL.md").exists() or not subs:
        print("FAIL: skill pack incomplete (SKILL.md + skills/*/SKILL.md required)", file=sys.stderr)
        return 1
    try:
        dest = install(Path(args.target))
    except (ValueError, OSError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    names = [sm.parent.name for sm in subs]
    print(f"Installed baileys-skill -> {dest}")
    print(f"Sub-skills: {', '.join(names)}")
    print("Next: run `bun install` inside the installed scripts/ directory.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
