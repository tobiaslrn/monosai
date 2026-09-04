# 0050 — The Library wears the navigation, and states where the learner stands

Date: 2026-09-04
Status: Accepted

## Context

[ADR 0025](0025-reader-as-the-centre.md) deleted Monosai's navigation outright:
a sidebar and a bottom bar had listed six destinations of equal weight, which
said reading was one feature among several. Each page states its own way back
instead, and the Library carried a single gear to Settings.

That was right about the frame and wrong about the home screen. The Library
spent its full width on a wordmark and one icon, and the shelf beneath it was
the whole page. Two problems followed:

- **The learner profile had no way in.** After
  [ADR 0049](0049-one-page-for-what-you-can-read.md) merged Vocabulary and
  Grammar into `/reading-level`, that page was still reachable only from
  Settings, the sync banner, the generate form, and the reader's aids panel.
  Nothing on the screen a learner looks at most led to it.
- **The home screen said nothing about the learner.** Monosai's one genuinely
  distinctive fact — that it knows which words *you* have reviewed and writes to
  them — was invisible. `New reading` sat there as a bare verb, with nothing
  saying what it would write from.

## Decision

### The Library, and only the Library, carries a masthead

The `.library-head` element becomes navigation: the wordmark on the left, two
links on the right — **What you can read** and **Settings**. It is a `nav`
landmark, labelled, on the Library alone. The application shell is unchanged and
still holds a skip link, a `main`, and a router outlet; the reader and every
other page still state only their own way back.

The links are **text**. The design system permits a bare icon only where a
control is pressed repeatedly within a session, and neither of these is; the
gear that used to stand here is exactly the case the rule was written against,
since it hid the learner's own profile behind a symbol for configuration.

Two words are cheap. A persistent bar was not, which is why this is a masthead
on one screen rather than the bottom bar considered and rejected below.

### The Library states where the learner stands

Above the shelf, in the row that carries `New reading`:

> **You can read 340 words.**
> Starter forms · Anki, synced today

The whole line links to `/reading-level`. It makes `New reading` mean something
— a story from *these* words — and it is the one line no other Japanese reading
application could show.

Every state of the snapshot read fills the same two lines. A count below the
generation floor replaces the provenance with the floor, because where the words
came from does not help someone who cannot generate yet. A connected source with
nothing in it is not the same sentence as no source at all. A read that failed
says so and says nothing was changed. While the read has not answered, the block
holds its two lines of space and prints nothing: skeletons are ruled out, and
the alternative — a line that appears and pushes the shelf down — is the exact
shift the state rules forbid.

`Library` survives as the shelf's own heading, smaller than it was. It is no
longer the first thing the page says.

### Before there is anything to read, the Library introduces Monosai

An empty Library is what a stranger opening the public address sees. It now
says what Monosai is, in the first person, and offers two ways in — **Connect
your Anki** first, then **Paste Japanese text**. The empty state it replaced led
with pasting text, which sells the half of the application any dictionary site
can already do.

On that screen the masthead carries Settings alone, and neither the standing
line nor `New reading` renders: all three describe a shelf, and there is none.
The two cards are the way in. It ends the moment the library has a reading.

### The count comes from the cheap read

`VocabularyAvailabilityStore` already made one `getActiveSnapshot()` call to
answer the reader's question — is there a vocabulary, is it empty, could it not
be read — and threw the snapshot away. It now carries it, so the count, the
source kinds, and the sync day come out of that same read.

`SnapshotHistoryStore` is deliberately not used here: it additionally resolves
provenance and counts the stories built from each snapshot, which is a far
heavier read than a home screen should make on every visit.

## Consequences

- The Library is the only screen with a `nav` landmark. A test asserting that a
  page has none is asserting something true of every page except this one.
- Adding a third destination to the masthead is now cheap, which is the risk:
  the bar this replaced grew to six. Anything added here has to earn its place
  against the shelf it is standing on.
- The standing line depends on the grammar profile as well as the vocabulary, so
  the Library loads both stores. Both are single reads of already-open tables.
- At the narrowest supported width the wordmark hides, as it already did, and
  the two links stay.
- The first-run screen is the only standing prose in the application and the
  only first-person voice in it. Both are carved out in the design system's
  prose budget rather than left as a local exception.

## Alternatives considered

**A bottom or persistent navigation bar.** Rejected, again. Of the four
plausible entries, one would always be the current page, one duplicates the
`New reading` button, and one duplicates the masthead's own Settings link. A
permanent strip would also reappear on the reader, which is precisely what
ADR 0025 removed it for.

**Keep the gear and add a second icon.** Rejected: two unlabelled symbols where
one was already the wrong affordance. "What you can read" has no icon anyone
would read correctly, and inventing one would fail the same repetition test.

**Put the standing line inside the reading-level page only.** Rejected: that is
where it already was. The point is that it is visible without navigating.

**Make the standing line a page heading.** Rejected: it changes with the data,
and a document's title should not. It is a link to the page that owns it.
