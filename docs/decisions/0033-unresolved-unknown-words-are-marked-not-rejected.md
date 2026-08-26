# 0033 — A word repair could not replace is marked, not a reason to throw the story away

Date: 2026-08-26
Status: Accepted

## Context

Generation validated every word of a candidate story against the reviewed
vocabulary, spent at most two repairs on the words that did not pass, and then,
if any word still did not pass, ended in `invalid-draft`: the whole story was
discarded and nothing was written. The rule was enforced twice on purpose — the
generation state machine refused the draft, and `repositories/integrity.ts`
refused it again at the transaction — so that "no unknown-containing result can
enter the library" held as an invariant rather than as a promise.

That invariant was written before the reader marked unknown words. It now does:
`presentStatus` gives an unknown token the `warning-vocabulary` marker, the
reader underlines it, the sentence card lists it, and word details name why it
is not covered. The evidence a learner needs about a word beyond their
vocabulary is on the page, at the word.

Against that, discarding the story costs the learner everything the run
produced — the whole story, its grammar review, and its translations — over one
word they can now see for themselves. Two repairs failing on a word is usually a
word the model needs and the vocabulary does not have, not a sign the story is
unusable.

## Decision

Unresolved unknown words no longer keep a generated story out of the library.

- The validation loop still spends its full repair budget on unknown words. When
  the budget runs out with words still unknown, the story is finalized and saved
  rather than rejected.
- Those words are re-labelled `unknown` with reason `unresolved-after-repair`,
  which distinguishes them from a word that was merely never looked at and
  records in the saved story that repair was spent and lost.
- `invalid-draft` survives for structural failure only — a story whose sentence
  count or indexes the repairs never fixed is still not saved, because its shape
  is not what was asked for and no marker in the reader can express that.
- The storage-level check keeps refusing the imported-only `not-in-snapshot`
  category, which would make a frozen validation defer to the current
  vocabulary, and no longer refuses `unknown`. It is renamed
  `assertNoSnapshotDependentValidation` to say what it now guards.
- Nothing on the saved panel warns about those words. The reader marks them, and
  saying it twice would make an ordinary outcome read as a problem.

## Consequences

- A generated story can contain marked words. `FrozenSentenceValidation` says
  so, and `isAcceptedCategory` — a helper that encoded the old invariant and had
  no callers left — is gone. The reasoning recorded in
  [0015](0015-structural-baseline-stays-curated.md) that a mis-classified word
  would make a generated story silently acceptable still stands for
  classification accuracy; it no longer decides whether a story is saved.
- `validationOutcome` is unchanged: `strict` and `exception` describe whether
  the exception policy was used, not whether every word was covered.
- The learner keeps the grammar review and translations of a story that would
  previously have been thrown away, and decides for themselves whether a word
  they have not reviewed is worth reading around.
