# 0044 — A story is written by a job, not by a screen

Date: 2026-09-01
Status: Accepted

## Context

Generating a story is the slowest thing Monosai does: several model requests,
two repair attempts if the story needs them, and a grammar review and a
translation pass before anything is written. Minutes, in the worst case.

Until now that work lived and died with the Generate screen. `GenerationStore`
was provided by `GeneratePageComponent`, and its `ngOnDestroy` aborted the run's
`AbortController`. Nothing is persisted before `finalizing`, so leaving the
screen — a tap on Back to library, a link to a reading, anything — silently
discarded a run the learner had already paid for, with no warning and nothing to
show for it. The only supported behaviour was to sit and watch a progress screen
for as long as the model took.

That was a deliberate guarantee, not an oversight: leaving discarded whatever
was in flight, so no half-validated candidate could survive a navigation. The
guarantee is worth keeping. Where it belongs is with the job, not with the
screen that happened to start it.

## Decision

### Runs live in a registry, one store per job

`GenerationJobsStore` is provided at the root and owns the runs. Each job gets
its own `GenerationStore` in its own environment injector, created with the same
three providers the Generate page used to declare.

The state machine was written for exactly one run — one abort controller, one
set of inputs captured before the first request, one built draft held for a
retryable save — and that is a good design worth keeping rather than generalising
into a multi-run store. Instantiating it per job keeps every one of those
guarantees while several stories are written side by side.

The screen is now a view of a job. `generate/:jobId` shows the run named by the
segment; `/generate` is the form. Starting a run replaces the address with the
job's, so Back from the wait screen goes where the learner came from rather than
to a form they have already submitted.

### Three at once

`MAX_CONCURRENT_GENERATIONS` is 3. Each run is a sequence of paid requests whose
cost the learner cannot see while it happens, and the point of backgrounding a
generation is to get on with reading rather than to queue an afternoon of them.
Over the limit, the form says the next story can start when one finishes.

The busy reason is owned by the registry rather than by each store. The registry
key `generation` is one key: with several instances writing it, one instance's
cleanup would clear a reason another was still holding, and a controlled reload
would think it was safe.

### Nothing is persisted, and a job belongs to one tab

There is no job row in the database, and no schema version was added.

An open provider request cannot be resumed — a reload starts a new HTTP request
and pays for it again — and nothing is written before the single final
transaction, so a run that outlives its tab would be a record of work that is not
happening. Persisting one would mean either resuming from a checkpoint the
pipeline does not have, or listing a job that will never move.

So a run ends with its tab, and the application says so twice: `beforeunload`
warns while any run is in flight, and an address for a job this tab does not have
says the generation is no longer running rather than presenting an empty form.

The alternative considered was a service worker owning the requests. It was
rejected for the same reason the rest of Monosai keeps the worker to caching:
the pipeline reaches the tokenizer, the vocabulary snapshot, and Dexie, and
moving it behind a worker would move all of that with it.

### A stopped run keeps its row

The Library lists every job that is not `saved`. A saved story is represented by
the reading, so its row goes and the shelf reloads where the learner is
standing, announced in the live region the Library already has.

Every other terminal state — cancelled, failed, an invalid draft — keeps its row
until the learner dismisses it. They were somewhere else when it happened; a
failure that removes itself is a failure they never saw. Dismissing a run that
is still being written asks first, because it stops requests already paid for.

## Consequences

- A learner can start a story and go and read something else, which is the only
  way a multi-minute generation is worth waiting for.
- Three concurrent runs mean three concurrent request streams against one
  OpenRouter key. The bound is the mitigation, and it is deliberately low.
- A reload still loses every run. That cost is now stated before it is paid
  rather than discovered afterwards.
- Jobs are per-tab, so a second tab does not list the first tab's runs. It does
  get the finished story, through the ordinary library load on its next
  navigation.
- `GenerationWaitComponent` takes the state it renders as an input rather than
  injecting the store, because there is no longer one run to inject.
