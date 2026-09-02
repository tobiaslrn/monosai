# 0045 — A continuous reading is extended while it is generated

Date: 2026-09-02
Status: Accepted

Refines [ADR 0039](0039-continuous-android-audio.md) and supersedes its
consequence that "a session started before completion remains sentence-based
until the next whole-reading start". Refines the frontier behaviour of
[ADR 0034](0034-progressive-four-way-audio.md).

## Context

ADR 0034 made playback progressive: a reading can be started as soon as the
sentence being started from has a clip, and reading on waits at the frontier for
the rest. ADR 0039 made a *complete* reading one native media resource, so
Android can carry it across sentence boundaries with the screen locked.

The two never met. `canUseSequence` required a complete set, so a session
started during a generation run stayed on the per-sentence path for its whole
life — and that path advances in JavaScript: the `ended` event, a read from
IndexedDB, a new object URL, `play()`. Between two sentences the element is not
audible, and Chrome does not exempt a hidden page from freezing unless it is
playing media. Generate, Play, lock the screen, and the reading stops at
whatever had been made when the screen went dark. Progressive playback and
background playback were mutually exclusive, which is the wrong way round: the
reading that most needs to keep going while the phone is in a pocket is the one
that is still being paid for.

The mechanism is worth stating plainly, because it decides the design.
**Audible media is what keeps the page alive; MediaSource is only how the audio
stays audible.** Removing the silent gap at every seam is the fix. Nothing else
about backgrounding is under the application's control: `navigator.wakeLock`
offers only a screen lock, which the specification releases the moment the
document is hidden, and moving generation into the service worker was rejected
for the reasons in [ADR 0044](0044-backgrounded-story-generation.md).

## Decision

### The resource covers a run, and starts where the session starts

`AudioPlaybackStore` builds the native resource from the **contiguous run of
sentences that have a clip, beginning at the sentence being started from**,
rather than from the whole reading. Its own indices are therefore offset from
the reading's, and the store holds that `baseIndex` alongside the timeline.

Continuous mode is the only gate left in `canUseSequence`. One-sentence-at-a-time
stops at every seam, which is the JavaScript this exists to remove, so it keeps
the per-sentence path. Everything else — clips to build from, a container that
can hold them, a browser with `MediaSource` — is decided while loading, and any
of it missing falls back to the established per-sentence path rather than making
stored audio unplayable.

### While the reading is short of its end, the resource stays open

A run that does not reach the last sentence is built **open**: the
`MediaSource` is not ended, and `AudioPlayer.extendSequence` appends each
sentence to the same `SourceBuffer` as it is stored. The element is never given
a new source, never pauses at a seam, and does the advancing itself.

The append is made from `AudioPlaybackStore.prepare`, which the reader already
re-runs on every completed sentence of a run. Playback still learns what exists
from its own read of storage and still does not watch the generation job —
[ADR 0037](0037-audio-transport-recovery-and-one-track.md)'s rule is unchanged,
and no new effect was added, so the loop that rule closed cannot come back.

The resource is sealed — `endOfStream`, so the element can reach its end — on
exactly four conditions:

- the last sentence of the reading has been appended;
- the run that was filling it failed or was cancelled, which only the reader
  knows and which it says through `stopExpectingClips()`;
- the next sentence cannot go in it: no clip where one was expected, or a
  container that is not MPEG;
- the cache-key basis changed, because a changed voice re-keys the reading and
  appending under the new key would put two voices in one reading
  ([ADR 0043](0043-voice-changes-hide-clips-and-say-so.md)).

An append that is refused seals rather than failing the session: what is already
in the resource is audio the learner paid for and can still hear. A refusal for
want of buffer space first evicts audio well behind the position and tries once
more, and the timeline carries the resulting floor so navigation cannot seek
under it.

WAV is never opened. A RIFF header states its own data length, so growing one
means rewriting the blob and reassigning the source — the exact interruption
this decision exists to remove. A partly generated WAV reading keeps the
per-sentence path; the application requests MP3, so this is reached only by
clips stored under another provider or an older format.

### The frontier is a stall, not a teardown

Catching up with generation is now the element running out of buffered audio.
Nothing is paused, unloaded, or torn down: the session moves to `waiting` and
names the sentence it is holding for, exactly as the per-sentence frontier does,
and the append that follows starts the element again with no second Play.
`waiting` therefore keeps its meaning and its copy, and the transport keeps its
live Stop.

`abandonWaiting()` becomes `stopExpectingClips()`, a superset: it seals an open
resource *and* releases a wait. The reader calls it whenever the audio job
reports `failed` or `cancelled`, whether or not a wait is showing, because a
resource left open would otherwise stall at the end of what was made instead of
finishing there.

### Position is published over what exists so far

Media Session position state is published on every successful append, so the
lock-screen timeline lengthens behind the position as the reading fills in
rather than being wrong about where the end is.

## Consequences

- A reading started during generation now plays to the end with the screen
  locked, which is the point.
- There are two frontiers — what is stored, and what has been appended. They are
  one `prepare` apart, and navigation that lands outside the resource starts a
  new one from that sentence rather than seeking into audio the element does not
  have.
- **A stall long enough to make the page inaudible is still a freeze
  candidate.** This removes every silent gap except the one where generation
  loses the race with realtime playback. Four concurrent workers over sentences
  of a few seconds each normally win it; this is not a guarantee, and background
  playback is not unconditional.
- MP3 frame boundaries make `buffered.end` approximate, as in ADR 0039. A longer
  resource accumulates more of that drift in sentence highlighting.
- No Dexie version, stored row, cache identity, or visible player control
  changes. Clips remain separate on disk, generated, retried, shared by cache
  key, and invalidated independently.
- Screen-locked behaviour on real hardware remains unverified by automation, and
  now covers a growing resource and a frontier stall as well. It stays risk 6 in
  [chapter 11](../arc42/11-risks-and-technical-debt.md).
