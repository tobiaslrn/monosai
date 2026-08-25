# 0022 — One floating popover replaces the reader's side panel and bottom sheet

Date: 2026-08-20
Status: Accepted — placement below the desktop breakpoint superseded by ADR 0031

## Context

Milestone 3 built word details twice: a sticky right-hand panel on desktop
(`.inspector-panel`, a second grid column) and a CDK dialog bottom sheet on
Android (`WordInspectorSheetComponent`). Both rendered the same
`WordInspectorComponent`, so the content contract was already shared; what
differed was the container, the layout it forced, and the dismissal behaviour
that had to be written twice.

Milestone 8B adds a second floating surface — the sentence menu — and a hover
preview. Building either on the existing pair would have meant a third and
fourth container, each with its own focus handling.

The desktop panel also cost the reading itself: opening a word narrowed the text
column and reflowed the paragraph the learner was reading, which is the one
thing a reader should never do to someone mid-sentence.

## Decision

Word details, the sentence menu, and the hover preview are all rendered through
one `PopoverService` on the CDK overlay, into one `ReaderPopoverComponent` card.
The desktop side panel and the mobile sheet component are removed, and the
reading column keeps one width at every viewport.

- Positioning is a flexible connected strategy: below the anchor, flipped above
  it when there is no room, and pushed back inside the viewport when neither
  position fits.
- At every viewport the same card stays connected to its anchor: below it when
  there is room, above it when needed, and pushed inside the viewport otherwise.
  It remains a compact card rather than becoming a bottom sheet. The library's
  separate new-reading chooser may still opt into a mobile sheet. **Superseded by
  ADR 0031:** below the desktop breakpoint the reader's own details dock as a
  sheet, because an anchored card on a phone lands on the text it explains and
  leaves nowhere to scroll.
- The card takes focus, traps it, is dismissed by `Escape` or a click away, and
  returns focus to whatever opened it.
- Exactly one popover exists at a time; opening a second closes the first.
- The hover preview is the one non-modal variant: no backdrop, no focus, and
  `pointer-events: none`, so it can never swallow the click that would pin the
  word underneath it.

## Consequences

- The reading measure is stable: opening a word no longer reflows the text.
- The sentence menu (Phase 3) needed no container work of its own, and sentence
  TTS in Milestone 9 will need none either.
- A modal popover means a click elsewhere dismisses before it selects, so
  opening a second word takes two clicks on desktop. Accepted: reliable
  dismissal, including on touch and with a keyboard, is worth more than saving
  a click, and the hover preview already answers "what is that word" without
  any click at all.
- The transparent backdrop makes the popover modal in effect. The reader behind
  it is still legible, which is what matters for a surface that explains the
  text it covers.
- `ux-ui-specification.md` §6 records the deviation from "right inspector
  panel" and "accessible bottom sheet" and points here.

## Alternatives considered

**Keep the panel on desktop and use the popover only on touch.** Rejected: it
keeps both implementations, keeps the reflow, and leaves the sentence menu
without an answer on desktop, where its anchor is a point in the text rather
than a column.

**A non-modal popover with no backdrop, dismissed on outside click.** Rejected
for the pinned card: outside-click handling that must not fire on the token
that opened it, on a text selection, or on a scroll is exactly the fiddly
behaviour the CDK's backdrop already gets right. The preview, which cannot be
interacted with at all, does use this mode.
