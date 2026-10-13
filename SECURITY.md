# Security

This skill runs local commands and stores WhatsApp session credentials and message history on disk. Those files are not encrypted by this project. File permissions and the agent that executes the commands are part of the trust boundary.

## Reporting a vulnerability

Use GitHub's **Report a vulnerability** option in this repository's Security tab if it is available. If private reporting is unavailable, open an issue requesting a private reporting channel without describing an exploit or attaching sensitive material. The maintainer can arrange a channel before you share details.

Never post credentials, pairing codes, phone numbers, or private conversation exports in an issue. A synthetic reproduction is usually enough to describe an output or history bug.

There is no promised response time or paid bug bounty. The current release receives fixes as they are available; older copies of the skill may require reinstalling.

## Handling a leaked session

Use WhatsApp's Linked devices screen to unlink the affected session. Deleting a local credential file or removing it from a Git commit does not revoke a linked device. If private text was published, remove the shared copies as well.

`data/` is ignored by Git, but that does not protect files copied into another location. Before sharing a log or export, inspect it locally and redact it. Cached messages can be passed to a model provider when an agent reads the script output.
