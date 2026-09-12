# 0073 — Pace at playback, style in the prompt

Date: 2026-09-12
Status: Accepted

Supersedes the pace section of [ADR 0040](0040-speech-capabilities-are-declared.md)
and complements [ADR 0072](0072-older-clips-play-until-regenerated.md).

## Context

The learner's old speed setting was sent to speech providers as a numeric prompt
instruction. Speech is synthesized one sentence at a time, so the model made a
fresh guess about the requested pace for every sentence. In practice, some clips
were normal, some were slow, and some inserted a pause between every word. No
prompt can make that decision consistent across independent requests.

Batching sentences would not solve the underlying problem. Pace could still vary
between batches, and providers do not return timestamps that would let Monosai
split a batch back into sentence clips reliably. Batching would also make one
edited sentence regenerate unrelated audio.

## Decision

### The model speaks naturally; the player controls pace

Speech requests do not contain a numeric speed. The model is asked to speak at a
natural pace, and Monosai applies the learner's local rate with
`HTMLMediaElement.playbackRate` and pitch preservation. The supported rates are
exactly `1`, `0.9`, `0.8`, and `0.7`; `0.7` is the floor because slower playback
sounds clearly artificial. Changing the rate is immediate, free, and applies the
same factor to every sentence without invalidating or regenerating audio.

Newly synthesized rows are marked `pace: 'playback'`. An older row without that
field has baked timing, so it always plays at `1×`; it must not inherit the
learner's current rate. Continuous playback splits a resource at the boundary
between those two pace kinds and reports the actual rate to the media session.

### Named speaking style is a prompt choice

TTS settings store `speechStyle` as `natural`, `clear`, or `very-clear`, with
`clear` as the default. Every instructed request says to speak at a natural pace,
never pronounce mora by mora, and never stretch syllables. The style adds
descriptive articulation and pause guidance, never a number or the word “slow”.
Models without an instruction channel say so in Settings and still remain usable.

The speech instruction version is `speech/4`. The audio options fingerprint
includes the selected style and the local-pace marker, and includes the prompt
version only when the model accepts instructions. A style change therefore
regenerates audio, while a local reading-rate change does not.

### Existing settings migrate without rewriting audio

Schema v16 adds `readerPreferences.playbackRate` by snapping the old TTS speed to
the nearest supported rate; values above `1` become `1`. It removes the old speed
and capability fields from TTS settings and presets, and sets their style to
`clear`. Audio rows are not rewritten: the absent `pace` field already means
their old timing is baked into the clip. Migration is transactional and keeps the
existing recovery path for invalid data.

## Consequences

Every sentence in a reading now has one deterministic local pace, including a
reading that mixes old and newly generated clips. Style remains a provider
quality choice and is visible in the configuration fingerprint, so a style
change is honest about the need to regenerate. Older same-content clips remain
playable under ADR 0072, but baked clips retain their original `1×` behaviour.

The player owns the only reading-speed control: a compact text button that cycles
the four rates and persists the selection in reader preferences. The speech model
preview uses that saved rate, so the preview and the reader describe the same
listening experience.
