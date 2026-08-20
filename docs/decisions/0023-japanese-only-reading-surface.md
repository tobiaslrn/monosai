# 0023 — The reading surface carries Japanese and nothing else

Date: 2026-08-20
Status: Accepted

## Context

Milestone 8B rendered aids as content: a translation and every grammar finding
laid out under the sentence they belonged to, expanded by default. Each finding
printed its label, a worded confidence band, and an explanation — including
findings already inside the learner's grammar profile, whose entire content was
that the form is one they have already met.

On a four-sentence reading this produced eight English blocks around four lines
of Japanese. The page a learner opened to read Japanese was mostly commentary on
it, and scrolling the text meant scrolling past the commentary. Eight token
status treatments competed for the same attention: known, normalized,
structural, entity, policy exception, not-in-snapshot, unknown, and a
sentence-level concern rule.

Sentence actions had no usable pointer target either. Sentences are inline
spans, so the only mouse route to the sentence menu was a click on the few
whitespace pixels inside one, and the keyboard route was a visually hidden
button. "Sentence details" was, in practice, unreachable with a mouse.

## Decision

The reading surface shows Japanese. Every piece of English lives in a popover
the learner opened deliberately.

- **No aid is ever laid out on the page.** A sentence with a translation and an
  analysis renders identically to one with neither, so an aid arriving never
  moves the text.
- **Marks are warnings only.** Unreviewed vocabulary takes a pastel-orange
  squiggle; grammar outside the learner's profile takes a pastel-blue one under
  the span the finding covers. Known, normalized, structural, entity, and
  policy-exception statuses render as plain text — each is a way of saying the
  text is readable — and keep their label, explanation, and next action in word
  details.
- **A sentence has no control.** A press anywhere in a paragraph that is not a
  word selects the sentence it fell in or nearest to, decided geometrically from
  the line boxes, because a press in the leading between two lines lands on the
  paragraph and on no sentence element at all. Touch long-presses anywhere in the
  sentence. The leading is deliberately loose — it is the target.
- **A word's target is the word.** The token button is the ruby base rather than
  the ruby's parent, and its leading is reset, so the annotation above it and the
  space around it belong to the sentence.
- **Every action that spends a request is on the sentence**, and the word
  popover is a read-only lookup. The sentence popover carries the translation,
  the words in that sentence the learner's vocabulary does not cover, and the
  grammar outside their profile, each ruled in its marker's own colour. The word
  popover leads with grammar whenever this word has any, because a learner who
  pressed an underlined word came for exactly that, and it never repeats the
  sentence they are already looking at.
- **Whole-reading actions live in the header's overflow menu.** The permanent
  status strip is gone; a running job is a hairline under the header and nothing
  at rest.

## Consequences

- This reverses the Milestone 8B rule that "generated translations and grammar
  results appear automatically when available". `ux-ui-specification.md` section
  6 is rewritten to match.
- Grammar can no longer be read by scanning the page. It is reached by pressing
  the sentence or the marked word, and a finding that supplies no span is shown
  on every word of its sentence, since nothing on the page can carry it.
- `ReaderPreferences.translationsExpanded` is removed, and `statusMarkers`
  becomes `warningMarkers`. A `textScale` preference is added: reading size is a
  learner setting, and line height and paragraph spacing follow it within
  bounds, because the whitespace is now load-bearing.
- Five components that existed only to render page-level aids are deleted:
  the sentence translation, sentence grammar, sentence details, sentence menu,
  and reading status panel.
- Header panels became native popovers with CSS anchor positioning, so light
  dismissal, `Escape`, the top layer, and mutual exclusivity are the platform's
  behaviour rather than a registry and three listeners of our own. Chrome is the
  only supported browser family, which is what makes this available.

## Alternatives considered

- **Keeping aids inline but collapsed by default.** Still leaves every sentence
  carrying a control and a disclosure, and the page still changes height as aids
  arrive.
- **Dropping in-profile findings but keeping out-of-profile ones inline.** Better,
  but a concern is exactly the thing worth stopping for, and stopping is what a
  popover is for.
- **A per-sentence affordance in a gutter.** Prose wraps mid-line, so a sentence
  rarely starts at the margin and has no gutter of its own; the alternatives were
  an end-of-sentence pill or a hover toolbar, both of which print a control on a
  page whose whole point is that it does not.
