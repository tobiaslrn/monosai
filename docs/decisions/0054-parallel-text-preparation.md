# 0054 — Text preparation uses sparse adaptive batches and bounded waves

Date: 2026-09-04
Status: Accepted

Supersedes the sequential text-layer and fixed four-sentence grammar batching
parts of [0048](0048-the-preparation-lane-yields.md) and
[0052](0052-grammar-preparation-progress-and-recovery.md).

## Context

Translation already grouped ten sentences into one request and grammar grouped
four, but every text request and both layers ran serially. Long readings therefore
paid mostly in elapsed round trips. Simply sending a whole reading is not bounded:
generated readings can contain 800 sentences, imported sentences can be large,
and the earlier dense grammar contract allowed three explanations per sentence.

Translation has one dependency grammar does not. Earlier English establishes how
names and recurring terms are rendered, so unrestricted parallel batches can be
individually correct while disagreeing with each other.

## Decision

English and grammar run together under the reading's existing cross-tab claim.
Each layer opens at most three requests, for at most six text requests per claimed
reading. Audio begins after both text layers settle and keeps its existing four
workers. A failed text layer is blocked independently; its sibling and audio may
still finish.

Grammar becomes deliberately selective: at most one useful finding per sentence,
with above-profile grammar preferred and no requirement to invent a note for every
sentence. Its prompt version advances. Contiguous batches are planned greedily up
to 30 sentences and a conservative 12,000 estimated input tokens. Thus an ordinary
5–30 sentence story is one request, while large readings remain bounded. Up to
three independent grammar batches form one request wave.

Translation keeps its ten-sentence batches. The first runs alone to establish a
compact English glossary. Later batches run in deterministic waves of three,
sharing the glossary from prior waves; additions merge in reading order before the
next wave. This preserves stable earlier choices without serializing every request.

Pause, offline, update, and reading-priority changes take effect between waves.
Requests already in flight settle, and successful results are stored before the
job is parked. Job rows, cache fingerprints, validation, transport retries, and
the absence of job-level automatic retries are unchanged.

## Consequences

- Common stories need one grammar round trip, and long text work approaches three
  times the previous throughput per layer.
- Grammar is a focused reading aid rather than an exhaustive inventory.
- Translation batches in the same wave cannot learn terms first introduced by a
  sibling, but later waves reuse the deterministic merged glossary.
- No persistence migration is needed. Existing grammar rows remain stored and are
  stale under the new prompt version.
- The six-request ceiling is per claimed reading; the existing decision that two
  tabs may prepare different readings still applies.
