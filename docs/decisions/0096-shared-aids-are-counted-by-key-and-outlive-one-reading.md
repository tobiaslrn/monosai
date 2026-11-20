# 0096 — Shared aids are counted by key and outlive the reading that wrote them

Date: 2026-11-20
Status: Accepted. Extends [ADR 0024](0024-audio-cache-and-playback-ownership.md) (coverage by
cache key) and [ADR 0047](0047-a-reading-declares-what-it-should-have.md) (never-prepared
sentences) from one reading to the whole library.

## Context

Grammar analyses and audio clips are content-addressed. Their cache keys name the sentence's
Japanese and the configuration, never the reading. So two readings that contain the same sentence
(a greeting, a repeated line, or a text imported twice) share one row. ADR 0024 already counted a
repeated sentence *within* one reading by its key. Across readings, though, every per-reading
query still went through the row's `readingId`, and that field names only the sentence the row was
last written for:

- When the second reading stored the same key, the row moved to it. The first reading's summary
  dropped on its next refresh, and its preparation queued the sentence again, which moved the row
  back.
- Deleting the second reading, or clearing its grammar or audio, deleted the row by that
  `readingId`. The first reading lost an analysis or a clip it had paid for, while its stored
  summary still said complete, so nothing offered to prepare it again.

Translations do not have this problem: their key includes the reading's own translation plan, so no
other reading can produce the same key.

## Decision

**A row serves every sentence whose current key it is, in any reading.** The summaries, the
`listSentenceIdsMissing*` queries and the Play gate ask by key alone, through the primary key, so a
clip's bytes are never read. The playback store reads the clips under the reading's current keys as
well as the ones written for it. The "never prepared" query of ADR 0047 also leaves out a sentence
whose current key already has a row, so a shared sentence is not queued on every reconciliation.
A clip served from the cache is addressed to the sentence and reading that asked for it before it
is stored, so the store refreshes that reading's summary and not the one that wrote it first.

**A deletion keeps a row another reading can use.** Deleting a reading, and clearing its grammar or
audio, looks at the rows written for its sentences. When another reading has a sentence with the
same content hash, the row is handed to that sentence and kept. Only the rest is deleted. The test is
content, not the key, because the repository cannot compute another reading's current keys: they
depend on settings. Content can over-keep, for a clip whose neighbouring sentences differ, or one
made with a voice the other reading no longer uses. ADR 0072 plays such a clip as a fallback for the
same text, so it is still useful. An analysis or a clip is never deleted while a sentence with the
same text exists.

**Storage.** Schema version 19 adds a `contentHash` index on `sentences`, which is how a deletion
finds the twins. The browser builds the index inside the version-change transaction; no row is
rewritten, and an interrupted upgrade leaves version 18 as it was. Rows that an earlier version
already moved between readings need no migration: coverage by key counts them for both readings
at once, and the next deletion hands them on.

### Rejected alternatives

- **A reference table from each sentence to the rows it uses.** This would be exact, but a reading
  that only reads a row another reading wrote has no reference until it stores the row itself.
  Coverage would then have to disagree with what the reader shows, or every read would have to
  write.
- **A list of readings on each row.** Every clip row would be rewritten in the upgrade and again on
  every change of ownership. That is a quota risk on a device that is already full.
- **The reading in the cache key.** Every reading would pay for its own copy of the same speech.

## Consequences

- A reading's summary can count a row that another reading wrote, which is what makes a duplicate
  import cost nothing to prepare.
- Clearing a reading's audio or grammar does not free a row that another reading with the same
  sentence keeps. The cleared reading's summary is reset all the same. It may count the shared row
  again on its next refresh.
- A row's `readingId` and `sentenceId` now only say where a deletion starts looking. No query may
  use them to decide coverage.
