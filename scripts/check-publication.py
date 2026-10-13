#!/usr/bin/env python3
"""Check the Git-tracked release contents, without reading private runtime trees."""
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
FORBIDDEN_DIRS = {"data", "node_modules", "__pycache__", ".git", ".diagnostic-tools"}
FORBIDDEN_FILES = {"creds.json", "code.txt", "history-seeds.json"}
PATTERNS = [
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
    re.compile(r"\bgithub_pat_[A-Za-z0-9_]{30,}\b"),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r'"(?:noiseKey|signedIdentityKey|advSecretKey)"\s*:\s*(?:\{|"[A-Za-z0-9+/]{20})'),
]

def main():
    result = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True)
    if result.returncode:
        print("FAIL: publication check needs a Git checkout with staged/tracked files.")
        return 1
    names = [item.decode("utf8") for item in result.stdout.split(b"\0") if item]
    if not names:
        print("FAIL: no tracked release files.")
        return 1
    failures = []
    for name in names:
        relative = Path(name)
        if (FORBIDDEN_DIRS.intersection(relative.parts)
                or relative.name in FORBIDDEN_FILES
                or (relative.name.startswith(".env") and relative.name != ".env.example")
                or relative.suffix in {".log", ".tmp", ".pyc", ".db", ".sqlite", ".ldb"}):
            failures.append(f"{name}: runtime/private file cannot be published")
            continue
        file = ROOT / relative
        if file.is_symlink() or not file.resolve().is_relative_to(ROOT):
            failures.append(f"{name}: source link/escaped path")
            continue
        if file.stat().st_size > 2_000_000:
            failures.append(f"{name}: oversized file needs manual review")
            continue
        try:
            content = file.read_text(encoding="utf8")
        except UnicodeError:
            failures.append(f"{name}: binary file needs manual review")
            continue
        if any(pattern.search(content) for pattern in PATTERNS):
            failures.append(f"{name}: possible session material or credential")
    for failure in failures:
        print(f"FAIL: {failure}")
    print(f"Publication check: {len(names)} tracked files; {'PASS' if not failures else 'FAIL'}")
    return bool(failures)

if __name__ == "__main__":
    sys.exit(main())
