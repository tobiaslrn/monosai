# 0059 — Preparation fills the reading in order, from one shared pool

Date: 2026-09-06
Status: Accepted; the mutable translation ledger and first ten-sentence batch
are superseded by [ADR 0060](0060-progressive-translation-freezes-terminology.md)

Supersedes the bounded-wave and six-request parts of
[0054](0054-parallel-text-preparation.md), the audio-after-text ordering in
[0034](0034-progressive-four-way-audio.md), and the all-or-nothing translation
batch rule stated in
[0018](0018-openrouter-request-boundary.md)'s request boundary.

## Context

Preparation was three schedulers that happened to share a claim. Translation ran
waves of three, grammar ran waves of three, and audio ran four fixed workers —
but audio did not start until **both** text layers had finished the entire
reading. On a sixty-sentence story the last sentence's English arrived before the
first sentence's clip, which is the opposite of what a learner reading from the
top needs.

Each layer's wave also waited for its own slowest request. A batch that took
twelve seconds held two that took two, three times over, and the ceiling that was
in force depended on which layers happened to be running: "audio is idle" was a
reason for translation to go no faster.

None of this was a rate limit. Monosai has no token bucket, no throttle, and no
inter-request delay anywhere. OpenRouter's own limits scale with the account's
credit balance and sit far above ten concurrent requests for a paid key; only
`:free` model variants are tightly capped, and those announce themselves with a 429.

The one real dependency is soft. Later translations do not need earlier ones —
each batch is an independent request — but the established renderings and the
neighbouring English carried in the window are what keep 優希 from becoming both
"Yuki" and "Yuuki". That is consistency, not correctness.

## Decision

### One pacer, three self-driving layers

`PreparationPacer` is a leaf service that knows about order and pressure and
nothing about aids. Every request any layer wants to make asks it for a permit
first, and permits go to the lowest waiting `(sentence position, layer)` — so
sentence 1's English precedes its grammar, which precedes its audio, which
precedes sentence 40's English. That single comparator is the whole
front-to-back rule.

`PREPARATION_CONCURRENCY = 10` replaces `TRANSLATION_REQUEST_CONCURRENCY`,
`GRAMMAR_REQUEST_CONCURRENCY`, and `AUDIO_GENERATION_CONCURRENCY`. One number
across all three layers together, so how fast a reading fills no longer depends
on which layers happen to be outstanding.

The alternative — a scheduler that knew how to translate — was rejected. The
three job stores already own configuration capture, job rows, cache keys,
storage, progress and failure classification, and they own them well. Nobody
gains a dependency here: the pacer is a leaf injected into three stores that
already existed.

### The stores stop being wave loops

Translation still runs its first batch alone, because that is the one ordering
constraint it has of its own: the first request settles the reading's English
names. After that the glossary is a small mutable ledger read when a batch's turn
comes and written when it returns, so a batch sees whatever the batches ahead of
it have settled — the same guarantee the wave barrier gave, without making every
batch wait for the slowest of three.

Grammar has no glossary and needs no first batch. Audio loses its priority queue
and its fixed worker array; a sentence whose clip came back invalid is simply
re-requested, and the comparator puts the retry back at the sentence's own
position, which is what the queue existed to do.

The preparation lane starts every eligible layer in one `Promise.all` and lets
the pacer decide what actually goes out. Pause, offline, update and
reading-priority holds are checked once before the group and again at each
layer's own next batch boundary, so a parked run still stops without abandoning a
request that has been paid for.

### No client-side rate limit

The only reaction to load is `backOff`, driven by a real `rate-limited` refusal's
own `retryAfterMs`. It holds new grants without touching what is in flight: a 429
says the provider wants fewer requests _starting_, not that the ones it is
already answering should be abandoned. Inventing a fixed delay the provider never
asked for would slow every learner to protect the few on capped free models.

### A translation batch can be salvaged

`partitionTranslations` keeps the entries a reply settled and returns the rest as
unresolved, and the run re-asks once for those. Missing, blank and duplicated ids
are per-sentence facts. An **extra** id — one that was never sent — still voids
the whole reply, because a model returning an id from nowhere has lost track of
which request it is answering.

## Consequences

- A reading fills front to back across all three layers. Early sentences show
  English, grammar and audio while later ones are still empty, which is what
  progressive playback (ADR 0034) always wanted and what the audio-after-text
  ordering prevented.
- Ten requests in flight rather than six text plus four audio in sequence, and no
  layer waits for another layer's slowest request.
- Pressing Stop on a long reading now costs more in-flight requests than it did,
  because more were running. Every one of them is still stored — paid-for work is
  never discarded.
- Two batches in flight can independently discover the same name. The first
  choice recorded wins, so the rendering does not depend on which request
  finished first.
- No persistence migration. Job rows, cache fingerprints, claims, heartbeats,
  validation, transport retries and the absence of job-level automatic retries
  are all unchanged.
- The `job.wave` diagnostic becomes `job.batch` and carries the batch's position
  in the reading, because there are no waves left to number.
