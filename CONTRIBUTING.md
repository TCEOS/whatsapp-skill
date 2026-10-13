# Contributing

Useful changes include reproducible history bugs, clearer setup instructions, and smaller output for the same information.

## Before opening an issue

Check the script's `--help` and the [reference](references/scripts-reference.md). Include the command with phone numbers and JIDs replaced, your operating system, Bun version, and the error or unexpected behavior. Say whether it happened in a cached read or a live operation.

Do not attach credentials, pairing codes, exported conversations, or anything from `data/`. Replace real message text with a small invented example. Use the private reporting route in [SECURITY.md](SECURITY.md) for a vulnerability.

## Making a change

Install dependencies from `scripts/` with `bun install --frozen-lockfile`, then return to the repository root.

```sh
bun test scripts/tests
python scripts/verify-skill.py
python scripts/tests/install.test.py
python scripts/check-publication.py
bun assets/demo.mjs
```

Keep command-line help and the script reference consistent. For history changes, cover the behavior that could lose messages, return the wrong page, or expose unrelated text. Use synthetic fixtures. Network tests should be optional and must not send messages without an explicit request.

Describe the problem, the resulting behavior, and what you checked in your pull request. Label live account checks separately from offline tests. Small changes with a clear reproduction are easier to review.

The project uses the MIT license in [LICENSE](LICENSE). Preserve attribution from existing code and dependencies.
