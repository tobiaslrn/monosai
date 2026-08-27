# 0035 — Priority retries for whole-reading audio

Date: 2026-08-27
Status: Accepted

Supersedes the failure-handling subsection of
[ADR 0034](0034-progressive-four-way-audio.md).

## Context

ADR 0034 introduced four concurrent TTS workers over a shared reading-order
cursor and aborted the whole run after the first request failure that survived
provider transport retries. Under real concurrency, whichever request failed
first determined how much later work was abandoned. A transient refusal could
therefore leave an apparently arbitrary gap and every sentence after the first
four unattempted. Retrying from the UI eventually filled the gap, but the
generation run itself did not recover and looked stuck.

The shared cursor also expressed initial claim order, not priority. Once a
worker claimed a sentence there was no way to put that sentence back ahead of
later pending work.

## Decision

`AudioJobStore` uses a stable priority queue whose key is
`positionInReading`. Four workers take the earliest available items. When a
request returns bytes that fail audio validation, the sentence is returned to
the queue at its original priority once. Transient failures already receive the
provider's maximum two transport retries and are not retried again at the job
layer, because that would silently multiply the shared retry policy.

If that attempt also fails, or a sentence produces invalid audio or a malformed
response, the job records that sentence as failed and continues draining the
queue. The final job state is `failed`, its completed and failed counts are
precise, successful clips remain available, and **Try again** creates a new job
for cache keys that are still missing.

Errors that apply to the whole configuration or environment still fail fast:
authentication, missing model, unsupported capability, context budget,
offline, cancellation, and unknown errors. Storage failures also fail fast
because continuing after progress cannot be committed would break persisted
job integrity.

## Consequences

- Request completion order remains nondeterministic, but pending and retried
  work always favors earlier sentences.
- One unreliable sentence no longer abandons every later sentence.
- An invalid clip can make at most one additional synthesis call at the job
  layer. A transient failure remains bounded by the provider's transport retry
  policy.
- No schema migration is required; existing `failedItems` records already
  represent sentence-level failures, and retry already derives work from
  missing current cache keys.
