# 0009 — Language protocol version 2 and `analyze-sentences`

Date: 2026-08-18
Status: Accepted

## Context

Milestone 3 lets a learner split or merge the sentence boundaries the tokenizer
produced during import review before saving. The only tokenization operation
the worker protocol offered was `analyze`, which takes raw text and decides its
own sentence boundaries as part of producing tokens.

Sending the reviewed text back through `analyze` would re-segment it. Whatever
the learner corrected — a run-on split, two fragments merged — would be silently
undone the moment tokenization ran, because `analyze` has no way to be told
"these are the sentences; tokenize exactly these." The reader would then show
token spans for a different sentence structure than the one the learner
approved and the reading was saved with.

A second option was to keep `analyze`'s paragraph-level segmentation and instead
diff its output against the reviewed structure, reassembling token spans across
the boundary edits. This was rejected: the tokenizer's spans are UTF-16 offsets
into its own segmentation, and mapping them across an arbitrary split/merge edit
means re-deriving which tokens fall on which side of a new boundary, including
the punctuation-attachment and trailing-space rules `segmentation.ts` already
encodes once. It reimplements the tokenizer's own boundary logic in the caller
to work around not being able to state boundaries as input.

## Decision

Add `analyze-sentences` as a new worker operation that takes an array of
already-decided sentence texts and tokenizes each independently, returning one
`AnalyzedSentence` per input in the same order. It never re-segments: what is
sent is what is tokenized.

The request and response shapes changed, so `LANGUAGE_PROTOCOL_VERSION` moves
from 1 to 2. A client and worker that disagree on this number refuse to talk
rather than guessing — the existing protocol-version mismatch handling in
`language-worker-host.ts` covers the new operation for free, which matters
because a service-worker update can leave an old worker script cached
independently of the page that loads it.

**The caller chunks across requests; the worker still yields within one.**
`TextImportService.analyzeSentences` batches the reviewed sentences at
`ANALYSIS_BATCH_SIZE = 120` per worker call, reporting progress and checking the
abort signal between batches. Inside one call, `analyzeSentences` reuses the
same `tokenizeSegments` path `analyze` uses, so it still yields to the event
loop between token chunks and answers a cancel promptly — no new yielding
mechanism was needed. What `analyze-sentences` deliberately does not add is a
second, worker-side notion of request granularity: the caller already owns
that decision (how much of the reviewed text is in flight at once), and a
review batch is bounded by what a human already looked at, at most the
sentences of one import, not by the 50,000-character worst case `analyze` has
to survive on its own.

## Consequences

- The reader replays exactly the sentence boundaries the learner approved.
  `paragraph-window.spec.ts` and the reader's own paragraph assembly rely on
  positions being stable, which they would not be if tokenization could shift
  a boundary.
- `FakeLanguageRuntime.analyzeSentences` and the golden corpus needed no new
  segmentation logic: tokenizing an already-split sentence is exactly what
  `analyze` did for one sentence's worth of text, so the new operation reuses
  the same per-sentence tokenization path the worker already had.
- A future caller that wants worker-side progress reporting for a different
  batch shape (for example, background re-tokenization after a dictionary
  update) will need its own chunking decision; this one is scoped to review
  batches.

## Alternatives considered

**Add a `boundaries` parameter to `analyze`.** Rejected: it keeps one operation
answering two different questions ("where are the sentences" and "tokenize
these sentences"), and every caller of the existing paragraph-level `analyze`
path would need to thread through an unused `undefined` to keep meaning "decide
for me."

**Diff-based span remapping.** Rejected above; recorded here because it was the
serious alternative to a new operation, not a mechanical one to file away.
