# 0069 — One top bar per screen

Date: 2026-09-11
Status: Accepted

Supersedes the application bar in [ADR 0068](0068-one-non-reader-frame-and-page-header.md).
Its shared page frame, `--page-measure`, and `mn-page-header` stand.

## Context

ADR 0068 gave every non-reader route the same application bar — mark, wordmark, Settings,
Help, GitHub — with each page's own `mn-page-header` below it. On a phone that stacked two
bars: the utilities first, then Back and the title. The way back, which mobile platforms put
in the top-left corner, sat second; the first hundred pixels of every screen repeated
destinations the learner had just come from; and the reader, which has only its own bar,
looked like a different application from the pages around it.

A bottom navigation bar was considered instead. Monosai has one home — the Library — with
the reader beneath it and a handful of pages visited rarely. Bottom navigation is for three
to five peers moved between constantly, and a permanent bar would take the bottom edge the
reader already gives to the docked audio player and the word and sentence sheets.

## Decision

Every screen has exactly one bar. For non-reader routes it is `mn-page-header`, which now
sticks to the top of the viewport on an opaque, full-width canvas ground whose hairline lower
edge fades in once content passes beneath it. A page with a parent leads with Back; the
Library leads with the Monosai mark and ends with the utilities — Search, Help, Settings — in
a labelled navigation landmark. Help ends its own bar with the GitHub link. The shell renders
no bar of its own, and the `app-bar` component is removed.

The reader keeps its own sticky bar, drawn in the same shape: the same height, title token,
glyph alignment, and fading lower edge.

## Consequences

- Back is the first control on every page below the Library, and no page pays for a second
  row of chrome.
- Settings and Help are one tap from the Library and one Back from anywhere else, rather than
  one tap from everywhere. That trade is deliberate: both are visited rarely.
- The page title token is sized for a bar rather than a headline, and the reader's title uses
  the same token.
- A future top-level destination that is visited constantly would reopen the bottom
  navigation question; a rarely visited one joins the Library's utilities.
