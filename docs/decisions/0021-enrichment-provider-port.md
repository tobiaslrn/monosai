# 0021 — One batched translate, and separating producing records from storing them

Date: 2026-08-20
Status: Accepted

## Context

Milestone 8A adds grammar review and translation to a provider port that until
now only generated, repaired, and reviewed stories. Three callers want a
translation:

- the generated-story pipeline, translating a whole accepted story;
- the reader, translating one imported sentence a learner asked about (8B);
- the whole-reading job, translating everything a reading is missing.

Two shapes were available. A per-sentence `translate(sentence)` reads naturally
for the reader and forces the other two callers to fan out one request per
sentence, which the specification explicitly rules out — §9 requires bounded
batches with order preserved through stable ids. A batched
`translate(sentences)` reads slightly heavier for the reader and serves all
three.

The second question was where a produced record gets written. The generated path
must not persist anything before finalization: §10 makes the whole story one
atomic save, and §8 makes cancellation before `finalizing` save nothing —
including a translation that already came back successfully. The other two paths
must persist immediately, because their work is not part of any larger
transaction and a job that reported progress its rows did not support would lie
after a reload.

## Decision

**One batched `translate(request: TranslationBatchRequest)` on
`TextGenerationProvider`.** A single imported sentence is a batch of one. The
batch bound is one domain constant, `MAX_TRANSLATION_BATCH = 10`, and
`planBatches` is the only thing that applies it. Completeness validation
(`matchTranslations`) rejects extra, missing, duplicate, and blank entries for
the whole batch rather than accepting the rest.

Grammar review takes the same shape for the same reason, minus the bound: the
domain contracts set no batching limit on review, and a generated story is
reviewed in one request.

**The shared enrichment services separate `run` from `store`.**
`TranslationService.run` and `GrammarAnalysisService.run` produce validated
records and never touch the repository. `store` writes one record and refreshes
the owning reading's summary in the same transaction. The generated path calls
`run` only, and its records reach disk exclusively inside
`saveGeneratedStory`'s single transaction; the whole-reading job and the
imported per-sentence path call `run` then `store`.

## Consequences

A cancelled generation *cannot* have left a translation row behind — not because
every future caller remembers not to write one, but because the method that
would write it is not on the path the generated pipeline takes. The invariant is
structural rather than a rule to be observed.

`store` takes the caller's current cache keys per sentence
(`ReadonlyMap<SentenceId, string>`). That is the only way the repository learns
what "current" means without reaching into settings, and it lets the summary
refresh happen inside the same `rw` transaction as the write. It also fixes what
the Milestone 1 repository got wrong: it compared a config fingerprint against a
model id, and counted every row for the reading, so output from a model no
longer configured inflated current completeness.

The reader's single-sentence call carries a one-element array and reads a
one-element result. That is the cost of not maintaining two provider methods,
two prompts, two schemas, and two validation paths for the same task.
