# .secrets/ (local only)

This directory is for machine-local notes and credentials that must **not** be committed.

Tracked in git: this `README.md` only (keeps the folder present for clones).

Ignored: everything else under `.secrets/` (see root `.gitignore`).

## Examples

- Lab deploy reviews / Proxmox CT notes
- One-off tokens or passwords used during local setup
- Scratch docs for another Cursor session

Do not put production secrets here if a proper secret manager is available; this is a convenience ignore bucket for personal lab use.
