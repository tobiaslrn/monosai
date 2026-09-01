# 0011 — Paragraph window bound, radius, step, and moving rather than growing

Date: 2026-08-18
Status: Accepted

## Context

A 50,000-character import can be thousands of sentences and tens of thousands
of token buttons. The reader has to meet a performance and reflow requirement
for long readings, which mounting the
whole document at once cannot do: every aid toggle (furigana, spacing, status
markers) re-renders every mounted token, so the render cost has to be bounded
by what is actually near the viewport, not by reading length.

`paragraph-window.ts` needed three numbers and one behavioral choice:

- how many paragraphs to mount around the anchor when a reading first opens
  (`WINDOW_RADIUS`),
- how many to add when the learner scrolls past an edge (`WINDOW_STEP`),
- a hard ceiling on paragraphs mounted at once (`MAXIMUM_MOUNTED_PARAGRAPHS`),
  and
- whether growing the window without limit is ever acceptable, versus trimming
  the far side once the ceiling is reached.

## Decision

`WINDOW_RADIUS = 3`, `WINDOW_STEP = 3`, `MAXIMUM_MOUNTED_PARAGRAPHS = 15`. A
reading opens with up to `2 × radius + 1 = 7` paragraphs mounted, centred on the
anchor. Since ADR 0025 removed the reading position the anchor is always the
first paragraph, so `windowAround` clamps at the start and an opening reading
mounts 4. Reaching
either edge mounts `step` more paragraphs on that side; once the window would
exceed the maximum, `extendWindow` trims the far side by the same amount it
grew, so the window **moves** rather than accumulating. This was measured at
the real 50,000-character import budget in `e2e/reading-performance.spec.ts`:
opening the fixture mounts 4 paragraphs (`windowAround` clamps the radius at
the very first paragraph, where there is nothing to show on the near side), and
scrolling to the end of a 200-paragraph reading never exceeds 15 mounted at
once. The figures were measured while this decision was taken.

The three numbers are deliberately small relative to the ceiling: a radius and
step of 3 mean the window changes in small increments, so an `IntersectionObserver`
firing once near an edge does not itself cause a large single re-render, and the
15-paragraph ceiling is five such increments, giving room for a few scroll
events to be in flight without visibly stalling before the next extension
lands.

**Moving instead of growing was the one non-negotiable part of this decision.**
A ceiling without trimming would just delay the unbounded-render problem until
the learner had scrolled far enough, which for a 50,000-character reading is
well within a single sitting. Trimming the far side is what keeps the bound
true for the entire length of any reading, not just its first screen.

## Consequences

- `ReaderStore.extend` and the reader page's edge `IntersectionObserver`s never
  need to know the ceiling exists; `extendWindow` enforces it and returns the
  unchanged window when there is nothing left to mount, which is what lets
  `hasMoreAbove`/`hasMoreBelow` decide whether to render a sentinel at all.
- Removing paragraphs from the scrolled-past side changes total document
  height while the learner is mid-scroll. This is visible only as the
  scrollbar thumb's position no longer tracking a fixed fraction of "the whole
  reading" once the window is saturated; nothing jumps the visible content
  itself, because the trimmed paragraphs are always the ones already scrolled
  past.
- `paragraph-window.spec.ts` covers the pure functions exhaustively;
  `reader.store.spec.ts` covers extension through the store, including that a
  concurrent extend call while one is already loading is a no-op; and
  `reading-performance.spec.ts` covers it end-to-end at the real budget,
  closing the milestone's outstanding windowing-test gap.

## Alternatives considered

**A larger fixed window with no trimming, sized for the common case.** Rejected:
"common case" is exactly what the specification's 50,000-character budget
exists to not assume. Any fixed untrimmed window is unbounded relative to
reading length, just with a larger constant before the problem appears.

**Virtualizing at the sentence or token level instead of the paragraph.**
Rejected: paragraphs are already the reader's rendering unit
(`ReaderParagraphComponent`) and the repository's storage/query unit
(`ParagraphWindow`, `countParagraphs`, the `[readingId+position]` index).
Windowing at a finer grain would need a second, unrelated notion of "visible
range" inside a mounted paragraph for a benefit this milestone's measurements
did not show was needed — a mounted paragraph is at most a few sentences.
