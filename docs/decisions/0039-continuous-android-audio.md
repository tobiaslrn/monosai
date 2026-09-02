# 0039 — Continuous Android audio uses one native media resource

Date: 2026-08-28
Status: Accepted

Refines the playback transport in [ADR 0037](0037-audio-transport-recovery-and-one-track.md)
and supersedes its conclusion that Android background playback is not attempted.

The partial-reading rule below — that a session started before a generation run
finishes stays sentence-based — is superseded by
[ADR 0045](0045-a-reading-is-extended-while-it-is-generated.md), which builds
the resource over what exists and appends the rest to it as it is made.

## Context

Whole-reading playback used one `HTMLAudioElement`, but replaced its Blob URL
after every sentence. Advancing therefore depended on JavaScript handling the
`ended` event, reading the next clip from IndexedDB, and assigning a new source.
Android may suspend that work after the screen is locked or another app comes
to the foreground. Short sentence resources also did not give Chrome one stable
track from which to build a useful media notification and position timeline.

The sentence clips must remain separate on disk: they are generated, retried,
shared by cache key, and invalidated independently. Progressive playback must
also remain available before a generation run is complete.

## Decision

### Complete continuous readings become one resource

When every current sentence cache key exists and playback mode is `continuous`,
the playback store reads the clips in reading order and asks `AudioPlayer` to
construct one sequence. MPEG clips are appended to an `audio/mpeg`
`MediaSource` buffer in `sequence` mode. PCM WAV clips with identical format
parameters are joined into one RIFF/WAV resource without decoding or changing
samples. Sentence boundaries and total duration are recorded while assembling.

The sequence is ephemeral. It is never persisted, does not alter cache keys,
and is released with the existing audio element and object URL lifecycle.

Partial readings, unsupported browsers, mixed or invalid containers, explicit
single-sentence playback, and one-sentence-at-a-time mode retain the existing
per-sentence path. A failed sequence preparation falls back to that path rather
than making already generated audio unplayable.

### Navigation seeks inside the resource

Next and Previous keep their sentence semantics, but seek to recorded sentence
boundaries instead of loading a new Blob. Time updates map the native playback
position back to the current sentence, preserving reader highlighting and the
existing replay window. Scrubbing an active complete reading seeks without
rebuilding the sequence.

### Android receives position as well as transport

Media Session retains Play, Pause, Stop, Previous, and Next and adds `seekto`
plus position state. Metadata presents the reading title as the track, Monosai
as its source, the current sentence as the album line, and the existing app icon
as artwork. Unsupported actions and position state are independently optional,
because Android and Chrome versions expose different subsets.

## Consequences

- A complete continuous reading can cross sentence boundaries in Android's
  native media pipeline while the document is backgrounded.
- Generation still becomes playable progressively. A session started before
  completion remained sentence-based until the next whole-reading start, which
  ADR 0045 replaced with a resource that grows while the run fills it in.
- No Dexie version, stored row, cache identity, or visible player control changes.
- Background behaviour and the exact notification buttons still require a real
  installed-PWA test on Android; browser automation cannot lock physical hardware.

