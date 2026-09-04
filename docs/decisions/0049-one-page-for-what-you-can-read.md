# 0049 — Vocabulary and Grammar are one page: what you can read

Date: 2026-09-04
Status: Accepted

## Context

Monosai has three genuinely different nouns and, until now, showed one of them
plus a gear:

| Noun | What it is | Where it lived |
| --- | --- | --- |
| Your readings | the content | Library — visible |
| What you can read | words known, grammar level | inside Settings |
| Settings | keys, models, appearance, storage | the gear |

`/vocabulary` and `/grammar` were full top-level routes with substantial
content, reachable only from a panel inside Settings, the vocabulary sync
banner, the generate form, and the reader's aids panel. Nothing on the home
screen led to either. The one thing that makes Monosai different — that it knows
which words *you* know and writes to them — was filed under a gear.

The two pages were also a split down the wrong seam. Their controls do not
divide into "vocabulary" and "grammar". They divide into **the two facts a
learner checks** — how many words Monosai can write from, and how hard the
Japanese may be — and **the plumbing behind each**, which is set once and never
touched again: ports, deck and note-type and field mappings, package import,
register, custom prompt wording, always-known forms. Both pages gave the
plumbing equal billing with the fact, which is why both read as settings dumps.

## Decision

### One route, named after the outcome

`/reading-level`, titled **What you can read**. "Vocabulary" and "Grammar" name
the two mechanisms; this names the thing they jointly determine, and it is the
same phrase used wherever the standing is stated.

The page is ordered **two facts, then their plumbing**:

- A summary of both facts at the top — the word count with where it came from
  and how current it is, and the grammar preset with what it means. It is a
  summary and never a control.
- A **Words** section: adding a source, the source list with its per-source
  status and settings, package import, and the Anki failure surface.
- A **Grammar** section: the reading-level ladder inline, because it is a fact
  rather than plumbing, with register and wording and the always-known forms
  behind disclosures.

Every closed disclosure names its current value opposite its label. A
disclosure that hides the answer to the question it asks is worse than no
disclosure, and this is the design system's "state is shown, not narrated" doing
real work.

### The child components are recomposed, not rewritten

`mn-preset-picker`, `mn-guidance-section`, `mn-structural-baseline-section`,
`mn-provider-selection`, `mn-package-import`, and `mn-mapping-editor` keep their
behaviour, their tests, and their folders. Only the container and the headings
around them changed. The two page components and `mn-snapshot-history` — whose
one number is now the page's own summary — are deleted.

`features/vocabulary/` and `features/grammar/` therefore survive as folders of
components rather than as screens, which keeps the area names lining up across
`domain/`, `application/`, and `features/`. Only the container moved.

### The old routes redirect, carrying the intent

`/vocabulary` and `/grammar` remain as redirects to `/reading-level#words` and
`/reading-level#grammar`. Each inbound link keeps its specific destination: the
sync banner and the reader's aids panel mean the words, the generate form's two
rows mean each half in turn.

The fragment is load-bearing, so the redirect is a `RedirectFunction` rather
than a string — a string `redirectTo` cannot carry one — and it preserves the
query parameters that `from=generate` and the Android share marker travel in.
The page resolves the fragment itself once the language bundle has settled,
opening the disclosure the target sits inside before scrolling to it. Router
anchor scrolling alone would fire before the grammar half exists.

### Settings loses the learner

The "Your setup" panel and `mn-learning-data-section` are deleted. Settings is
configuration only: appearance, models, storage, app, diagnostics. Nothing there
describes the learner.

## Consequences

- The home screen can state the learner's standing in one line, because the
  wording is now shared: `shared-ui/vocabulary-standing/` holds the count, the
  source summary, the synced-day label, and the generation shortfall, and the
  Library, the sync banner, and this page all read them. Three screens
  describing one snapshot is how they start to disagree.
- The count is said as **words** everywhere it is shown. "Unique expressions" is
  what the snapshot builder counts, not what a learner has.
- `relativeDay` moved from `shared-ui/reading-summary/` to
  `domain/shared/locale.ts` as `formatRelativeDay`, because the design system
  puts every date format there and two screens now need this one.
- The merged page is longer than either half was. That cost is paid by the
  fragment handling; if a deep link ever lands at the top of it, the merge has
  regressed.
- This amends [ADR 0025](0025-reader-as-the-centre.md), which recorded
  Vocabulary and Grammar as two routes reached from Settings.

## Alternatives considered

**Keep two routes and link them from the Library.** Rejected: it fixes the
visibility problem and leaves the wrong seam in place. Two screens would still
each lead with plumbing, and a learner wanting to know what Monosai can write
for them would still have to visit both and add up the answer.

**Fold both into Settings.** Rejected for the same reason ADR 0025 rejected it:
the vocabulary half alone is six components with a mapping editor, and Settings
is where this content was invisible in the first place.

**Name the route `/learner` or `/profile`.** Rejected: both name the person
rather than the outcome, and neither can be said in the one line the Library
shows.
