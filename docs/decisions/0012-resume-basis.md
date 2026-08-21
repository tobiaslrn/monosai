# 0012 — Resume basis: exact, nearest, or beginning, stated rather than hidden

Date: 2026-08-18
Status: Superseded by [0025](0025-reader-as-the-centre.md)

> Superseded on 2026-08-21. Monosai no longer records a reading position at
> all: the `readingProgress` table, `resolveResumeTarget`, and the three-state
> basis below were removed with Continue reading, and the reader opens every
> reading at its first paragraph. The reasoning is kept because the question it
> answered — what to tell a learner when a saved position no longer resolves
> exactly — returns unchanged if a reading position is ever reintroduced.

## Context

Imported readings in this milestone are immutable — there is no edit path that
changes sentence identities after saving — so in practice a saved
`ReadingProgress` always resolves to the sentence it names. The resume logic in
`reading-position.ts` is written for that not to matter: it resolves a saved
position through `locateSentence`, a bounded indexed lookup by
`positionInReading`, and compares what it finds against the saved
`sentenceId`/`paragraphId` rather than trusting the saved identity outright.

This is deliberate future-proofing, not speculative: later milestones
(generated readings with regeneration, or any future edit path) can change
what occupies a given position without this code needing to change, because it
already does not assume the saved sentence still exists. What it needed was a
policy for what to tell the learner when a resume does not resolve exactly.

## Decision

`resolveResumeTarget` returns one of three named outcomes:

- **`exact`** — the sentence located at the saved position is the same sentence
  and paragraph the progress record named. This is what an imported reading
  always produces today.
- **`nearest`** — something survives at the saved position, but it is not the
  sentence identity that was saved. The reader resumes there anyway and states
  it: "The sentence you stopped at has changed, so reading resumed at the
  nearest one."
- **`beginning`** — there is no saved progress, or nothing resolves at the
  saved position at all. The reader starts at the first sentence with no
  claim of resuming anything.

The reader states `nearest` to the learner rather than silently presenting an
approximate resume as if it were exact. An approximate resume that looks
identical to an exact one is a small trust cost paid every time it happens
silently; a stated approximation is paid once, visibly, and only when it is
true.

## Consequences

- `ReaderStore.open` always resolves through `locateSentence`, even though
  every path exercised by this milestone produces `exact`. The cost is one
  bounded indexed lookup per open; the benefit is that `nearest` and
  `beginning` are already correct, tested (`reading-position.spec.ts`,
  `reader.store.spec.ts`), and rendered (the reader page's `nearest` notice)
  before any feature that can actually produce them exists.
- A future milestone that lets sentence identity change after saving needs no
  change to this resolution logic — only a new way to reach the `nearest`
  branch that already exists.
- `ReadingProgress` is never trusted as a pointer to render from directly; it
  is always re-resolved to what is actually there, which is also what makes
  `resolveContinueReading`'s self-repair after a deletion (0001-era
  requirement, re-verified for readings in this milestone) safe without a
  separate repair pass.

## Alternatives considered

**Trust the saved sentence/paragraph identity outright and skip the lookup.**
Rejected: correct only as long as nothing can ever change a sentence's
identity after saving. That is true today and was the easy path, but it
defers the harder problem to whichever future milestone introduces the first
edit path, at which point the resume logic and its tests would need to be
written from scratch under time pressure instead of already existing.

**Only two states — resumed or not.** Rejected: collapsing `exact` and
`nearest` into one "resumed" state is what would have hidden the approximation
from the learner. The specification's requirement is that an approximate
resume be stated, not merely that resuming work at all.
