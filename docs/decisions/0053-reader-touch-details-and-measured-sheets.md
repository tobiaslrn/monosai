# 0053 — Native touch selection, sentence double taps, and measured detail sheets

Date: 2026-09-04
Status: Accepted
Supersedes: the reader touch gesture and sheet-sizing rules in [0031](0031-touch-reading-gestures-and-docked-details.md) and [0032](0032-touch-word-taps-and-one-selection-colour.md)

## Context

The reader had taken ownership of the platform's long press. A timer selected a
sentence, emitted haptic feedback, suppressed the context menu, and disabled
touch selection. That made the application's gesture deterministic only by
removing a native text capability: a learner could not select and copy Japanese
on a phone.

The replacement still needs a sentence gesture that includes the generous
sentence whitespace and does not make a word tap unreliable. A first touch tap
can mean either "open this word" or "start the sentence gesture", so deciding
immediately opens a word that a second tap intended to replace. Details also
share the bottom edge with the independent audio player, whose height changes
between transport states and as the device viewport changes.

## Decision

The paragraph gesture directive leaves browser selection, copying, and the
context menu native. It recognizes two touch taps when their release points are
within the short reader gesture window and the small same-sentence movement
threshold. The sentence is resolved from the tapped word or from the paragraph's
line geometry, so whitespace and words follow the same rule. A first touch word
tap is held until that window expires; if no second tap arrives, one ordinary
word click is dispatched. A matching second tap opens sentence details and does
not activate a word. Mouse and keyboard activation do not enter the touch
candidate path and remain immediate.

Scrolling, pointer cancellation, multiple active touches, and native selection
cancel pending application actions. The application does not install a long
press timer, haptic response, context-menu suppression, or coarse-pointer text
selection lock. Sentence details are still available from a labelled **Sentence**
button below the tapped word's form heading and summary.

On a mobile viewport, word and sentence details use the shared bottom-sheet
placement. The overlay's bottom edge is the measured top edge of the docked
player, not an estimate. The sheet scrolls independently and its maximum height
is the smaller of the normal viewport cap and the space left above that measured
boundary with the standard top gap. The player height includes its own safe-area
padding, and the sheet accounts for the inset once. Player open/close and resize,
and viewport changes, remeasure or reapply the shared boundary. The open sheet
keeps its anchor clear as its content grows; dismissal and focus return remain
owned by the shared popover service.

## Consequences

- Android and other touch browsers retain native long-press selection and copy.
- A touch word tap has a deliberate short delay, while mouse, keyboard, and the
  visible sentence route have no gesture delay.
- Sentence details never trigger translation or grammar work merely by opening;
  those remain explicit actions in the detail surface.
- The player and detail sheets can coexist without one covering the other, even
  when the player's measured height changes.
- The old long-press and pointer-conditional selection rules remain in the
  repository as historical records, but this decision is the authority for the
  current reader behavior.

## Alternatives considered

**Keep the application long press and disable native selection.** Rejected: it
made sentence selection compete with a platform capability and prevented copy
and text selection on the device where they are most useful.

**Activate a word on the first touch click.** Rejected: a second tap on that
sentence could no longer be recognized without reopening or double-activating
the word.

**Subtract the player from the viewport cap.** Rejected: it shrinks a sheet
twice when the player is short. The player is a bottom boundary; the available
height and the viewport cap are two independent limits.

## Amendment — a roving tab stop per sentence

Words stay ordinary buttons, so the touch rules above are unchanged, but only one
word per sentence is reachable by <kbd>Tab</kbd>. Arrow keys move focus within the
sentence and the last word focused there becomes its tab entry.

The amendment touches focus only. Nothing here observes a pointer, cancels a tap, or
alters native selection, so the gesture window and the first-tap hold described above
continue to decide what a touch means. Focus returning to the activating word when
details close is the same `returnFocusTo` the sheet already used.

[Chapter 8](../arc42/08-crosscutting-concepts.md) describes the resulting key map.
