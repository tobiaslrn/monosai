# 0037 — Audio transport recovery, navigation, and one track

Date: 2026-08-27
Status: Accepted

Supersedes the **Toggle semantics** and **Controls** subsections of
[ADR 0028](0028-floating-audio-player.md), and refines the transport and
navigation behaviour introduced by
[ADR 0034](0034-progressive-four-way-audio.md).

## Context

Behavioural testing of the shipped player against a real build found the
transport reaching states it could not be moved out of, and states it reported
as something other than what they were.

- Back on the first sentence called `stop()`. The session was torn down and the
  cursor cleared, at the one position where the control's own label promises to
  restart the sentence.
- `waiting` had exactly one exit: the clip arriving. ADR 0035 lets a run record
  a failed sentence and continue, and a run can also fail outright or be
  cancelled — in every one of those cases the awaited clip never arrives. Play
  was disabled, Next was disabled, and ADR 0028 had deliberately left the
  transport with no Stop, so the player parked at "Waiting for sentence N of M"
  with nothing pressable.
- The automatic advance set `loading`, which the template renders as a disabled
  Play. Measured at 23–26 ms of flicker at every sentence seam, and a press
  landing in that window was dropped.
- Reaching the last sentence also called `stop()`, so a finished reading was
  indistinguishable from one that had never been started.
- Next meant "the immediately following sentence, if it has a clip". ADR 0035
  made holes in the available set an ordinary outcome, and a hole was a wall.
- Playback position and generation coverage were drawn as two visually
  identical 3px accent bars, and blocks appearing and disappearing changed the
  docked player's height four times during one generation run — each change
  reflowing the reading beneath it, because the height is published as
  `--docked-player-height`.
- `prepare()` had no latest-wins guard, so overlapping reads could settle out of
  order and a stale, smaller availability set could overwrite a fresher one.
  Closing that race exposed a much larger defect underneath it: the reader's
  store effects ran unboundedly. Measured on a real build, one eight-sentence
  generation produced **around 14,000 `prepare()` calls in twenty seconds** —
  roughly 28,000 IndexedDB reads for eight clips.

## Decision

### The session never dead-ends

`step()` stops being able to stop. Off the start it replays the current
sentence; off the end it does nothing, because a headset next-track press at
the last sentence means "the next sentence", not "end this".

Reaching the end of the reading enters a new `ended` status rather than
`stop()`. The cursor stays on the last sentence, so the track stays full, the
highlight holds, and Back replays what just finished.

`AudioPlaybackStore.abandonWaiting()` releases a wait for a clip that is not
coming, moving the session to `ended` with a `not-generated` failure naming the
sentence. `ReaderPageComponent` calls it when the audio job reports `failed` or
`cancelled`: whether a job is still running belongs to the reader, and the
playback store does not watch generation.

[ADR 0045](0045-a-reading-is-extended-while-it-is-generated.md) renames it
`stopExpectingClips()` and widens it to seal a continuous resource as well. The
rule this paragraph is about — that the reader is the one who knows, and that
playback does not watch the job — is unchanged.

The transport gains a **Stop reading** control, live whenever a session is
active. There is therefore always something to press, including at the
frontier.

### Closing the player is not a stop

Closing through the header button hides the card and clears the captured
sentence. It no longer calls `stop()`. Hiding the transport to read the text
underneath is not "stop reading to me", and playback is application-wide by
design. The header button keeps naming the live state, and reopening lands back
on the session. Navigating away from the reader still stops.

### Reading on is not a state to render

`load()` takes a `keepStatus` option, set for the automatic advance and for
reading on after a wait. Those loads leave the displayed status alone, so the
transport never renders a disabled Play between two sentences of one advance.
A Pause pressed during a load is remembered and the clip arrives already
paused, through a `startPaused` option on `AudioPlayer.play`.

### Effects do not track the state their own calls rewrite

An Angular effect tracks every signal read while its body runs, including reads
inside the calls the body makes. `ReaderStore.refreshSummaries()` reads the
reading row and then replaces it with a fresh object; `prepare()`, `open()`, and
`SentenceAidsStore.load()` do the same shape of thing. Called from a tracked
position, each of those made its effect its own trigger, and the effect never
stopped re-running.

Every store call in `ReaderPageComponent`'s effects is therefore made inside
`untracked()`. The signals in the effect body above the call stay the triggers,
which is what they were always meant to be.

Nothing was visibly broken by the loop before, because every iteration wrote a
result and one of them was always current. It became a stall the moment
`prepare()` gained a latest-wins token: with a new call superseding the previous
one hundreds of times a second, no read ever survived to be written, and the
player showed a stale count until the page was reloaded.

### Navigation follows the audio, not the index

Next and Back move to the nearest sentence in that direction that *has* a clip.
Play starts at the first sentence that has one rather than requiring sentence
one. `canPlayFromStart` is removed; `hasPlayableAudio` is the gate.

### One track

The player draws a single `progressbar`: a quiet fill for generation coverage
behind the accent fill for playback position. Both are measured over
`sentenceCount`, so they compose. The generation fill is
`availableCount / sentenceCount` and never the job's own percentage, or a retry
covering two missing sentences would render as half of the reading.

The transport row and the track are always rendered, disabled when there is
nothing to play, so the docked card does not change height as the first clip
lands or a run ends.

A run in progress adds **nothing to the card at all**. The generation fill is
the entire report — "4 of 30 sentences ready" underneath the bar said in words
what the bar had already said — and the fill breathes while a run is in flight,
so the track says both how far it has got and that it is still going. Stopping a
run moves to the reader menu, beside Delete audio and matching the Stop
translating already there: it is a reading-level audio action pressed at most
once a run, and a permanent row for it made a card that floats over the reading
taller than the controls in it.

Only a run that *stopped* still has anything to say, because "stopped with 4 of
30" is a fact the track cannot carry. Everything the card might add — the offer
to generate, a stopped run, Start from this sentence, a playback failure — now
shares **one** band behind one divider, so a player with nothing to add is the
transport, the track, and the mode toggle and nothing else. Measured at 149px on
a 412px viewport, unchanged from the moment a run starts through finishing it
and playing the result.

### Honest reporting

- `hasAudioModel` in the reader resolves through `AudioConfigurationService`,
  the same readiness generation gates on, rather than through saved presets. A
  tested model and voice with no preset saved is an ordinary state and was
  being offered "Set up audio model" beside a Generate button that worked.
- The playback failure banner has its own Dismiss, wired to the
  `acknowledgeFailure` that previously had no caller.
- A provider failure in the reader states what failed rather than the shared
  table's primary action, which is written for the settings test panel and told
  learners to "try the test again" where there is no test.
- The position line never renders empty; a blank `role="status"` beside a row
  of controls reads as a label that failed to load.
- A refused `resume()` stays paused instead of reporting a decode failure and
  destroying the session: the common cause is the autoplay policy, not a broken
  clip.

### Media Session

Handlers are held by the adapter and re-asserted on every metadata publish;
`clear()` drops the metadata only. Registering once and nulling on `stop()`
left every later notification with dead buttons. Metadata gains artwork from
`icons/icon-512.png`, resolved against `document.baseURI` so the baked
`<base href="/monosai/">` is respected, and the artist string is truncated
because an import saved without a title has its whole body as its title.

## Consequences

- `PlaybackStatus` gains `ended`; every exhaustive switch over it must handle
  it. `PlaybackFailure` gains `not-generated`.
- Closing the player no longer being a stop is a behaviour change to a
  documented ADR 0028 contract, and its e2e coverage changed accordingly.
- Prepare is latest-wins by token, and it now runs a handful of times per
  generation run rather than thousands. It is still a pair of full re-reads per
  call; the race and the loop are closed, the per-call cost is not.
- `untracked()` around a store call is now the rule in this component rather
  than a local fix. A store call added to an effect without it reintroduces the
  loop, and nothing on screen will say so.
- None of this makes an Android media notification appear. Chrome raises one
  only for media longer than roughly five seconds, and each sentence is a
  separate `src`. That needs one continuous stream per reading and is not
  attempted here.

## Alternatives considered

**Make Play act as a stop while waiting.** Rejected: one control with two
meanings depending on a state the learner cannot see. An explicit Stop is
cheaper to understand and fixes the closing-is-the-stop problem at the same
time.

**Let the playback store watch the audio job.** Rejected: playback would depend
on enrichment to answer a question the reader already holds both halves of.

**Keep two bars and merely restyle one.** Rejected: they answer the same
question over the same denominator. Two tracks was the reason neither could be
read.

**Make the track seekable.** Deferred. Jumping to an arbitrary sentence is
worth having, but it needs a real slider contract rather than a `progressbar`
with a click handler, and Next-to-next-available removes the reason it was
urgent.
