# 0096 — Shared aids are counted by key and outlive the reading that wrote them

Date: 2026-11-20
Status: Accepted. Extends [ADR 0024](0024-audio-cache-and-playback-ownership.md) (coverage by
cache key) and [ADR 0047](0047-a-reading-declares-what-it-should-have.md) (never-prepared
sentences) from one reading to the whole library.

## Context

Grammar analyses and audio clips are content-addressed. Their cache keys name the sentence's
Japanese and the configuration, never the reading. A clip's key also names the neighbouring
sentences when the voice model takes speech instructions, because those shape how the line is
read. So two readings that contain the same sentence (a greeting, a repeated line, or a text
imported twice) share one row, and for audio with such a model, only where the neighbours match
too. ADR 0024 already counted a
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
Preparation that finds nothing to request stores nothing, so it counts the reading's grammar or
audio summary by key itself, but only when every sentence has a row under its current key. That is
the reading whose sentences another reading already prepared. Queueing also finds nothing to
request for a reading prepared under an earlier voice, model or reading level (ADR 0047). Its rows
are still stored and still played or shown, so its summary is left as it is: a count by the new
keys would say nothing is saved and hide the actions that delete those rows. A reading with no
analysis under its current keys, which only a clear leaves, reads as never asked for, not as
reviewed for no sentence.

**A deletion keeps a row another reading can use.** Deleting a reading, and clearing its grammar or
audio, looks at the rows written for its sentences. When another reading has a sentence with the
same content hash, the row is handed to that sentence and kept. Only the rest is deleted.

- **Deleting a reading** tests content, not the key, because the repository cannot compute another
  reading's current keys: they depend on settings. Content can over-keep, for a clip whose
  neighbouring sentences differ, or one made with a voice no reading uses any more. ADR 0072 plays
  such a clip as a fallback for the same text, so it is still useful. A deleted reading's analysis
  or clip is never deleted while a sentence with the same text exists.
- **Clearing a reading's audio or grammar** passes the reading's current keys, and keeps only a
  row that is current for it. Configuration is the same for every reading, so a row the cleared
  reading no longer uses by key (an older voice or model) serves no other reading by key either,
  and it is deleted. A row that is current for it is handed on by the content test, as a deletion
  does. For a grammar row that twin uses the row by key. For a clip whose neighbouring sentences
  differ in the twin, the twin's key differs, and it only plays the clip as the ADR 0072 fallback,
  while the cleared reading still finds it under its own key. So such a clip survives the clear,
  still counts for the cleared reading, and is not made again. When no key can be computed (no
  voice or model is set up, or the profile cannot be read), the clear falls back to the content
  test.
- **After a clear**, the cleared reading's summary is counted by key in the same transaction, like
  every other count. A row it shares with another reading still counts, and the reader still
  plays or shows it, so the summary and the reader agree.

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
  import cost nothing to prepare. Its summary says so the first time its preparation runs and
  finds every sentence already covered.
- Clearing a reading's audio or grammar deletes only what that reading alone uses, and the confirm
  dialogs say so ("the audio only this story uses"). Neither they nor the deletion plan count or
  promise space for a row another reading keeps.
- Clearing two readings with the same sentence in turn moves a row that is current for both from
  one to the other and back. That changes only the row's address: both readings keep counting and
  playing it. Such a row is freed only by **Delete saved audio**, which deletes every clip of every
  reading, or by deleting both readings. A row from an older voice or model never moves back,
  because a clear deletes it.
- A row's `readingId` and `sentenceId` now only say where a deletion starts looking. No query may
  use them to decide coverage.
