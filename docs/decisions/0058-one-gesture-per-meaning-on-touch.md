# 0058 — On touch, a tap opens a word and a held press opens its sentence

Date: 2026-09-05
Status: Accepted
Supersedes: the touch gesture rules in [0053](0053-reader-touch-details-and-measured-sheets.md); amends its detail-surface and sheet-sizing rules

## Context

[ADR 0053](0053-reader-touch-details-and-measured-sheets.md) gave the sentence
its own touch gesture — two short taps close together — and its amendment made
the first of those taps open a word immediately. That left one press carrying
two meanings, resolved after the fact, and reading on a phone was unpredictable
because of it.

- **The first tap raced its own consequences.** Opening a word docks a sheet,
  and a sheet that covers the pressed word scrolls the reading to keep it
  visible. That scroll cancelled the gesture the same tap had begun, so whether
  two taps opened a sentence depended on where on the screen the first one
  landed.
- **The second tap meant three different things.** On the same word inside the
  window it opened the sentence; after the window it closed the word; on the
  whitespace of the same sentence it was spent dismissing the open sheet,
  because outside-dismissal owns that press. Three outcomes for one gesture is
  not a gesture.
- **The tests hid it.** The shared tap helper waited out the gesture window
  after every tap, so no journey ever ran the fast sequence a reader actually
  makes, and most of the touch cases sat outside the smoke selection.

Beside the gestures, the details themselves had grown fussy: a labelled
**Sentence** row under the headword, a grammar disclosure that printed each
finding's title twice — once as a chip and again inside the fold — and sheets
tall enough to leave the reading they explain as a strip above them.

## Decision

**One gesture, one meaning, decided while it is being made.**

- A short tap on a word opens that word's details immediately. Tapping the same
  word again changes nothing; tapping a different word moves straight to it.
- A press held for 450ms opens sentence details, and opens them while the finger
  is still down, so the gesture confirms itself rather than being confirmed
  afterwards. Holding the same sentence again leaves its details open.
- The long press applies to words, furigana, punctuation, and the leading
  between the lines of that sentence alike, resolved from the pressed element or
  from the paragraph's line geometry.
- A short tap on anything that is not a word dismisses whatever is open, and
  otherwise does nothing. The double tap has no meaning at all any more.
- Dragging scrolls, as it always did. Sentence details still request nothing on
  opening.

The press is a small state machine — waiting, held, cancelled — cancelled by
movement past 10 CSS pixels, a second pointer anywhere, a scroll before it
fires, `pointercancel`, the window losing focus, or the paragraph being
unmounted under it. A press that fired consumes exactly its own release and the
click made from that release, by pointer id: the word under the finger must not
open on top of the sheet that replaced it, and the popover's outside-press rule
must not read the same release as a dismissal. Nothing else is suppressed, so
the next independent tap is untouched.

**Native text selection on the reading surface is given up on touch**, together
with the platform's long-press callout, and only there. The same press cannot
both be the application's sentence gesture and the browser's selection handle.
Selection and the context menu stay native for a mouse, in details, and on every
other screen; `touch-action: manipulation` stays, so scrolling and pinch-zoom
remain the browser's. Copying a sentence on a phone is the sentence card's
**Copy** action, which already existed.

The same rule reaches the surface that press opens. A sheet is raised while the
finger is still down and arrives under it, so the platform finished the opening
press as a text selection over the sheet's own Japanese — one press carrying two
meanings again, one step further along. On touch a sheet therefore starts inert
and arms itself when that press ends, which leaves selecting its text a second,
deliberate hold rather than something a reader is handed for asking to read.

**Details are quieter and shorter.**

- Word details lead with the word and an unlabelled icon button on the same row
  — `LucideCornerRightUp` under the semantic name `sentence-details`, with the
  accessible name and tooltip "Sentence details". It replaces the labelled
  **Sentence** row. No icon draws a sentence, so it draws the relationship
  instead: an arrow that branches off and turns up, because the sentence is the
  level this word sits inside rather than the next thing along. The form summary
  sits under both. The headword size is expressed in `rem`.
- Grammar is always readable: every stored rule appears once, title and full
  explanation together. The disclosure and the duplicate title list are gone.
- An anchored card closes from a small control in its own top corner instead of
  a full-size labelled button at the head of its content. The card's leading row
  is inset to clear it, published as a custom property so only that row pays for
  it and a full-bleed action tray still reaches both edges. A sheet is unchanged:
  its grab handle is both the affordance and the way out.
- A mobile sheet is capped at `50dvh`, still additionally bounded by the space
  above the measured player boundary, and still scrolls internally.
- The sentence card's grab handle and its action tray both stay visible while
  the translation, warnings, and grammar scroll between them.
- When the clipboard is unavailable or refuses, the sentence card prints the
  Japanese source as selectable text as the manual way out, and **Copy** stays
  offered.

**Focus and scrolling are corrected once each.** Focus is set and returned with
`preventScroll`, and replacing one surface with another does not focus the
trigger being left behind. A sheet clears the line that was actually pressed
rather than the whole of a wrapped sentence, reserves temporary room when the
press was at the end of the document, and stops correcting as soon as the reader
scrolls themselves.

## Consequences

- A word tap is answered on the tap, and never has a second meaning attached to
  it afterwards. The gesture that costs half a second is the one a reader makes
  rarely.
- Selecting and copying Japanese with a finger from the reading surface is given
  up again, having been restored by ADR 0053. It is replaced by an action that
  works every time rather than one that raced the application's own press.
  Everything outside the reading surface, and everything on a mouse, is
  unchanged.
- End-to-end journeys open a sentence with a real held pointer sequence, and no
  journey pauses after an ordinary tap. The mobile core cases run in the smoke
  lane.
- ADR 0053's measured-boundary rule for sheets stands; only the viewport cap
  changes. ADR 0022 remains authoritative for one popover service, one card, one
  open surface, and a stable reading measure.
- The long press is verified in the browser lane as a pointer sequence.
  Selection, the context menu, scrolling, and pinch-zoom under a real finger are
  verified by hand on Android Chrome, because no headless harness reproduces the
  platform's own callout.

## Alternatives considered

**Keep the double tap and delay the word again.** Rejected: it is the trade-off
ADR 0053's amendment already reversed, and it does not fix the ambiguity — it
only moves the cost onto the gesture readers make most.

**Give the sentence a visible control on the line.** Rejected: the reading
surface is Japanese and nothing else (ADR 0023), and a control per sentence is
the clutter that rule exists to prevent. The route from a word is the visible
affordance, and it is now an icon rather than a labelled row.

**Keep native touch selection and use a two-finger or edge gesture instead.**
Rejected: an undiscoverable gesture is not a gesture, and holding text is what a
reader already tries first.

**Suppress every click for a while after a long press.** Rejected: it is what
made the previous model unpredictable. Only the release of the pointer that
actually fired is consumed.
