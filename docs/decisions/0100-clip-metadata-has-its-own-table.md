# 0100 — A clip's metadata has its own table

Date: 2026-11-23
Status: Accepted. Amends [ADR 0024](0024-audio-cache-and-playback-ownership.md), whose bounded
read was meant never to load a clip.

## Context

A clip's row in `audioAssets` holds its metadata and its bytes. IndexedDB reads a row whole, so a
query that lists clips copies every listed clip's audio out of the database, and only then can
the bytes be dropped. The player lists the clips of the open reading on every stored clip while a
run plays, and on every voice change. For a long reading that was megabytes per refresh and
hundreds of megabytes per run, on a phone that is playing audio at the same time.

## Decision

Schema version 20 adds `audioSummaries`: each clip's row without its bytes, under the same key and
indexes as `audioAssets`. Every list of clips reads it. `audioAssets` is read whole only to play
or re-encode one clip; coverage and key checks still read its keys alone, which never loads a row.

The two tables are written together, in one transaction, by the functions in
`infrastructure/persistence/repositories/clip-rows.ts`, and by nothing else. A deletion or a clear
releases a reading's rows from both the same way, so a row handed to another reading's sentence is
handed on in both.

The upgrade copies each stored clip's metadata and leaves the clip rows as they were.

## Alternatives

- **Move the bytes to their own table.** The cleaner end state, but its upgrade rewrites every
  stored clip in one version-change transaction, which briefly needs the audio's space twice. On
  a device near its quota the upgrade would fail and leave the app on the recovery screen, where
  the only way forward deletes paid audio. Copying the metadata needs a few hundred bytes a clip.
- **Query less often.** Fewer refreshes still read every clip on each one, and the bounded read
  stays as expensive as the reading is long.

## Consequences

- The metadata is stored twice. A write that bypasses `clip-rows.ts` would let the two disagree,
  so tests that need a missing clip delete it through the repository.
- `audioSummaries` is left out of an export, like the clips it describes, and is one of the
  stores a reading owns.
