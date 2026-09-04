# 0048 — The preparation lane yields, and is never busy

Date: 2026-09-03
Status: Accepted

The sequential text-layer portion is superseded by
[ADR 0054](0054-parallel-text-preparation.md). English and grammar now run
together in bounded request waves; audio still follows them.

## Context

[ADR 0047](0047-a-reading-declares-what-it-should-have.md) gave a reading a declaration of the aid
layers it should contain, and job rows to carry the work. Something has to run those rows.

Three producers already existed and had converged on the same shape without ever being asked to:
a context captured before the first request, sequential bounded work, every success stored before
the next request is made, and no retries of their own. What none of them had was a way to be
sequenced. Each one started, ran to completion, and stopped. Three of them let loose at once would
have spent three streams of requests on whichever readings happened to have rows.

The sequencing rules that matter are not about throughput. They are about what the learner is doing
at the time: reading something, waiting for a story, listening with the screen locked, or trying to
install an update.

## Decision

One preparation lane runs the job rows, one reading at a time, its layers in
`PREPARATION_ORDER`. `LayerRunner` is the interface the three producers already satisfied in all
but name; `PreparationStore` owns ordering and nothing else.

### It yields, it never cancels

Stepping aside — for the open reading, for an update, for a lost connection, for the learner's
*Pause* — parks the run at its next safe boundary and leaves the row resumable. `JobState` already
had `paused` and nothing used it.

Cancelling instead would be wrong twice over. Nothing is stored until a batch returns, so aborting
mid-batch discards a request the learner has already paid for. And `cancelled` means something
final to every screen watching a run: under [ADR 0045](0045-a-reading-is-extended-while-it-is-generated.md)
the reader seals its `MediaSource` the moment an audio run reports `cancelled` or `failed`, so a
lane preempting an audio run would end a screen-locked listening session — the exact failure
ADR 0045 removed. An open playback resource outranks the open reading, and `paused` is never
reported as `cancelled`.

*Cancel* stays the learner's word, and only the learner's.

### It is never busy

`AppBusyRegistry` means work a reload would destroy, and registering makes `AppUpdateStore.canActivate`
false. A queue that outlives a session would wedge updates for as long as it existed.

The three job stores registered as busy before this decision, and they stop. A batch job is
persisted, resumable, and re-derives its progress from stored rows: a reload costs it at most the
batch in flight, which is exactly what the busy flag is not for. An unsaved import draft and an
in-flight generation stay busy, because a reload really does destroy those.

So the lane does the opposite of blocking an update: it parks, lets activation proceed, and picks
the rows back up after the reload. Persisting job rows is what buys this.

### What holds it

- **A generation is running.** `MAX_CONCURRENT_GENERATIONS` already permits three paid streams, and
  shedding the aid stages makes generations land sooner and queue more. The honest promise is three
  generation streams or one preparation pipeline, never both.
- **Offline.** Park with *Waiting for a connection*. Do not spin, and do not mark rows failed:
  `navigator.onLine` is a hint about interfaces, good enough to avoid starting work that is certain
  to fail and not good enough to call anything a failure.
- **An update is waiting.**

A hold clearing is the only thing that restarts a parked lane by itself. Nothing else in the
application starts a layer without one of ADR 0047's four moments.

### One pipeline per reading

Exclusivity is scoped to the reading and claimed on its job rows: an owner id and a heartbeat,
written and checked in one transaction. A lane that finds a live claim it does not own skips that
reading and works another. A claim whose heartbeat has gone stale is taken over, so a tab closed
mid-run does not strand a reading.

The consequence to accept is that two tabs can prepare two *different* readings at once, so the
rate limit is per reading rather than global. The same reading can never be prepared twice.

### A layer that refuses

A failed layer keeps its row — that is how the failure stays visible — so the lane records it as
blocked and does not pick it again on the next pass. *Retry*, and a fresh reconciliation, are acts
the learner took and both clear it. Without this the work list would hand the lane the same refusal
for ever.

Translation and grammar now draw the split audio already drew (ADR 0035): a sentence-local failure
is recorded and the run continues; a configuration-wide one stops it. Audio is unchanged and keeps
`AUDIO_GENERATION_CONCURRENCY = 4`, which [ADR 0034](0034-progressive-four-way-audio.md) requires
for progressive playback — so "one at a time" is per reading and per layer, never literally one
request in flight.

### A leaf between two subsystems

The lane holds for a running generation and a saved story queues its own preparation, which is a
cycle if either store imports the other. `GenerationActivityRegistry` breaks it: a root service
holding one number, with no dependencies of its own. Generation publishes the count, the lane reads
it, and the direct dependency runs one way only.

Being a leaf matters for a second reason. Wiring the two together at bootstrap would have pulled
the whole enrichment and generation graph into the initial bundle — 76 kB, for a lane that must not
do anything at launch anyway. Neither subsystem is now reachable from bootstrap.

`NETWORK_STATUS` is a genuine port, for a different reason: the application layer must not reach
into the shell, and the lane has to be able to go offline in a unit test with no `window`.

## Consequences

- Aid work stops competing with itself. One reading is prepared at a time, and the one on screen
  goes first.
- An update installs while a queue exists, which it could not have done had the lane been busy.
- A screen-locked listening session survives the lane moving on to another reading.
- Progress survives a reload: the rows say what was done, and the lane resumes from them.
- Two tabs will spend on two readings at once. That is the accepted cost of scoping exclusivity to
  the reading rather than to the application.
- There is no token or cost ledger. Request counts stay visible in the progress row and the lane is
  pausable; OpenRouter's `usage` block is still parsed and discarded, and building spend accounting
  would have doubled this change.
