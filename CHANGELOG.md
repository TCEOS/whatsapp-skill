# Changelog

## Initial public release — 2026-10-13

- Local Bun scripts and Agent Skills instructions for WhatsApp through Baileys.
- Persistent message caching with listeners attached before session initialization.
- Cached and on-demand history reads using actual message keys, with timeout and missing-history errors.
- Compact output, local text and date filters, per-message lookup, statistics, pagination, and file exports for large results.
- Offline tests, installation instructions, and a synthetic demo that does not require a WhatsApp account.

The public repository is named `whatsapp-skill`. Existing skill and session paths retain the `baileys-skill` name for compatibility.
