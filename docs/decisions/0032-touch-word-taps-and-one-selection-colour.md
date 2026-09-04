# 0032 — A tap on a phone is one press, one colour, and one open thing

Date: 2026-08-25
Status: Partly superseded by ADR 0051 for the touch sentence gesture; the hover, colour, and target rules remain

## Context

ADR 0031 gave touch its own gesture for a sentence and docked details as a
sheet. What it left alone was the word itself, and reading on a phone was worse
for it.

- **A word often needed two taps.** A press outside an open surface dismissed it
  and then ate the click it was answering, so the first tap on the next word was
  spent closing the card over the previous one.
- **Two colours claimed the same word.** A phone synthesizes `mouseenter` and a
  focus for every tap, so the hover preview's tint arrived alongside the tint of
  the word that was actually open — in a second colour, with a preview card
  behind the details card. Neither the tint nor the card was ever taken back,
  because a finger does not leave.
- **A sentence flashed under every tap.** The press tint was applied on the first
  frame of a press, so a tap that selects nothing, and the first frame of a
  scroll, both shaded a whole sentence.
- **A word is a small target.** A word's box hugs its glyphs so that the space
  around it can belong to the sentence, which on a phone left roughly 22px of
  height to aim at.
- **The sheet covered its own subject.** A sheet docks over the bottom of the
  screen, and a word pressed there was underneath it along with the sentence it
  belongs to.

## Decision

- **Hover belongs to a device that can hover.** `PointerModalityService` follows
  the last real pointer event, publishes it as `data-pointer` on the document
  root, and starts in touch rules on a touchscreen. Hover tints are written
  against it, and the word preview is offered to a mouse and a keyboard only.
  A hybrid device returns to mouse rules on the first mouse movement.
- **One colour for the open thing.** The open word and the open sentence share
  one tint, in the colour that used to mean only "word", because only one of the
  two can be open. Hover and the press tint stay neutral; playback keeps its own.
- **A press on a word reaches the word.** A popover may name a selector whose
  targets a press outside it does not dismiss and whose click is not eaten. The
  reader names the word buttons, so one press moves to the next word — and a
  press on the word that is already open closes it, rather than replaying the
  sheet over the same word.
- **A word is a touch target.** On a coarse pointer, word buttons carry vertical
  padding that reaches into the leading. This is a media query rather than the
  pointer attribute on purpose: it changes layout, and a hit area that appears
  during the very gesture that asked for it is one the browser then hands to the
  line behind the word, which is a tap that does nothing at all.
- **Feedback waits long enough to mean something.** The sentence press tint
  appears after 140ms, so a tap and the start of a scroll leave the page alone,
  and a word answers its own press immediately through `:active`.
- **A sheet never covers what it is about.** When a sheet opens on a phone, the
  reading scrolls just far enough to keep the pressed word or line above it,
  including as the sheet grows to fit what it has to say.

## Consequences

- ADR 0031's remaining surface rules are unchanged: a tap opens a word, a tap
  on prose dismisses, and sheets, colours, and targets keep their existing
  behavior. ADR 0051 supersedes the touch long-press sentence gesture and
  restores native touch selection. This ADR changes what a tap costs, what it
  looks like, and what it can reach.
- Copying the Japanese reading remains native on mouse and touch; ruby
  annotations remain presentation-only.
- Anything else in the application can key hover styling off `data-pointer`
  rather than `@media (hover: hover)`, which on a touchscreen laptop is wrong.
- A press on a word that produces no click — a cancelled gesture — leaves the
  current surface open rather than dismissing it.

## Alternatives considered

**Grow the touch target with an absolutely positioned overlay.** Rejected after
measuring it in Chrome: the overlay takes the press and the browser then
retargets the click to the line behind it, so taps on words stopped working
entirely.

**Keep both tints and make the preview shorter on touch.** Rejected: a preview
is a hover affordance, and a phone has no hover to preview from. Suppressing it
removes a card, a colour, and a race rather than shortening them.

**Scroll the pressed line to the top whenever a sheet opens.** Rejected: it
moves the reading under the reader's finger on every tap. The reading moves only
as far as the sheet actually requires, and not at all when the word is clear.
