# 0034 — Progressive playback and four-way audio generation

Date: 2026-08-26
Status: Accepted

The failure-handling subsection is superseded by
[ADR 0035](0035-priority-retry-audio-queue.md).

Supersedes the "Concurrency is one" section and the complete-set playback gate
of [ADR 0024](0024-audio-cache-and-playback-ownership.md).

## Context

ADR 0024 fixed whole-reading synthesis at one request at a time and gated
playback on a complete set: a reading could not be played at all until every one
of its sentences had a clip under the current voice. Both rules came from the
same worry — that a player which stopped in the middle of a reading would be
worse than no player.

Living with them showed the cost. A twenty-sentence reading is twenty round
trips end to end, and the learner watches all of them before hearing anything.
When the nineteenth fails, everything already paid for is unplayable: the player
reports a failure where a transport should be, and eighteen clips sit on disk
that the application refuses to play. Stopping a run has the same shape — the
clips are kept, the specification says so, and there is no way to listen to
them.

The worry the gate was built around is real but narrower than the gate. A player
that stops silently in the middle of a reading is bad. A player that says *what
it is waiting for* and carries on when it arrives is not.

## Decision

### Four requests, claimed in reading order

`AudioJobStore` runs a queue with `AUDIO_GENERATION_CONCURRENCY = 4` workers
over one shared cursor that advances in reading order.

Four rather than one because the wait is otherwise four times longer for no
benefit, and four rather than more because **the bound is what keeps the
beginning of the reading arriving first**. A wide queue would scatter the first
completions across the text and leave progressive playback with nothing to start
on — the ordering is not incidental to the concurrency, it is the reason the
concurrency is bounded at all. The limit is internal and fixed: it is not a
setting, because there is no answer a learner could give that is better than the
one the queue needs.

The endpoint still takes one input per request, so `AudioSynthesisService` still
has no batching helper. What changed is that several of its calls may be in
flight at once, which it was already safe for — it holds no state between them.

### Completions are counted, not read back

Each worker stores its clip and records its job item before claiming another, so
an interruption anywhere still leaves a job whose recorded progress its stored
rows support. But `completedSentenceIds` is now written out of order, and two
overlapping transactions can resolve in either order. The progress number is
therefore counted in the job rather than taken from whichever `recordCompletion`
settled last, so it can never go backwards.

Progress reads "N of M ready" rather than "sentence N of M". With four requests
open there is no single sentence the run is at, and how many are ready is both
true and the number that decides how far playback can get.

### The first exhausted failure aborts the rest

A refusal that survives the client's transport retries aborts the controller,
which cancels the requests its siblings have open rather than paying for them.
Clips that had already arrived are stored and kept. Only the first failure is
reported, and it wins over the abort it caused: a run stopped by a refusal is
never reported as one the learner stopped.

The job still performs no retries of its own. **Try again** is the visible,
learner-driven attempt that follows the transport retries, and it asks only for
what is still missing.

### Playback is progressive at sentence granularity

The complete-set gate is replaced by per-sentence availability:

- **Play** starts as soon as sentence one has a clip.
- **Start from this sentence** is offered when *that* sentence has a clip.
- Reading on stops at the frontier and enters a new `waiting` status, naming the
  sentence it is waiting for. The cursor stays on the sentence just heard, so
  the reader keeps showing the learner where they are.
- When that clip is stored, the metadata refresh the reader already runs on
  every job progress change finds it and the session reads on.
- Manual **Next** is disabled until its target exists, because a jump needs
  somewhere to land. **Back** stays available, because its first meaning is
  replaying the sentence being read.

This is **sentence-level progressive playback, not byte-streaming**. Nothing is
streamed: each clip is a whole file, decoded and stored before it is played. The
unit that arrives progressively is a sentence.

Continuing after a wait is not autoplay. `waiting` cannot be entered without an
explicit Play or Start from this sentence, so reading on belongs to a session the
learner started. Availability alone still never makes a sound: a clip arriving
while nothing is playing is metadata, and metadata is silent.

### The player shows both at once

Transport and generation are shown together rather than one instead of the
other. Once any clip exists the transport is the primary thing in the card, and
the run still filling in the rest is a quiet rail beneath it with its own
**Stop**. A failure or a cancellation keeps the playable prefix and offers **Try
again** for the remainder.

Generation **Stop** aborts the requests in flight and stops no sound; closing the
player still stops playback and cancels no generation. The two are separate
sessions, and the control for one must not act on the other.

### `canPlayWholeReading` survives as a completeness figure

It is no longer a gate. It still excludes clips made under a voice that is no
longer configured — `domain-and-data-model.md` section 6 — and it is what says
the set is finished: the library's audio summary, and whether the player still
offers to prepare the remainder.

## Consequences

- `PlaybackStatus` gains `waiting`. Every surface that switches on it must
  handle a started session that is making no sound and is not paused.
- The `incomplete` playback failure is gone. Nothing produces it any more: a
  start that cannot happen is a named sentence with no clip, not a count of how
  many the reading is short.
- A learner can now hear the front of a reading while paying for the rest, which
  is the point. They can also stop generation and keep listening to what was
  made, which the previous design made impossible.
- No database migration, settings field, or cache-key change. `AssetJob` records
  stay compatible: `completedSentenceIds` may now be out of order, and playback
  and retries continue to derive order from `orderedSentenceIds`.
- Four concurrent requests raise the rate-limit pressure ADR 0024's concurrency
  of one was partly chosen to avoid. The client's existing backoff is what
  absorbs it, and the fail-fast keeps a rate-limited run from spending its way
  through the whole reading before reporting.
