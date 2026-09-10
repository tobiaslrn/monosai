# 0068 — One non-reader frame and page header

Date: 2026-09-10
Status: Accepted

Supersedes the header exceptions in [ADR 0050](0050-the-library-wears-the-navigation.md)
and [ADR 0063](0063-what-you-can-read-is-composed-like-the-library.md). Those records
remain the history of why the Library and learner-profile pages once carried their own
chrome; this record defines the shared frame they now use.

## Context

The application had two non-reader compositions. Settings, Help, Add text, and Generate
used the shell utility bar and a shared page header, while the Library and the pages below
What you can read hid that bar and built their own identity or Help controls. Their page
columns also narrowed themselves independently, so a learner moving between screens saw
the left edge move even when the content belonged to the same application.

The split made common destinations harder to find and gave the application more than one
header pattern to maintain. The reader remains a separate surface: its Japanese text and
sticky controls are not part of the non-reader shell.

## Decision

Every non-reader route renders the same application bar from `core/layout/`. It contains
the Monosai mark and wordmark, with the wordmark hidden at the narrow breakpoint, and the
free icon utilities for Settings, Help, and GitHub. The Library may add its reserved Search
button to that same row. The reader is the only route without the application bar.

Every non-reader page uses the shared page frame and `mn-page-header` below the bar. The
header contains Back when the page has a parent destination, one page title using the shared
`--text-page-title` token, and an optional trailing element. Help is a shell utility, not a second
page-header exception. The Library is the home destination, so its header has no Back
control; its image-led hero follows it.

The application bar and every non-reader page use the `--page-measure` token. Local page
max-width overrides are not used for the frame. The reader keeps `--reader-measure` and its
own sticky header; its opaque background, rather than a theme-specific shadow, protects the
reading surface beneath it.

## Consequences

- Settings and the learner-profile pages keep their own Back destinations, but no longer
  hide the shared utility bar or render Help in their title row.
- The Library keeps its hero, standing line, shelf, illustration, and Search affordance,
  but its private identity row is gone.
- A shared page edge makes utility and content alignment predictable on desktop while the
  same touch targets and narrow wordmark rule remain in force on phones.
- The reader remains a deliberate shell boundary and does not inherit non-reader navigation.
