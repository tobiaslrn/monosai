# 0060 — Progressive translation freezes a persisted terminology plan

Date: 2026-09-07
Status: Accepted

Supersedes the mutable translation glossary and ten-sentence opening described
by [0054](0054-parallel-text-preparation.md) and
[0059](0059-preparation-fills-the-reading-in-order.md). It does not supersede
their grammar, shared-pacer, claim, heartbeat, or layer-independence decisions.

## Context

A ten-sentence first request delayed the first useful English, while a glossary
learned opportunistically from completed batches made sibling request context
depend on completion order. After a reload, that mutable context could not be
reconstructed exactly. Sentence cache keys also described immediate neighbours
while a batch actually received a larger passage.

## Decision

Before translation, Monosai selects at most twenty useful whole-reading
terminology candidates locally from stored token analyses. Names are preferred;
ordinary recurring nouns are candidates rather than mandatory one-to-one
translations. Readings and one or two bounded Japanese examples travel with
each candidate. Selection order, bounds, and policy version are deterministic.

The first provider request covers a small opening: three sentences by default,
or the first paragraph when it has three to five. The complete request remains
under a conservative input budget. Its reply contains per-sentence English and
a glossary whose entries are validated independently. A valid, possibly empty
glossary is frozen and committed atomically with accepted opening rows. If only
the glossary is invalid, valid English is committed provisionally and Retry
repairs terminology without requesting that English again.

A ready plan captures the model, prompt, title, premise, register, ordered
source identity, candidate inputs and policy versions. The tail receives the
identical frozen glossary and story context in every request. Japanese passage
windows are derived from stable source-position groups, so retrying fewer target
ids does not change context identity. Cache keys include both ready-plan and
passage-window fingerprints.

Tail chunks contain at most ten targets. Three translation requests roll at a
time as an initial measurable tuning choice; a freed local slot starts the next
eligible chunk. Every actual provider request separately acquires the existing
shared preparation permit, and local translation capacity is never held while
waiting for it.

Translation plan states are persisted beside the existing asset job. Claims,
heartbeats, reconciliation, Stop, recovery, provider backoff, and store-before-
progress rules remain authoritative. Grammar and audio start and recover
independently and have no dependency on the translation plan.

## Consequences

- The beginning becomes readable after a smaller first round trip and durable
  commit, while concurrent tail work shortens total completion time.
- Frozen terminology makes sibling request context independent of completion
  order and permits deterministic reconstruction after reload.
- Frozen terminology improves consistency; it does not guarantee linguistic
  correctness, and entries apply only to the same meaning or referent.
- A model or prompt, source/order, story context, candidate input, or selection
  policy change makes a plan stale. Replacement work starts only after an
  explicit translation request; historical rows are not deleted.
- Diagnostics reuse the existing structured logger for time to first persisted
  English, total translation duration, request count, and provider token usage
  when the provider supplies it. Existing audio diagnostics continue to measure
  time to first playable audio. No story text or credential is logged.
