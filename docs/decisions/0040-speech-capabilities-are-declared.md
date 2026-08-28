# 0040 — The catalog declares speech capabilities, the probe confirms them

Date: 2026-08-28
Status: Accepted

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

Two overrides live with that function, because both are cases the catalog cannot
state truthfully. OpenRouter lists `speed` for everything it proxies but
documents that a provider without the option ignores it, and Gemini is such a
provider; and Gemini takes its direction through the prompt rather than through a
parameter, which no `supported_parameters` entry can express.

An empty parameter list means **unknown**, not **nothing**. The catalog is
fetched lazily and can be absent when a preview runs, and a missing fetch must
never be read as a model that can do neither. Both channels are then tried and
the provider decides. This keeps the catalog an optimisation and stops it
becoming a dependency of the audio path.

### A test result is measured, stored, and kept out of its own fingerprint

`TtsConfig` carries `attempt: SpeechCapabilities` — what to try. `TtsTest`
returns `speedApplied` and `speechInstructionsApplied` — what worked. Those two
findings are stored beside the configuration as `speedSupported` and
`speechInstructions`, and `ttsFingerprint` carries only what a learner
configures. The fingerprint answers "does the stored test still describe this
configuration"; folding the test's own findings into it made every test
invalidate itself the moment it discovered something.

### No `unknown` capability state

A third stored state would have to be threaded through two fingerprints and made
structurally impossible in synthesis, so modelling it would mean excluding it
again everywhere. It is made impossible instead: `TTS_TEST_VERSION` moves once
with this release, every stored test goes stale exactly once, readiness falls to
"not tested", and `AudioConfigurationService` refuses to synthesise until a
preview has run. The wrong `'unsupported'` cannot take effect in the meantime.

### The pace comes only from the model

`speed` where the provider honours it, the delivery direction where it does not.
No local `playbackRate`, no time-stretching. That is why `PaceControl` has
exactly three values and why a `fixed` model is marked in the picker rather than
locked out: `tts-1` handles `speed` perfectly and is cheap, and a catalog entry
can change.

### One request builder for both paths

`buildSpeechRequestBody` is the only place a speech body is written. ADR 0018
requires the test and synthesis to send the same shape — a test that proved a
body synthesis does not send proves nothing — and two copies were two chances to
drift. Gemini gets a prefixed direction, `pcm`, and no `speed`; everything
OpenAI-compatible gets a top-level `instructions` field.

`provider.options.openai.instructions` is deliberately not hardcoded: it is
unverified, the refusal fallback already covers a provider that rejects the
top-level field, and if a preview shows one does, `speech-request.ts` is the one
file that changes.

### The prompt version does not rise this time

`SPEECH_INSTRUCTION_VERSION` stays at `speech/3`, and the instruction text
changes under it. `speech/3` describes no stored clip, because no request ever
carried an instruction — and the constant sits unconditionally in
`audioOptionsFingerprint`, so raising it would discard every clip a learner has
paid for while correcting nothing. A golden-value test in `cache-keys.spec.ts`
guards that decision.

**This reasoning expires with the first instructed clip.** From then on, every
change to the instruction text must raise the version.

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

`SPEECH_INSTRUCTION_VERSION` remains unconditional in `audioOptionsFingerprint`
even though it is meaningless for uninstructed configurations. Fixing that today
costs a full cache rebuild; it is worth doing the next time the prompt version
rises anyway.

Schema v7 adds `speedSupported` to the voice settings row and to every preset,
seeded from `supportsTtsSpeed(modelId)`. Purely additive: no row loses a field,
and the real value arrives with the re-test this release already forces.
