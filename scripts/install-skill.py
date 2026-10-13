#!/usr/bin/env python3
"""Install one whatsapp-skill entrypoint with its scripts and plain references.

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
ROUTER_DIRS = ["references", "scripts", "assets", "agents"]
LEGACY_TOPICS = ("setup", "pairing", "messages", "groups", "contacts", "chats", "admin")

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
    source_root = ROOT.resolve()
    target = target.expanduser().resolve()
    dest = target / "whatsapp-skill"
    legacy = target / "baileys-skill"
    if dest.exists() and legacy.exists():
        raise ValueError("Both whatsapp-skill and baileys-skill exist. Consolidate the installations before updating.")
    migrate = not dest.exists() and legacy.exists()
    existing = legacy if migrate else dest
    resolved = existing.resolve()
    if existing.is_symlink() or resolved.is_relative_to(source_root) or source_root.is_relative_to(resolved):
        raise ValueError("Install destination must be separate from the source and cannot be a symbolic link.")
    files = [source_root / name for name in ROUTER_FILES if (source_root / name).is_file()]
    for name in ROUTER_DIRS:
        if (source_root / name).is_dir():
            files.extend(tree_files(source_root / name))
    entrypoints = [file for file in files if file.name in {"SKILL.md", "SKILLS.md"}]
    if entrypoints != [source_root / "SKILL.md"]:
        raise ValueError("Source package must have exactly one central SKILL.md and no SKILLS.md.")
    # Validate every output before copying. Existing links must not redirect writes.
    for source in files:
        output = existing / source.relative_to(source_root)
        if source.is_symlink() or not output.resolve().is_relative_to(resolved):
            raise ValueError(f"Refusing symbolic link or escaped destination: {output}")
        for ancestor in [output, *output.parents]:
            if ancestor == target:
                break
            if ancestor.is_symlink():
                raise ValueError(f"Refusing destination symbolic link: {ancestor}")
    obsolete = []
    if existing.exists():
        for file in tree_files(existing):
            if file.name not in {"SKILL.md", "SKILLS.md"} or file == existing / "SKILL.md":
                continue
            known = [Path("skills") / f"baileys-{topic}" / "SKILL.md" for topic in LEGACY_TOPICS]
            if file.relative_to(existing) not in known:
                raise ValueError(f"Unrecognized extra skill entrypoint: {file}. Move it outside this skill before updating.")
            topic = file.parent.name
            if f"name: {topic}" not in file.read_text(encoding="utf8"):
                raise ValueError(f"Refusing to remove customized legacy entrypoint: {file}")
            obsolete.append(file.relative_to(existing))
    if migrate:
        # Both resolved paths are direct children of the explicitly selected target.
        if resolved.parent != target or dest.resolve().parent != target:
            raise ValueError("Migration paths must stay inside the selected skills directory.")
        legacy.rename(dest)
    for source in files:
        output = dest / source.relative_to(source_root)
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, output)
    for relative in obsolete:
        file = dest / relative
        file.unlink()
        if not any(file.parent.iterdir()):
            file.parent.rmdir()
    old_directory = dest / "skills"
    if old_directory.is_dir() and not any(old_directory.iterdir()):
        old_directory.rmdir()
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
    if not (ROOT / "SKILL.md").exists() or not (ROOT / "references").is_dir():
        print("FAIL: skill package needs SKILL.md and references/", file=sys.stderr)
        return 1
    try:
        dest = install(Path(args.target))
    except (ValueError, OSError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(f"Installed whatsapp-skill -> {dest}")
    print("One central SKILL.md; operation documents are under references/.")
    print("Next: run `bun install` inside the installed scripts/ directory.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
