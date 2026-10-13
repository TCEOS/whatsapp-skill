# Pairing flow and Logging in troubleshooting

## Number first, one code, verified initialization

Use the phone number already supplied by the user, or ask for it before pairing. Never invent a number or code.

```bash
bun scripts/pair.mjs --phone <digits> --session <name>
```

The script waits for the server registration-ready event before one `requestPairingCode` call. Show the printed code and `assets/user-link-steps.md`. Keep it alive while the phone accepts the code, credentials are saved, and the socket restarts if required.

`515` (`DisconnectReason.restartRequired`) is handled immediately: close the old socket, await credential persistence, recreate with the same saved credentials. Never request a replacement code during this restart. Other reconnects are bounded; `401`, `403`, `411`, and `440` terminate the attempt. A pending attempt whose credentials were never acknowledged terminates instead of silently rotating its code.

Exit 0 / `TRANSPORT VERIFIED` requires:

- Authenticated `connection: open` and registered account credentials.
- `receivedPendingNotifications: true` from that socket.
- The connection remains open for 30 seconds, with credentials flushed before exit.

These signals verify the backend transport, not the phone UI or full chat history. **Ask the user to confirm that Logging in disappeared and the device is listed.** If the phone is stuck, the pairing is not complete from the user's perspective. Never contradict that report because a JSON file contains `registered: true`.

## What was wrong with this skill (2026-10-13)

The previous `waitOpen` ignored `515` and most closes until a 60-second timeout. The outer loop then treated registered credentials as success without recreating an authenticated socket. A final file-only check also returned success after a failed handshake. It could close a newly opened socket after only five seconds, before initialization completed. Offline `status.mjs` labelled those files `PAIRED`, compounding the false positive.

The corrected lifecycle tracks events from socket creation, flushes credentials before replacement, requires real initialization, keeps the connection alive, prevents concurrent pairing processes, and requests only one code per attempt. Do not diagnose every Logging in report as the same upstream bug: inspect the actual close code and transport result.

## Recovery

Stop other processes using the same session. Try existing credentials first:

```bash
bun scripts/pair.mjs --phone <digits> --session <name> --resume --timeout 120
```

Resume emits no code. It can finish a saved but incomplete login; it cannot restore a server-revoked device. If recovery fails, report the actual disconnect code and the fact that login is unconfirmed.

Before a fresh attempt, have the user cancel the phone's pending login and remove the failed linked device if it appears. Then:

```bash
bun scripts/pair.mjs --phone <digits> --session <name> --reset
```

Reset archives that session under `data/.pair-backups/<name>-<timestamp>/`. Backups contain authentication secrets and must remain local, ignored by Git. Never reset a different working session or log authentication keys. A stale process lock is reclaimed only when its recorded PID is no longer alive.

If `515` repeats, inspect saved credentials and version-specific upstream reports. If `401` appears, the server rejected/revoked the device; retrying the same credentials cannot be reported as success. `428` means the connection closed; the code alone does not establish a unique cause. Preserve diagnostic event codes before retrying. `--verbose` is opt-in because Baileys logs can contain private metadata.

## Primary-source reports and guidance

- [Baileys official example](https://github.com/WhiskeySockets/Baileys/blob/master/Example/example.ts): reconnect after a non-logout close and persist `creds.update`. The installed Baileys 7.0.0-rc14 `Socket/socket.js` also explicitly describes restart after first pairing.
- [OpenClaw #85868](https://github.com/openclaw/openclaw/issues/85868): field report of the phone stuck on Logging in until restart finishes credential persistence and the 515 recovery path. This is a reported workaround, not proof that every similar failure has this cause.
- [Baileys #2770](https://github.com/WhiskeySockets/Baileys/issues/2770): overlapping or reconnect-driven pairing-code requests can replace state needed to decrypt the previous response. Use one pending code lifecycle. The issue was closed by stale automation, not a verified fix.
- [Baileys #1242](https://github.com/WhiskeySockets/Baileys/issues/1242): pairing-code connection failures and `428`; follow the official pairing sequence rather than requesting on an unopened transport.

Do not pin an old WhatsApp protocol version based on a single anecdote. Check the installed Baileys version, current upstream guidance, and the actual failure. A successful transport probe still needs phone-side confirmation.

## Regression checks

```bash
bun test scripts/tests/pairing.test.mjs
python scripts/verify-skill.py
```

Offline tests cover 515 save-before-reconnect, no second code, timeout despite registered credentials, missing pending initialization, terminal 401, disconnect during stabilization, disk write errors, listener cleanup, and concurrent pairing protection. They do not prove a real phone completed login.
