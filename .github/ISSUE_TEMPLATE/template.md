---
name: New Mini Applet
about: Propose a new mini applet for the SLAP launcher
title: "feat(applet): "
labels: ["enhancement", "mini-applet"]
assignees: []
---

## Summary
Describe the applet in 1-3 sentences.

## Problem / Motivation
What user need does this applet address?

## Core Loop
What does the user do repeatedly?

## Controls
- Input type: `buttons` / `canvas taps` / `keyboard` / `other`
- Required controls:
  - [ ] Primary action
  - [ ] Secondary action
  - [ ] Reset/Restart
- Mobile-first notes:

## UI + Rendering
- Render type: `DOM` / `canvas`
- Required visuals:
- Layout constraints (single-screen, no-scroll, etc.):

## State + Persistence
- Should progress persist between sessions? `yes/no`
- Data to store (if any):
- Storage path suggestion (e.g. `my-applet-state.json`):

## Scoring / Win / Lose Rules
- Score model:
- Win condition:
- Lose condition:
- Difficulty scaling (if any):

## Audio (Optional)
- [ ] No audio
- [ ] Simple SFX
- [ ] Music loop
Details:

## Acceptance Criteria
- [ ] Applet is installable from **Manage Apps**
- [ ] Applet appears in launcher catalog with icon/title/description
- [ ] Works on mobile touch
- [ ] Works offline after install
- [ ] No console errors during normal play
- [ ] Build passes (`npm run build`)

## Implementation Notes (Optional)
- Suggested package name (e.g. `@slap/my-applet`):
- Similar existing applet(s) to reference:
- Edge cases to test:

