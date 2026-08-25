# 0031 — On touch, a long press selects a sentence and details dock as a sheet

Date: 2026-08-25
Status: Accepted

## Context

ADR 0022 made word details, the sentence menu, and the hover preview one
anchored popover at every viewport, and the reading surface answered any press
that was not a word by selecting a sentence. Both rules were written from the
desktop, where a pointer is precise, a click on prose means nothing else, and
there is room beside a line for a card.

On a phone neither holds.

- An anchored card lands on the words it explains, and near an edge it is pushed
  half outside the viewport — the reader could not see the sentence and the
  translation at the same time, and sometimes could not see the card at all.
- The transparent backdrop and the anchored card left nowhere to scroll: the
  reading was frozen on the line that had been pressed.
- A tap is how a reader dismisses what is open and how they scroll on. Because a
  tap also selected, every attempt to put a sheet away opened the next sentence,
  and the surface could not be put away at all without finding a control.
- The platform answers a long press on text with its own selection callout,
  which covered whatever the long press had just opened.

## Decision

The reading surface has one gesture per device, and details have one placement
per width.

- **Selecting a sentence.** With a mouse, a click that is not on a word selects,
  exactly as before. On touch, only a long press selects — from anywhere in the
  sentence including on a word — confirmed by a short haptic where the device
  offers one. A tap on the reading surface selects nothing.
- The reading surface takes no text selection on a coarse pointer, so the
  platform's long-press callout never competes with the application's own long
  press. A mouse keeps text selection, because a mouse selects by dragging
  rather than by resting.
- **Placement.** Sentence and word details dock to the bottom edge as a sheet
  below the desktop breakpoint, and stay anchored to what was pressed above it.
  A sheet is full width, bounded, scrolls internally, clears the safe-area
  inset, and carries a grab handle that is both a **Close** button and a
  flick-down dismissal.
- **Scrolling.** No popover blocks page scrolling. A docked sheet is fixed to an
  edge rather than to a line, so the reading is free to move behind it; an
  anchored card still closes on scroll, because it would otherwise be dragged
  down the page.
- **Dismissal outside.** A press outside a modal popover dismisses on release
  rather than on the press, and only when the press did not travel. A press that
  travels is a scroll and leaves the surface open.
- The audio player publishes its height on the document root while it is docked,
  so a sheet opened over it lands on top of it rather than underneath.

## Consequences

- ADR 0022 remains authoritative for there being one popover service, one card,
  one open surface at a time, and a stable reading measure. This ADR supersedes
  only its "compact card at every viewport, never a bottom sheet" placement rule
  and the tap-to-select gesture.
- Copying text with a finger from the reading surface is given up. Selecting a
  sentence is the gesture the reader actually needs there, and it now works
  every time instead of racing the platform's callout.
- Journeys that need an open sentence run a different gesture per project, so
  the end-to-end suite has one shared helper for it rather than a click.
- `ux-ui-specification.md` sections 6 and 11 record the sheet, the gesture, and
  the scrolling rule.

## Alternatives considered

**Keep tap-to-select and add a close button to the card.** Rejected: the reader
still could not scroll, the card was still placed over the text it explains, and
a tap outside still opened something instead of closing something.

**Long press on desktop as well, for one gesture everywhere.** Rejected: waiting
half a second for a mouse press to resolve is a delay with nothing behind it,
and a click on prose has no other meaning to a mouse.
