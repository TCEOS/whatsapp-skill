# Changelog

## 0.2.0 — 2026-10-13

- Rename the discoverable skill and installation directory to `whatsapp-skill`, with the UI label “WhatsApp Skill”.
- Keep one central `SKILL.md`; operation guides are plain Markdown documents under `references/`.
- Migrate regular `baileys-skill` installations while preserving sessions and dependencies; remove former bundled sub-skill entrypoints.
- Validate the single-entrypoint layout and router links during installation checks and CI.

## Initial public release — 2026-10-13

- Local Bun scripts and Agent Skills instructions for WhatsApp through Baileys.
- Persistent message caching with listeners attached before session initialization.
- Cached and on-demand history reads using actual message keys, with timeout and missing-history errors.
- Compact output, local text and date filters, per-message lookup, statistics, pagination, and file exports for large results.
- Offline tests, installation instructions, and a synthetic demo that does not require a WhatsApp account.

The initial public release retained the old installed name. Version 0.2.0 migrates that name to `whatsapp-skill`.
