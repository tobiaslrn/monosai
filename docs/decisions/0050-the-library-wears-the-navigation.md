# 0050 — The Library states where the learner stands, and that line is the way in

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
  them — was invisible. `New story` sat there as a bare verb, with nothing
  saying what it would write from.

## Decision

### The masthead carries the wordmark and one labelled control

`.library-head` is the wordmark on the left and **Settings** on the right, as an
icon with its label rather than a bare gear: the design system grants silence
only to controls pressed repeatedly within a session, and Settings is not one.
The application shell is unchanged and still holds a skip link, a `main`, and a
router outlet; the reader and every other page still state only their own way
back.

An earlier draft of this decision put a second link here — **What you can read**
— beside Settings. Built, it read as a stray caption rather than navigation, for
three reasons worth recording so it is not tried again:

- **It repeated the line beneath it.** "What you can read" sat forty pixels
  above "You can read 340 words…". The same words, twice, in one glance.
- **It was styled as prose.** Secondary text at the hint size with no boundary
  and no affordance is indistinguishable from a caption.
- **It was lopsided.** A four-word phrase beside a one-word noun does not read
  as a pair of peers, and the right edge looked unbalanced against the mark.

The fix was not styling. The standing line is already a link to that page and is
a better door, because it says why anyone would go.

### The Library states where the learner stands

Above the shelf, and above the row that carries `New story`:

> **You can read 340 words at a starter level.**
> From Anki · synced today

The whole line links to `/reading-level`, and carries a chevron so that a
sentence which reads as a statement still says it goes somewhere. It makes
`New story` mean something — a story from *these* words — and it is the one line
no other Japanese reading application could show.

The count and the level are one clause, not two facts stapled together: from
the learner's side they are the same fact — how hard a story Monosai can write
for them. The level is said in plain words derived from the preset's own name,
so there is no second difficulty vocabulary to drift from the first, and still
no JLPT band in it. A bundle that has not loaded drops the clause rather than
holding the count back or guessing.

Every state of the snapshot read fills the same two lines. A count below the
generation floor replaces the provenance with the floor, because where the words
came from does not help someone who cannot generate yet. A connected source with
nothing in it is not the same sentence as no source at all. A read that failed
says so and says nothing was changed. While the read has not answered, the block
holds its two lines of space and prints nothing: skeletons are ruled out, and
the alternative — a line that appears and pushes the shelf down — is the exact
shift the state rules forbid.

`Library` survives as the shelf's own heading, smaller than it was, and
`New story` sits beside it rather than beside the standing line: the action
belongs with the shelf it adds to. Neither is the first thing the page says any
more.

### Settings signposts the page without holding it

Settings keeps no learner data — [ADR 0049](0049-one-page-for-what-you-can-read.md)
deleted that panel — but it does carry one row pointing at `/reading-level`,
stating the current count and level in a line. Connecting an external
application is something people come to Settings looking for, and finding
nothing there would say it cannot be done.

That is not the defect ADR 0049 named. Its complaint was that Settings was the
*only* way in; a signpost, when the primary door is on the home screen, is
ordinary redundancy.

### Before there is anything to read, the Library introduces Monosai

An empty Library is what a stranger opening the public address sees. It now
says what Monosai is, in the first person, and offers two ways in — **Connect
your Anki** first, then **Paste Japanese text**. The empty state it replaced led
with pasting text, which sells the half of the application any dictionary site
can already do.

On that screen the masthead carries Settings alone, and neither the standing
line nor `New story` renders: all three describe a shelf, and there is none.
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

- No screen gains a `nav` landmark; ADR 0025's rule that the frame carries no
  navigation survives intact, which the first draft of this decision did not.
- The standing line is now load-bearing: it is the Library's only way to
  `/reading-level`. If it is ever hidden or demoted, that page needs another
  door before it goes.
- The standing line depends on the grammar profile as well as the vocabulary, so
  both the Library and the Settings row load both stores. All four are single
  reads of already-open tables.
- At the narrowest supported width the wordmark hides, as it already did, and
  Settings keeps its label.
- The first-run screen is the only standing prose in the application and the
  only first-person voice in it. Both are carved out in the design system's
  prose budget rather than left as a local exception.

## Alternatives considered

**A bottom or persistent navigation bar.** Rejected, again. Of the four
plausible entries, one would always be the current page, one duplicates the
`New story` button, and one duplicates the masthead's own Settings link. A
permanent strip would also reappear on the reader, which is precisely what
ADR 0025 removed it for.

**Keep the gear and add a second icon.** Rejected: two unlabelled symbols where
one was already the wrong affordance. "What you can read" has no icon anyone
would read correctly, and inventing one would fail the same repetition test.

**Put the standing line in a bordered card so it plainly reads as pressable.**
Built and rejected. The card shrink-wraps to its text, so it reads as an
oddly-sized chip rather than the screen's lead, and it competes with `New story`
— two boxed things on one row, where at most one control on a surface is filled.
A full-width card instead would put a slab across the top of a screen whose
character is that it has none.

**Put the standing line inside the reading-level page only.** Rejected: that is
where it already was. The point is that it is visible without navigating.

**Make the standing line a page heading.** Rejected: it changes with the data,
and a document's title should not. It is a link to the page that owns it.
