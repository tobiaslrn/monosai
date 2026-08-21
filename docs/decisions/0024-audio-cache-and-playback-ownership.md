# 0024 — Audio cache keys and who owns playback

Date: 2026-08-21
Status: Accepted

## Context

Milestone 1 created the `AudioAsset` record, the `audioAssets` table keyed by
`cacheKey`, the `'prepare-audio'` job kind, and `clearAudioCache()`. Milestone 6
created `TtsSettings`, `ttsFingerprint()`, and a TTS configuration test that
produces a verified sample clip. Nothing had ever written an audio row: there
was a cache, a job kind, and a tested configuration, and no producer.

Milestone 9 adds the producer and everything above it. That raises four
questions that the existing translation and grammar machinery does not answer,
because audio differs from them in kind: a clip is a blob rather than a string,
it is played rather than read, playing it is a second action after producing it,
and a reading is listened to end to end rather than a sentence at a time.

## Decision

### The cache key names the configuration, and never the credential

Following `domain-and-data-model.md` section 5, a clip is keyed by

    hash('tts' + sentenceContentHash + ttsModelId + voiceId + optionsFingerprint)

where `optionsFingerprint` hashes the response format and the speed. Three
functions express it, mirroring the two translation and grammar already have:

- `audioOptionsFingerprint(hasher, { responseFormat, speed })`
- `audioCacheKey(hasher, sentenceContentHash, modelId, voiceId, optionsFingerprint)`
- `audioConfigFingerprint(hasher, modelId, voiceId, optionsFingerprint)`

The third deliberately excludes the content hash, for the reason
`translationConfigFingerprint` documents its own exclusion: it is what a
persisted job is compared against, and a per-sentence value could not be.

**No key derives from the API key.** `ttsFingerprint()` mixes the credential in,
because its job is to decide whether a *test* still stands for the exact
credential it was run with. A cache key is stored in the clear and compared in
the clear, so mixing a credential into one would put a function of the
credential on disk in every audio row. The two fingerprints answer different
questions and stay separate.

### `AudioConfigurationService` is the one place configuration becomes a config

Both the per-sentence action and the whole-reading job need the same three
answers: is the saved configuration tested and current, what are the model,
voice, and speed, and what do the two fingerprints hash to. `ai-pipelines.md`
section 11 step 1 requires a tested current configuration before anything is
synthesized, and two copies of that check would be two chances to disagree about
whether a stale test may spend money. One service resolves it, and both callers
refuse with `capability-unsupported` when it refuses.

### One audio element, owned by a root store, behind a port

`AudioPlaybackStore` is `providedIn: 'root'`, because `system-architecture.md`
section 4 lists active audio playback among the few application-wide signals:
sound outlives the component that started it, and a reader-scoped store would
leave one reading playing behind another.

The element itself and the object-URL lifecycle sit behind an `AudioPlayer` port
rather than literally inside the store. This is a deviation from the milestone
plan, taken for one reason: it makes "nothing plays without an explicit call" a
unit-testable claim rather than a manual one, and it keeps `createObjectURL` /
`revokeObjectURL` in a single implementation that a caller cannot half-use.

Exactly one instance exists for the reader. The settings TTS section keeps its
own element for the verified test sample, deliberately: that clip was never
stored and has no sentence to be the current one.

### Coverage is measured by cache key, not by row per sentence

`audioAssets` is keyed by `cacheKey`, so two sentences with identical Japanese
share one clip and therefore one row. That is the point of a content-addressed
cache, and it means completeness must be counted as *sentences whose current key
has a stored clip*, never as a count of rows.

Counting rows reported a reading containing a repeated sentence — `はい。` and
`そうですか。` repeat in real Japanese text — as permanently one clip short: the
overflow menu kept offering to prepare audio, each run synthesized nothing
because nothing was missing, and the Play gate never opened. The same reasoning
makes the reader's bounded per-window read `listAudioSummariesForCacheKeys`
rather than a sentence-bounded one. One key per mounted sentence is the same
bound, resolved through the primary key, and it still never loads a blob.

### The complete-set gate

`canPlayWholeReading` is true only when **every** sentence in the reading has a
clip under the current cache key. Two things follow, and both are the point:

- A set with one clip missing is not playable at all, because the player would
  stop in the middle of the reading.
- Clips made under a voice that is no longer configured do not count. Playing
  them would silently mix voices, and `domain-and-data-model.md` section 6 states
  that historical output from an old model must not count toward current
  completeness.

The gate is a rule about reading a *whole reading* aloud. The sentence popover's
Play is not subject to it: one stored clip is exactly as playable on its own
whether or not its neighbours exist, and refusing it would leave the sentence the
learner just paid for unplayable.

This gate is why `refreshAudioSummary` had to be fixed in the same milestone. It
counted every audio row for a reading without comparing each row's `cacheKey`
against the current one — the same defect Milestone 8A fixed for translations and
grammar. "Whole audio completeness cannot be falsely reported" is a release
blocker, and it sits directly on that count.

### Concurrency is one

`ai-pipelines.md` section 11 fixes synthesis concurrency at one, and the speech
endpoint takes one input per request. So there is no batching helper in
`AudioSynthesisService`: a batch here would be a loop pretending to be a request.

The whole-reading job synthesizes strictly in reading order, one at a time, and
stores each clip before making the next request. Two consequences are deliberate:

- A learner who stops a run halfway has the *beginning* of the reading, which is
  the half they can use.
- The first failure **stops the job at that sentence** rather than skipping it.
  The whole purpose of the set is that it can be played end to end, and a set
  with a hole in it that reported itself complete would be exactly the false
  completeness the release blockers name.

The job performs no retries of its own, for the same reason the translation job
does not: `OpenRouterClient` already spends its capped transport retries, and a
second layer would silently multiply the retry budget.

## Consequences

- Changing the voice or the speed invalidates every stored clip for every
  reading. This is correct and is not softened: the old clips remain valid
  historical output and stay on disk until the audio cache is cleared, but they
  stop counting toward completeness and stop being offered.
- The initial bundle budget rises to 950 kB warning / 1.1 MB error to
  accommodate the player and the CDK overlay weight Milestone 8B added. Paying it
  down is Milestone 10's release hardening.
- Playback stops on five triggers, all required by `ai-pipelines.md` section 11:
  reading deletion, audio-cache clearing, a configuration-incompatible missing
  clip, decode failure, and the learner's Stop. Each names the sentence it
  happened at, because "the reading would not play" is not something a learner
  can act on.
- Media Session is feature-detected behind its own adapter, so a browser without
  `navigator.mediaSession` satisfies the interface by doing nothing and the store
  stays testable without the API.
- The desktop dock is `position: fixed`, anchored to the reading column with the
  same CSS anchor positioning the overflow menu uses. `position: sticky` cannot
  express it: a sticky box is clamped to its containing block, and a footer is by
  definition the last thing in its own, so it had no room to lift and simply sat
  at the end of the document. Anchoring rather than a hard-coded offset is
  required because the desktop sidebar's width is a `minmax` the reader does not
  know.
