# 0071 — A wide header is a site header

Date: 2026-09-11
Status: Accepted

Amends [ADR 0070](0070-home-library-and-settings-are-tabs.md): the wide tab-page header and Help's
label. The docked tab bar below `$wide` is unchanged.

## Context

ADR 0070 put the phone's three tabs at the end of the wide header unchanged, beside a Monosai mark
that was deliberately not a link, and kept Help as the one icon-only control there. In use the
header read as three problems:

- On the web the mark is how you go home. A mark that does nothing is a dead click, and a Home tab
  beside it names the same place twice.
- A bare `?` next to three labelled places read as a different kind of control, a tooltip rather
  than a page. Help is a place, and a place carries its label.
- The current tab wore the selection tint as a filled pill. At the top of a page that reads as a
  pressed button, and on Home it sat directly above the one filled primary, Write with AI.

## Decision

At and above `$wide` a tab page's bar is a site header:

- The Monosai mark and wordmark are one link, named **Home**, carrying `aria-current="page"` on
  Home. The visually hidden `h1` stays separate, so a page's heading is never a link elsewhere.
- The bar's end holds **Library**, **Settings** and **Help**, each an icon with a visible label.
  There is no Home item: one visible control per action.
- The current page takes the primary text colour and a short rule on the bar's lower edge beneath
  its icon and label. Nothing in the top bar is filled.

Below `$wide` the docked bar keeps Home, Library and Settings with the tint behind the current
icon, which is the platform's idiom for a bottom bar. Only Home's top bar shows the mark and
wordmark, as decoration, because the docked Home tab is the way home and a second link to the page
the learner is on would be a duplicate control. Help there is labelled too.

`mn-main-nav` still draws exactly one placement at a time. Its top placement leaves out Home and
adds Help, which takes the originating tab page from its host so Help's Back returns there.

## Consequences

- Help is no longer an exception to the icon-and-label rule; two exceptions remain.
- The wide header and the docked bar now list different items. They reach the same places; the
  mark is Home's door on a wide screen and the Home tab on a phone.
- The wordmark's tap-to-spin still works inside the link; on another tab page the same tap also
  goes Home.

## Alternatives considered

**Keep the Home tab and make the mark a link too.** Rejected: two visible controls for one action.

**Drop the Home tab but keep the mark decorative.** Rejected: the only way home would be one no one
expects.
