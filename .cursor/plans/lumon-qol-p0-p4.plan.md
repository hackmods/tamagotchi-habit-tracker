---
name: Lumon QOL P0-P4
overview: Post-overhaul quality-of-life roadmap for the Innie-Cam monitor PWA — CRT reliability, kiosk, phone habit track, ambient polish, shop/a11y/fonts, and CI hardening.
todos:
  - id: p0-crt-kiosk
    content: Reliable CRT hit target; one-click kiosk/fullscreen; arm-length HUD
    status: completed
  - id: p1-phone
    content: Thumb RESOURCING; desk-as-portal on phone; install copy
    status: completed
  - id: p2-ambient
    content: Richer A-tier motion; discoverability hint; lasting cam chyron
    status: completed
  - id: p3-debt
    content: Geometry polish; focus/dialog audit; self-host fonts
    status: completed
  - id: p4-hardening
    content: Pointer-path e2e; npm start; ambient session report; CapRover SW note
    status: completed
isProject: true
---

# Lumon QOL Roadmap (P0–P4)

Post-[Lumon PWA overhaul](lumon_pwa_overhaul_7df0a13a.plan.md) quality-of-life work. Monitor ambient is primary; phone habit logging is a first-class follow-on surface.

## P0 — Daily use on the extra monitor

1. **Reliable CRT open** — Solid pointer hit target; do not nest interactive terminal chrome inside a button (already a `div[role=button]`); ensure mouse click opens terminal without relying on `el.click()` in production UX.
2. **One-click kiosk mode** — Persist wake lock + optional fullscreen / stay-on-desk; shortcut so UTILITIES dig is not required every session.
3. **Idle desk readability** — Larger HUD / clock / STATUS on 1440p+; optional dim chrome when idle so it reads as a camera feed.

## P1 — Phone habit track

4. **Thumb-first RESOURCING** — Larger protocol buttons, less nested scroll, habit tabs easy on narrow screens.
5. **Desk-as-portal on phone** — Diorama is “tap to enter terminal,” not a tiny aim-target office.
6. **Install / open path** — Clear A2HS copy; phone = logger, monitor = ambient naming.

## P2 — Ambient entertainment polish

7. **Richer A-tier loops** — Improve visitor / night shift / numbers huddle motion quality (not frequency).
8. **Discoverability without spam** — Soft first-run hint that rare events exist; keep cooldowns.
9. **Desk-side log crumb** — Lasting 1-line cam chyron after events (not only toast).

## P3 — Product / shop / a11y debt

10. **Geometry SKUs** — Deepen hex/grid/diamond/fractal visuals or hide until worth CR.
11. **Focus / dialog audit** — Orientation, drawers, MDE/waffle restore focus; landmark cleanup.
12. **Self-host fonts** — Local woff2 for IBM Plex Mono / Silkscreen (offline-first).

## P4 — Hardening for market

13. **Smoke as mouse-path** — E2E opens CRT via real pointer (not `evaluate`).
14. **`npm start`** + UTILITIES ambient session report (last event, cooldown remaining).
15. **Deploy cache bump** — CapRover/docs note when SW `CACHE_NAME` bumps; keep validate-static tied to shell.

## Delivery order

P0 → P1 → P2 → P3 → P4. Ship P0 first for always-on monitor usability.
