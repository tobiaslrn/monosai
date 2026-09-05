# 0042 — Tabs tell each other about deleted readings, and format in one locale

Date: 2026-09-01
Status: Accepted

## Context

Monosai is local-first: the database is in the browser, and every open tab is a
peer with equal rights to it. There is no server to tell any of them anything.

Two consequences had gone unhandled.

**A deleted reading survived in the other tab.** With two tabs open and a
reading open in the second, deleting it from the first left the second
rendering it in full — heading, every token button live, cached translations
shown — with no notice and no error. It corrected itself only when navigated
away and back. Nothing crashed, and the reading itself was gone; what was wrong
was a live surface over rows that no longer existed, on the one application
shape where two tabs is a normal thing to have.

**Formatting spoke two languages at once.** Five places forced numbers to
English with `toLocaleString('en')`, while dates called `toLocaleString()` and
`toLocaleDateString()` with no argument and therefore followed the browser. On
a German browser the Vocabulary page showed `31.8.2026, 17:26:40` beside
`72 unique expressions`, and Add text offered a `50,000` character limit German
would write `50.000`. Two conventions, one screen, in an interface that only
exists in one language.

## Decision

### One locale, declared once

**Everything is formatted in `en`, explicitly.** `web/src/app/domain/shared/locale.ts`
holds `APP_LOCALE` and the four formatters every screen uses — counts,
count-with-noun, date, date and time, relative days — and nothing anywhere
calls a `toLocale*` method with no locale argument. The rule is written into
[the design system](../design-system.md) §8, which is the authority for
how a format is used in two places.

The alternative was to follow the browser for both. It was rejected because the
interface is English-only by deliberate scope: every label, every hint, and
every error is written once, in English, with no translation layer. A German
date beside an English sentence is not localization, it is one localized
fragment in an interface that is not. Forcing `en` makes the whole screen
consistent, and the day Monosai gains a language layer, this is the one
constant it has to reach.

### `BroadcastChannel`, with a `storage`-event fallback

**Tabs notify each other over a same-origin `BroadcastChannel`**, carrying a
small validated message — today only `reading-deleted`, with the id and the
title. Where the browser has no `BroadcastChannel`, the same port is satisfied
by writing and immediately removing one `localStorage` key, whose `storage`
event reaches every other tab and, by specification, never the writer. Where
neither exists the port is satisfied by an inert implementation: publishing
notifies nobody, and every tab remains correct on its own.

Dexie's `liveQuery` was the other candidate. It observes the database rather
than the application, which sounds stronger and is the reason it was not
chosen: it would put a standing observer on the reading table for every list
and every open reading, re-running queries on writes that no tab is showing —
including the enrichment jobs that update summary rows continuously. The
question here is not "what does the table contain now" but "what did another
tab just do", and that is a message, not a query. A message also carries the
title, which is what lets the receiving tab say something specific without a
read of a row that has been deleted.

Messages are validated on arrival like any external input: an unknown kind, a
non-UUID id, or a missing title is dropped rather than trusted. The sender is
same-origin, but it may be an older build or a partially written key.

### What each surface does with the news

- **The Library** re-reads its page, but only when the deleted reading was one
  it was showing, and announces the change in the live region it already has.
- **The reader** leaves. `OpenReadingWatcher` replaces the URL with the Library
  when the reading on screen is the one that was deleted. There is nothing
  honest left to render, and the reader's own not-found screen offers exactly
  one action — back to the library — so the tab takes it rather than staging
  it. The URL is replaced, not pushed, so Back does not lead to a reader for a
  reading that is gone.
- **Nothing else subscribes.** Creation and enrichment leave other tabs correct,
  only slightly behind, and a shelf that reorders itself under a learner who
  did not act is worse than one that is a minute old.

### A malformed link is not a deleted reading

Related, and settled here because it is the same question about honest
reporting: `#/reader/not-a-uuid` used to say "This reading is no longer here /
It may have been deleted". Reading ids are UUIDs by construction, so that
address never named a reading and nothing was ever there to delete. The reader
route now carries a `canMatch` guard for a well-formed id, and a malformed one
falls through to a screen that says the address is not one Monosai issues. It
is `canMatch` rather than a redirect so the learner keeps the address they
typed and the screen can be about it.

## Consequences

- Two tabs stay honest without polling, without a service worker, and without
  the database being observed.
- A learner reading in a second tab can be returned to the Library by an action
  taken elsewhere. That is the cost, and it is accepted: the alternative is a
  page about something that does not exist.
- The channel is best-effort. A browser with neither transport, or a blocked
  `localStorage`, degrades to the previous behaviour — the other tab corrects
  itself on its next navigation — and nothing throws.
- Formatting is testable without a host locale, and a regression to a
  browser-locale call is visible in review as a missing `APP_LOCALE`.
- No stored row changed shape, so no schema version was added.
