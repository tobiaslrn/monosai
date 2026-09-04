# 0047 — A reading declares what it should have

Date: 2026-09-03
Status: Accepted; reader interaction refined by ADR 0053 and grammar execution refined by ADR 0052

## Context

A reading has four content levels: Japanese, English, grammar notes, and audio. The three derived
ones are per-sentence, content-addressed by cache key, independently committable, idempotent,
resumable, and already summarized on the reading row. They differ only in the function that
produces them.

They did not behave alike. English had an in-generation producer, a whole-reading job, and a
reader-driven one; grammar had no whole-reading job; audio had no in-generation producer. Five of
nine cells were filled with no rule saying why. The consequences were concrete: generation blocked
its single save on two batched provider stages, audio could never be prepared alongside a story,
and whole-reading grammar could not be requested for an imported reading at all.

Nothing in the model could answer "is this reading ready to listen to yet". Completion summaries
answer a different question — how much exists under *today's* configuration — and they zero out
when the learner picks a different model.

## Decision

A reading declares the aid layers it should eventually contain. `Reading.preparationTargets` is
that declaration, persisted on the reading row, and it is the answer to readiness.

- Targets declare; jobs schedule. `preparationTargets` says what should exist. `assetJobs` rows are
  the work list. A job row is created only at a named moment, never by drift between a target and
  a summary.
- The reconciliation moments are exactly four: a target is switched on, a generated story is saved
  with the targets chosen for it, a reader is opened, and an explicit *Prepare now*, *Retry*, or
  *Prepare again*. Application startup, a configuration change, a failed layer, and summary drift
  create no work.
- A target is satisfied by an aid stored under **any** configuration. Changing the text model must
  not re-prepare the library.
- Defaults are English on, grammar on, audio off, held device-wide in generation settings and
  captured by each generation when it starts. They match what generation produced before this
  decision.
- Targets are mutable after a reading is saved. Provenance therefore describes the targets at
  generation time and never claims to describe the reading's current declaration.

Two predicates, deliberately named apart, sit in `domain/enrichment/preparation.ts`:

- `missingLayers(reading)` is targets minus summaries, and drives readiness shown to a learner.
- `schedulable(rows)` is the non-terminal job rows in `PREPARATION_ORDER`, and drives the lane.
  It is never derived from summaries: targets-versus-summaries cannot see a failed layer, so a lane
  driven by it would pick the same reading forever.

Grammar is not symmetric with the other two. `GrammarSummary` is a four-state union with no total
and no failure count, so a targeted grammar layer counts as missing while its state is
`not-requested` or `partial`, and per-sentence lane progress comes from the job row rather than
from the summary. No new summary shape is introduced for it.

### Satisfaction under any configuration

Completion summaries count rows under the caller's current cache keys, which is the right question
for *Prepare again* and the wrong one for deciding whether to spend money. Three repository queries
answer the second question instead — `listSentenceIdsWithStoredTranslation`,
`listSentenceIdsWithStoredGrammarAnalysis`, and `listSentenceIdsWithStoredAudio` — each reading
through the `sentenceId` index only, so asking about audio never deserializes a clip.

`sentencesWithoutStoredAid` turns those answers into work. It takes the sentences that own a row
and the per-sentence cache keys under any one configuration, and treats two sentences that share a
key as covered by one row. Both simpler rules are wrong in opposite directions. Asking by sentence
id alone would report a repeated sentence unprepared forever, because a repeat is stored once under
whichever twin was written last, and every reconciliation would re-prepare the pair. Asking by
content hash alone would call a sentence prepared when its neighbours differ from its twin's, which
gives it a different key and a genuine need for its own row.

### Storage

Dexie version 8 adds `preparationTargets` to every reading row. The store strings are unchanged;
this is the first upgrade in the schema history that walks `readings` rather than `settings`, so it
is argued on its own terms. The backfill reads what a reading already has:

- English when the translation summary records any completion.
- Grammar when its state is `complete` or `partial`.
- Audio when the audio summary records any completion.
- Nothing at all for a reading with no sentences.

`unavailable` grammar backfills to *not targeted* on purpose. Grammar was attempted and failed, and
re-targeting it during an upgrade would restart spend nobody asked for.

## Consequences

- Readiness is answerable: a reading whose targets include audio and whose audio is complete is
  ready to listen to.
- A learner selects targets on the generate form for a story about to be written. An existing
  reading instead shows saved-content status and explicit preparation actions in Story options.
  Stopping a layer withdraws its outstanding declaration so reopening does not restart it.
  The library row keeps
  its short list of actions and does not carry the switches; the shelf is for choosing what to
  read, not for configuring each row.
- Changing the text model creates no work. The reading's stored aids still satisfy its targets;
  the reader continues to show a stale-but-present aid, flagged stale, as it already did.
- A failed layer stays visible as a failed job row instead of dissolving into a summary that looks
  the same as never having been asked.
- Audio can be declared for a reading before any voice work happens, and the switch says which
  voice-configuration state prevents it rather than offering one piece of setup advice that is
  wrong three times out of four.
- This record establishes the declaration and the queries that make it answerable. The single lane
  that consumes job rows, and the code that creates them at the four moments, follow in the next
  change and get their own record.

This decision builds on [ADR 0034](0034-progressive-four-way-audio.md) and
[ADR 0035](0035-priority-retry-audio-queue.md), which established the per-sentence,
content-addressed, resumable shape the three layers now share.
