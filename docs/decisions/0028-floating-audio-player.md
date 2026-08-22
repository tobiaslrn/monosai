# 0028 — Floating audio player

Date: 2026-08-22
Status: Accepted

## Context

The reader-first rework in ADR 0025 made audio discoverable through an
always-visible header button and placed generation, progress, failure recovery,
and whole-reading playback behind an audio panel. That panel used the reader's
CDK popover behavior: it was modal, moved focus, dismissed on outside click and
Escape, and could not coexist with sentence or word details.

Those dismissal and placement rules make sense for sentence and word details,
but not for a transport that a learner may want to keep visible while looking
up language. The audio surface also needs to stay reachable while a reader
popover's transparent backdrop is present.

## Decision

Replace only the audio panel's placement and dismissal behavior with a compact
floating player rendered by `ReaderPageComponent` while the reader route is
active.

### Surface and header contract

- The header Audio button remains present for every reading and exposes
  `aria-expanded`, `aria-controls="reading-audio-player"`, and a stateful name:
  `Audio`, `Audio, ready`, `Audio, playing`, `Audio, paused`, or
  `Audio, being generated`.
- The player is a fixed, horizontally centered `role="region"` labelled
  `Reading audio`. It is a bounded card with internal overflow, safe-area
  bottom spacing, responsive width insets, and bottom reader clearance.
- The player is not a dialog and not a CDK popover. It installs no backdrop,
  focus trap, outside-click listener, or Escape listener. Opening does not move
  focus, request audio, or start playback, and it does not close sentence or
  word popovers.
- The sticky reader header and the player stack above the CDK popover backdrop.
  Sentence, word, and preview popovers retain `PopoverService` and their
  existing one-at-a-time dismissal and focus behavior.

### Toggle semantics

Opening sets the local player-open state and captures the currently selected
sentence for **Start from this sentence**.

Closing through the same header button calls `AudioPlaybackStore.stop()`, which
clears the active sentence and playback cursor. It then hides the player and
clears the captured sentence. It does not cancel an in-progress
`AudioJobStore` generation; generation progress and errors remain intact for
the next opening. Outside clicks and Escape do nothing to the player.

### Controls

The ready state exposes exactly Previous sentence, Play/Pause/Resume, and Next
sentence. Previous and Next are disabled until a sentence is active and retain
the existing non-wrapping boundary behavior. The ready state has no Stop
button; closing from the header is the stop/reset action. Generation keeps its
own Stop control.

## Unchanged decisions

ADR 0024 remains authoritative for audio cache keys, complete-reading gating,
the root playback store, the single audio element, Media Session, sequential
generation, persistence, decode and storage failures, and lifecycle cleanup.
ADR 0025 remains authoritative for the reader-first header and the placement of
sentence and word details. This ADR supersedes only ADR 0025's audio placement
and audio dismissal portions.

## Consequences

- A player can remain visible beside a sentence or word popover without making
  audio modal or stealing focus on open.
- The header Audio button is always clickable above a reader popover backdrop,
  and closing it is an explicit playback reset even when the player is paused.
- A fixed card needs responsive height bounds, internal scrolling, and reader
  bottom clearance; those are presentation concerns and do not change audio
  storage or playback ownership.
- The ready transport has one fewer visible control. Users stop whole-reading
  playback by toggling Audio in the reader header.

## Alternatives considered

**Keep the audio CDK popover and allow it to coexist.** Rejected: the popover's
modal backdrop, focus trap, and Escape/outside dismissal are the wrong contract
for a persistent transport and make coexistence fragile.

**Use a full-width mobile sheet.** Rejected: the player is a compact transport,
not a modal task surface; a bounded card preserves reading context and leaves
sentence details independent.

**Keep a visible Stop button in the ready state.** Rejected: the header toggle
already expresses the complete close/stop/reset lifecycle and avoids a second
control with different semantics.
