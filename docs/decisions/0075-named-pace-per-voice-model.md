# 0075 — Named pace per voice model, described in the prompt

Date: 2026-09-13
Status: Accepted

Supersedes the pace-delivery and “never a number or the word slow” parts of
[ADR 0073](0073-pace-at-playback-style-in-prompt.md). It keeps ADR 0073's
decision that older baked-time clips remain playable and that the reader's
player can fine-tune playback locally.

## Context

The old TTS setting used a numeric speed in the provider prompt, then ADR 0073
moved pacing entirely to local playback. The four-step player floor of `0.7`
sounds artificial, but a single local control also leaves instruction-capable
voice models unable to distinguish a deliberate slow reading from a normal one.
Gemini TTS takes directions in its spoken-input prefix, while other providers
expose different subsets of OpenAI-compatible request parameters. The catalog
cannot prove that a provider honours numeric `speed`, because unsupported
parameters may be ignored silently.

## Decision

TTS settings store the named `SpeechPace` choices **Natural**, **Slow**, and
**Very slow** beside the speaking style. The choice is sent consistently for
every sentence through the channel the model can use:

1. An instruction-capable model receives a prose pace description in its
   instruction field. The description says what the pace means, keeps the same
   speaking rate from the first word to the last, and retains the rules not to
   pronounce mora by mora or stretch syllables. It explicitly preserves fluid,
   connected Japanese instead of asking the model to create slowness with added
   silence. Gemini receives the same lines in its prefix, which is not sent as a
   separate `instructions` field.
2. A model without an instruction channel receives the corresponding numeric
   top-level `speed`: `1`, `0.9`, or `0.8`. This is best effort. OpenRouter and
   providers may ignore `speed` silently, so Monosai does not claim that this
   channel was honoured.
3. Gemini never receives numeric `speed`, including when its prefix is omitted.

The player continues to apply its local fine-tuning rate to clips marked
`pace: 'playback'`, but its choices are now `1×`, `0.9×`, and `0.8×`. A change
to the named pace changes the TTS test and audio fingerprints; a change to the
player rate remains immediate and does not regenerate audio. For an
instruction-capable model, speaking style and named pace are both in the
fingerprint. For a model using numeric speed, style is hidden and only the
numeric pace value identifies the request.

The Settings voice card always shows Pace. It shows Speaking style only when a
catalog declaration or the last test says the selected model accepts
instructions. A provider refusal for instructions falls back to a request with
numeric speed when the model is not Gemini; a refusal for speed falls back once
more to a request without speed. There are at most three attempts.

Speaking style controls articulation only. Clearer styles request more precise
sound definition without word separation, over-enunciation, or additional
pauses. Pace controls the model's speaking rate only. Every combination asks for
brief pauses at punctuation or natural clause boundaries and forbids inserted
silence between words or morae, so the two controls do not amplify one another.

Schema v17 adds `speechPace: 'natural'` to the TTS settings row and every
preset, and converts a v16 reader preference of `0.7` to `0.8`. The migration is
transactional and leaves audio rows untouched. Malformed stored data follows
the existing recovery path and never resets the local database.

## Consequences

The learner chooses a meaningful pace once per voice model, while every request
uses the same named description or numeric value. Instruction-capable models can
produce a pace that is independent of browser playback, and providers that
silently ignore `speed` remain usable with an honest best-effort contract.

Existing audio remains available under the content-hash fallback. Newly
generated audio uses the current named pace, and local playback remains a
separate control for small, immediate adjustments.
