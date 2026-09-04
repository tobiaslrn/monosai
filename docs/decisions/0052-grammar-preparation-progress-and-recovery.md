# 0052 — Grammar preparation uses bounded batches and resumable recovery

Date: 2026-09-04
Status: Accepted

The fixed four-sentence, sequential batching portion is superseded by
[ADR 0054](0054-parallel-text-preparation.md), which makes grammar sparse enough
for adaptive batches and bounded parallel waves. Persistence and recovery remain
as decided here.

## Context

The reader could queue grammar work from **Add notes**, but the first batch was
large relative to its response allowance. While the request was outstanding,
the visible progress was still zero, which made a live request look like work
that had not started. A rejected or truncated provider response and a failed
local write also need different recovery paths: the former is provider work
that can be retried, while the latter must not be mistaken for a completed
analysis.

The preparation lane already owns the real queue, provider boundary, and
persistence sequence. Adding a second reader-only path would make progress and
recovery disagree after a reload.

## Decision

Grammar preparation uses sequential batches of at most four sentences. The
provider adapter allows 4,096 response tokens and keeps the existing bounded
transport retry and one format-recovery request. A valid empty `findings` array
is a successful analysis: every sentence in that response is completed and
counted, even when no note is returned.

The real preparation lane remains the only whole-reading entry point. Its
grammar runner exposes the request and save phases, while the reader's Story
options row distinguishes queued work, an outstanding first request, completed
sentences, provider rejection/truncation, and persistence failure. Provider and
storage failures leave the running state, retain completed records, and expose
the corresponding retry or settings action. No unbounded retry is added.

Each successful record is stored before the job advances its completion list.
Cancellation and reload resume from persisted job rows and never repeat a
completed sentence. Retry creates work only for sentences still missing under
the current grammar cache keys; previously completed analyses remain available.
The job row and the reader status therefore remain the recovery source of truth,
with no schema change.

## Consequences

- A first grammar request is visibly outstanding instead of appearing as zero
  completed work.
- Smaller batches reduce the chance that a valid review is truncated, while the
  response cap remains an explicit provider-boundary safety limit.
- Empty reviews are not lost: they complete sentence coverage and prevent the
  preparation lane from requesting the same sentences again.
- A storage failure cannot silently advance the job, and a provider failure
  cannot erase records saved by earlier batches.
- Integration coverage must exercise the lane, adapter, and real repository
  together, including multi-batch success, empty and malformed output, timeout,
  storage failure, cancellation, and resume.

This decision complements [ADR 0047](0047-a-reading-declares-what-it-should-have.md)
and [ADR 0048](0048-the-preparation-lane-yields.md): targets still create rows,
and the lane still yields rather than behaving as a busy foreground job.

## Alternatives considered

**Show zero completed sentences until a response is saved.** Rejected: it
confuses an outstanding request with queued work and made a healthy run look
stuck.

**Retry every failed batch until it succeeds.** Rejected: malformed output,
timeouts, and provider failures would spend without a bound and could loop
forever against a deterministic refusal.

**Add a reader-specific grammar request path.** Rejected: it would bypass the
preparation lane's persisted queue and make cancellation, reload, and storage
recovery diverge from the other aid layers.
