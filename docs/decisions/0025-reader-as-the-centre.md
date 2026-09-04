# 0025 — The reader is the centre: no navigation, no reading position, one place for audio

Date: 2026-08-21
Status: Accepted

## Context

Monosai is a reading application whose AI features are extras. The interface
built through Milestones 1–8 said the opposite, in three independent ways.

**Navigation stated six equal destinations.** A sidebar on desktop and a bottom
bar plus a More sheet on mobile listed Library, Add text, Generate, Vocabulary,
Grammar, and Settings as unlabelled icons of equal weight. Reading was one of
six. The reader's `chrome: 'focused'` only hid the bottom bar, so on desktop the
sidebar still stood beside the text and pushed the reading column off centre.

**Audio was spread across three places.** Generation started in the overflow
menu, progress appeared as a hairline in the header, and a player docked at the
bottom only once every clip existed. Before that there was nothing anywhere
saying the application could read aloud at all — the one capability a learner
would have to already know about to ever find.

**Reading progress cost more than it paid.** A `readingProgress` table, a
debounced write per scrolled sentence, a three-state resume resolution
(ADR 0012), a Continue reading hero card duplicating a reading already visible
in the shelf below it, and a notice at the top of any reading that resumed
approximately. Monosai's readings are short — a micro story is four sentences, a
short story twenty — and they are read in one sitting. The machinery existed to
solve a problem the content shape does not have.

Each was defensible alone. Together they made the reading one feature among
several rather than the thing the application is.

## Decision

### The application frame carries no navigation

`AppShellComponent` is a skip link, a `<main>` landmark, and a router outlet.
The sidebar, bottom bar, More sheet, the navigation item registry, and the
route-chrome mechanism are deleted outright — with no chrome to hide, a route
has nothing to declare.

Each page states its own way back through a shared `mn-page-header`: a back
link, the title, and a slot for whatever trailing control the page owns. The
Library is the root and has no back link; it carries a gear to Settings.
Vocabulary and Grammar keep their routes but are reached from Settings, as two
rows that each state their current condition in one line.

*(Amended by [ADR 0049](0049-one-page-for-what-you-can-read.md): Vocabulary and
Grammar are now one route, `/reading-level`, reached from the Library rather
than from Settings, and Settings no longer describes the learner at all. What
this decision was about — that the frame carries no navigation and each page
states its own way back — is unchanged, and one route replacing two is one
destination fewer.)*

Adding a reading is one **New reading** button that opens a chooser with
**Paste text** and **Write with AI**. Generating becomes structurally a branch
of adding rather than a destination competing with reading.

The root route always resolves to the Library. The first-use branch to Add text
is gone: an empty library says so in one line and offers the same button.

### There is no reading position

`ReadingProgress`, `ContinueReadingTarget`, the `readingProgress` table, the
resume resolution, `locateSentence`, and the repository methods that served
them are removed. The reader opens every reading at its first paragraph. The
paragraph window's anchor becomes zero; extending it downward — and back up
after a forward extension has trimmed the top — is unchanged.

`lastOpenedAt` survives on the `readings` row as ordering metadata.

This supersedes ADR 0012, whose three-state resume basis no longer has anything
to resolve.

### Audio has exactly one place

The reader header carries an Audio button **at all times**, whether or not the
reading has audio, and its accessible name and appearance state the current
condition. It opens a panel — anchored on desktop, docked as a sheet on a
phone, on the same floating surface as the reader's other popovers (ADR 0022).

That panel owns every audio state: the offer to generate, the progress of a
run, its failures and their recovery, and the transport once a complete set
exists. `audio-progress.component.ts` is deleted, the docked footer and the
compact header strip are deleted, and the three audio entries leave the
overflow menu.

The complete-set gate of ADR 0024 is unchanged: an incomplete set still yields
no transport. What changes is that its absence is now explained inside the
panel rather than by a control silently not existing.

*(Superseded by [ADR 0034](0034-progressive-four-way-audio.md): a partial set
now yields a transport for as far as it goes, with the run that is filling in
the rest reported beneath it in the same panel. The panel still owns every audio
state, which is what this decision was about.)*

### The words are labels

Reader popovers, the aids panel, and the overflow menu carry labels and results,
not prose. That an AI action sends the sentence to the learner's own model is
stated once, in Settings, rather than under every button that could trigger one.

## Consequences

- One bounded query still renders the library, because the card's Japanese excerpt is denormalized onto the `readings` row rather than loaded from sentences.
- Deleting a reading has one fewer owned store to clear, and `OWNED_READING_STORES` is the single list that keeps that checkable.
- `ViewportService.isSidebarCompact` and the 1120px breakpoint it depended on are gone; the desktop breakpoint now only decides whether a floating surface anchors or docks.
- A learner who leaves a long reading loses their place. Accepted deliberately for the content Monosai produces; if long imports become the common case, the answer is to reintroduce a position for those, not to restore the whole apparatus.
- The audio panel's state is invisible while it is closed, so the header button has to carry it. That is why the button's name and appearance are part of this decision rather than presentation detail.

## Alternatives considered

**Keep a reduced navigation — Library and Settings only, as a bar.** Rejected:
a two-item bar is still a permanent strip on every screen including the reader,
and the reader is exactly where nothing but Japanese belongs. A back link per
page costs nothing at rest.

**Keep Continue reading but drop the position, pointing at the last opened
reading.** Rejected: that is a card showing a reading that is already first in
the shelf directly beneath it. Duplicating a row is not a feature.

**Put the audio panel in the overflow menu with the other whole-reading
actions.** Rejected: it is where audio already lived and where nobody found it.
An always-present button is the whole point — the panel is worth building only
because something visible opens it.

**Fold Vocabulary and Grammar into the Settings page itself.** Rejected: the
vocabulary feature alone is seven components with a stepper and a mapping
editor. Embedding them would trade a navigation problem for an oversized
component.
