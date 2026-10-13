#!/usr/bin/env bash
# check-prereqs.sh — verify Bun + skill scripts (no server, no HTTP, no DB).
set -euo pipefail
FAIL=0
ok() { echo "OK: $1"; }
warn() { echo "MISSING: $1"; FAIL=1; }

command -v bun >/dev/null 2>&1 && ok "bun $(bun --version)" || warn "Bun >=1.0 (https://bun.sh)"
command -v python3 >/dev/null 2>&1 && ok "python3 (for verify/install helpers)" || echo "INFO: python3 not found (optional)"

[ -f "SKILL.md" ] && ok "SKILL.md exists" || warn "SKILL.md missing"
[ -f "references/messages.md" ] && ok "operation reference documents exist" || warn "operation reference documents missing"
[ -d "scripts" ] && ok "scripts/ exists" || warn "scripts/ missing"
[ -f "scripts/package.json" ] && ok "scripts/package.json exists" || warn "scripts/package.json missing"
[ -d "scripts/node_modules" ] && ok "scripts dependencies installed" || warn "run: cd scripts && bun install"
[ -d "references" ] && ok "references/ exists" || warn "references/ missing"

for s in pair send groups contacts status react business poll-results poll-watch delete chats labels; do
  if bun "scripts/$s.mjs" --help >/dev/null 2>&1; then ok "scripts/$s.mjs --help"; else warn "scripts/$s.mjs --help failed"; fi
done

if [ "$FAIL" -ne 0 ]; then echo "RESULT: prerequisites INCOMPLETE"; exit 1; fi
echo "RESULT: prerequisites OK"
