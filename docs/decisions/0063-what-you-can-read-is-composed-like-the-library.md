# 0063 — What you can read is composed like the Library

Date: 2026-09-10
Status: Accepted

## Context

The Library was redrawn as an image-led home: no utility bar, a compact header
of its own, quiet raised rows, the clearer home green. The page it leads to —
What you can read, and the vocabulary list behind it — still wore the older
settings look: the shared utility bar, two bordered panels, a filled Add words
button, the whole reading-level ladder inline, and a vocabulary list of stacked
labels. Moving from home to the page one tap away felt like moving into a
different application.

A design for the four surfaces involved — the overview, the vocabulary list,
the Add words sheet, and the reading-level ladder — put them in the Library's
language.

## Decision

### The pages wear their own title row

`/reading-level` and everything under it hide the shell's utility bar, as the
Library does. Each page's title row carries Back, the title, and Help at its
end; one quiet line under the title says what the page holds or how many words
it lists. Settings stays one tap away through Back to the Library.

### Facts are cards that lead to what they summarise

The overview is a column of `.mn-card` surfaces on the Library's rail:

- **Vocabulary** — the count, as one link to the list.
- **Word sources** — a heading with **Add source** opposite it, then one card
  of source rows. The card ends with when the sources were last read, and the
  control that reads Anki again where one of them is kept up to date
  automatically; a source that is not answering replaces that line with what is
  wrong and **Try now**.
- **Grammar** — the reading level as a card naming the preset and, beside the
  name, the level its caption says it is taught at, with its description and
  example. The always-known forms stay a fold that names its current value.
  Register and wording were a second fold until
  [ADR 0064](0064-every-register-and-the-preset-wording.md) retired both.

### The ladder is a page, and choosing is a draft

`/reading-level/level` shows the ladder alone. A card opens its example when it
is chosen, and **Save level** commits the choice and returns to the overview,
where the confirmation is announced as before. This supersedes ADR 0049's
inline ladder: selecting there saved at once, so reading a harder example than
the current one to compare made every grammar analysis stale.

### The vocabulary list has columns

Word, difficulty, and when it was first studied are columns under a quiet
header, sized in `rem` and stacked by a container query when the list is too
narrow for them. A difficulty of half the scale or more takes the warning
colour.

### Add words docks on a phone

The sheet stays a native popover, so it survives the file chooser, but docks to
the bottom edge over a dimmed page on narrow screens, with Cancel.

## Consequences

- The design system names the pages composed like the Library, the new
  `.mn-card`, `.mn-icon-badge` and `.mn-home-palette` classes, the draft ladder,
  the list columns, and a third icon-only exception: the control that reads
  Anki again, on the line that says when it last did.
- The overview no longer states where the words came from in one line above the
  sources; the source rows say it one by one.
- Deep links to `#words`, `#grammar`, and `#forms` keep working; a link that
  meant the ladder now lands on the Grammar card that leads to it.
