# 0040 — The catalog declares speech capabilities, the probe confirms them

Date: 2026-08-28
Status: Accepted, partly superseded by [ADR 0073](0073-pace-at-playback-style-in-prompt.md)

Extends [ADR 0018](0018-openrouter-request-boundary.md) in how a speech
capability is decided. The refusal fallback that ADR established is kept exactly
as it was; what changes is what the first request tries.

## Context

Monosai reads Japanese aloud to beginners, and beginners need it slower and
clearer than a model's default. Three findings in the code decided the shape of
this change.

**The delivery instructions were dead code.** `DEFAULT_TTS_SETTINGS.speech
Instructions` was `'unsupported'`, and both the configuration test and synthesis
sent an instruction only when that value was already `'supported'`. Nothing ever
set it, and schema v6 wrote `'unsupported'` onto every existing row. No model had
ever received a delivery instruction.

**The provider already answers the question.** The model catalog fetches
`supported_parameters` from OpenRouter and carries it through the domain, and
nobody read it. Discovering a capability by failing, while the provider declares
it, was the actual design fault.

**A test result was being used as a test input.** `TtsConfig.speechInstructions`
was both what the test was told to try and what the test had previously found,
and it sat in `ttsFingerprint`. A test that learned "instructions are refused"
wrote that finding into the fingerprint of the configuration it had just tested,
so the finding could never be revisited and the test appeared stale against
itself.

## Decision

### The catalog leads and the probe confirms

`declaredSpeechCapabilities(modelId, supportedParameters)` is the single place
that decides which optional channels a speech request may use. The configuration
test attempts exactly those, and a provider's own refusal — already mapped to a
`capability` by the error mapping — corrects a wrong declaration at the cost of
one extra request.

One override lives with that function, because the catalog cannot state it
truthfully: Gemini takes its delivery direction through the prompt rather than
through a parameter, which no `supported_parameters` entry can express. Numeric
pace is no longer a speech capability; [ADR 0073](0073-pace-at-playback-style-in-prompt.md)
moves it to local playback.

An empty parameter list means **unknown**, not **nothing**. The catalog is
fetched lazily and can be absent when a preview runs, and a missing fetch must
never be read as a model that can do neither. The instruction channel is then
tried and the provider decides. This keeps the catalog an optimisation and stops it
becoming a dependency of the audio path.

### A test result is measured, stored, and kept out of its own fingerprint

`TtsConfig` carries `attempt: SpeechCapabilities` — what to try. `TtsTest`
returns `speechInstructionsApplied` — what worked. That finding is stored beside
the configuration as `speechInstructions`, while `ttsFingerprint` carries the
configured model, voice, and speaking style. The fingerprint answers "does the
stored test still describe this configuration"; folding the test's own finding
into it made every test invalidate itself the moment it discovered something.

### No `unknown` capability state

A third stored state would have to be threaded through two fingerprints and made
structurally impossible in synthesis, so modelling it would mean excluding it
again everywhere. It is made impossible instead: `TTS_TEST_VERSION` moves once
with this release, every stored test goes stale exactly once, readiness falls to
"not tested", and `AudioConfigurationService` refuses to synthesise until a
preview has run. The wrong `'unsupported'` cannot take effect in the meantime.

### Pace is now local; style remains prompted

This section is superseded by [ADR 0073](0073-pace-at-playback-style-in-prompt.md).
The capability boundary and refusal fallback remain: a model may accept prompted
speaking style or may report that it cannot. Numeric speed and `PaceControl` no
longer exist. New clips are natural-paced source audio marked for local
playback; legacy clips retain their baked timing.

### One request builder for both paths

`buildSpeechRequestBody` is the only place a speech body is written. ADR 0018
requires the test and synthesis to send the same shape — a test that proved a
body synthesis does not send proves nothing — and two copies were two chances to
drift. Gemini gets a prefixed style direction, `pcm`, and no `speed` parameter;
OpenAI-compatible gets a top-level `instructions` field.

`provider.options.openai.instructions` is deliberately not hardcoded: it is
unverified, the refusal fallback already covers a provider that rejects the
top-level field, and if a preview shows one does, `speech-request.ts` is the one
file that changes.

### Prompt changes are versioned for instructed models

The first instructed style request raised `SPEECH_INSTRUCTION_VERSION` to
`speech/4`. Its value is part of `audioOptionsFingerprint` only when
instructions are supported, so an uninstructed model does not lose its cache for
a prompt change it never receives. Every future learner-facing change to the
instruction text raises that version.

## Consequences

`speechInstructionsApplied` is a statement about the request, not the result: for
Gemini it means the direction was in the prompt, elsewhere it means the field was
not refused. Whether a model obeyed it can only be heard, which is why the
preview plays a clip.

Contextual cache keys still include the neighbouring content hashes whenever
instructions are supported, while the compact Gemini prefix carries no
neighbours. A Gemini clip is therefore re-synthesised when an adjacent sentence
changes even though that sentence never reached the model. This over-discriminates
in the safe direction and is accepted rather than paid for with a second
instruction-shape concept in the cache key.

The audio options fingerprint also records the named speaking style and the
`pace: 'playback'` contract. Schema v7 historically added `speedSupported` to
the voice settings row and every preset; schema v16 removes those fields,
creates the reader playback preference, and leaves old audio bytes untouched.
