# 0095 — One speech request for every model, corrected by what the provider says

Date: 2026-11-15
Status: Accepted

Partly supersedes [ADR 0040](0040-speech-capabilities-are-declared.md) (Gemini's direction
through the prompt), [ADR 0070](0070-gemini-speech-is-stored-compressed.md) (raw PCM
recognised by model name, at 24 kHz) and [ADR 0075](0075-named-pace-per-voice-model.md) (the
Gemini prefix, the rule that Gemini never receives `speed`, and the three-attempt bound). Keeps
[ADR 0018](0018-openrouter-request-boundary.md)'s rule that the configuration test and
synthesis send the same request, and makes the voice optional.

## Context

OpenRouter's speech endpoint went from a handful of OpenAI-shaped models and Gemini to about
forty models from eighteen providers. Monosai had been written for the first set, and every
difference was keyed on a Gemini model ID: Gemini got its direction prepended to the spoken
text, was asked for PCM, and had its reply wrapped as 24 kHz mono. The catalog no longer helps
tell models apart: every speech model lists an empty `supported_parameters`, and several list
no voices.

Each speech model was called with real requests in November 2026, and each clip was
transcribed and judged by a second model for whether the sentence was read, read correctly,
and nothing else was read. What those requests showed:

- **A direction inside the spoken text is read aloud.** Gemini 3.8 Flash Lite TTS spoke the
  whole prepended direction, a minute of English, instead of the test phrase. OpenRouter now
  takes a top-level `instructions` field that Gemini, OpenAI and Fish Audio receive and the
  other providers ignore. Gemini 3.1, 3.8 Flash and 3.8 Flash Lite all honour it there.
- **Some providers read the `instructions` field aloud too.** Three Fish Audio models
  spoke the whole direction and skipped the sentence; Fish S1 did so on some requests and
  garbled part of it on others; Fish Drama 3 read the context sentences in it aloud before the
  sentence. Without the field all of them read the sentence correctly.
- **Some providers only produce PCM**, and refuse an MP3 request with a 400 that names
  `response_format`: Gemini (24 kHz) and HeyGen (44.1 kHz). The reply declares its rate and
  channels in its content type, `audio/pcm;rate=44100;channels=1`.
- **The first voice a catalog lists is often not Japanese.** Most of these models read
  Japanese with any voice, but those that list Japanese voices sound native with them.
- Some models cannot read Japanese through this endpoint at all, and nothing in the request
  changes that: AssemblyAI (its language list has no Japanese), Orpheus and Sesame CSM, the
  older ElevenLabs Flash v2 and Turbo v2, Deepgram Flux, Voxtral Mini 2603 and Speechify Simba.
  The ElevenLabs Flash v2.5 and Multilingual v2 models read it with occasional misreadings.

## Decision

**Every model gets the same request.** `input` is only the text to speak. The delivery
direction, with the neighbouring sentences as context, goes in `instructions`. `voice` is left
out when none is chosen, and `speed` is sent only when no direction is. Nothing in the request
is keyed on a model ID. The configuration test sends a direction with two fixed neighbouring
sentences, so it sends the same kind of request synthesis does.

**The provider's refusal corrects the request**, as [ADR 0018](0018-openrouter-request-boundary.md)
already did for `instructions` and `speed`, now including the format. A refusal is classified
by the parameter it names first, then by the optional part its message names, and only then by
a mention of the format, because format refusals name the voice ("HeyGen Voice only supports
…") and speed refusals can name the format. Each part changes at most once per request, so a
request takes at most four attempts:
- MP3 is asked for first, because it is stored as it arrives. A format refusal switches to the
  other format.
- The direction is dropped on a refusal that names it, and `speed` is sent instead.
- `speed` is dropped on a refusal that names it.

What a model refused is remembered for the session, per model, in one memory the test and
synthesis share, so the test pays the extra round trips and the sentences after it do not. A
list of PCM-only or speed-less families would go stale the next time a provider is added. A
refusal costs no credit.

**PCM is recognised by the reply, not by the model.** Any `audio/pcm` reply is read at the rate
and channel count its content type declares, resampled to 48 kHz when Opus does not accept that
rate, and compressed as [ADR 0070](0070-gemini-speech-is-stored-compressed.md) describes.
Without an encoder it is stored as WAV at its own rate. No new stored format exists.

**A clip far longer than its text is asked for again, then refused.** A direction read aloud,
or a model repeating itself, produces a clip many times longer than the sentence. The bound is
generous on purpose: six seconds plus 0.6 seconds per character, against the 0.1 to 0.2
seconds per character that natural Japanese takes, so a very slow or very clear reading is
never refused. A clip that carried the direction and runs over the bound is asked for once more
without it. This happens the same way in the configuration test and in synthesis, through one
function. A clip still over the bound fails as invalid audio rather than being stored.

**The test also compares.** A leak can be short enough to fit the bound — the context sentences
alone, or part of the direction. The test is paid once per configuration, so after a clip made
with the direction it also asks for the phrase without it, and keeps the plain clip when the
directed one runs more than twice as long plus a second. On the live clips correct readings with
and without the direction differed by at most a factor of 1.4; the two leaks ran 3.0 and 4.4
times as long. Whichever clip the test keeps decides whether synthesis sends the direction.

**A voice is optional.** A configuration is complete with a model alone, for the models that
list no voices and choose their own; the stored clip and preset record an empty voice. When a
model is chosen, the voice defaults to the first the catalog marks as Japanese by its name
(`jf_`, `ja`, `jp`, `Japanese`), and otherwise to the first listed. An empty voice for Gemini is
still sent as Kore, as before; this is the one model-keyed rule left in the request.

**`SPEECH_INSTRUCTION_VERSION` and `TTS_TEST_VERSION` move once.** Every stored test goes stale
and is previewed again under the new request. Clips made with a direction no longer match the
current cache identity — for Gemini they were made with it read as part of the text — so they
keep playing under [ADR 0072](0072-older-clips-play-until-regenerated.md) until they are
regenerated. Clips made without a direction keep their identity.

## Consequences

- A model that refuses MP3 or `speed` costs one extra, free request per session, and a preview
  that carries the direction costs two clips of the test phrase instead of one.
- A model that reads the direction aloud is found by the preview and then used without
  directions. Speaking style has no effect for it; pace still does, through `speed` where the
  provider accepts it and at playback in any case. If a model reads the direction aloud only
  sometimes, synthesis recovers that sentence without it, and the clip is stored under the
  configuration's identity.
- Gemini can now receive `speed`, but only if it refuses or reads aloud its direction, which no
  current Gemini model does.
- The length bound cannot tell a direction read aloud from a correct reading that happens to be
  very slow. It is set so far above natural speech that the second never reaches it. In
  synthesis it misses a leak short enough to fit under it; the test's comparison is what keeps
  such a model from being sent the direction.
- What a model can do is still only learned from the provider. A model that silently ignores
  the direction is reported as taking it, so it receives no `speed`, and its speaking style and
  pace choices change nothing but the cache identity.
- The models listed above as unable to read Japanese will still pass a preview if they return
  plausible-length audio. Whether a voice sounds right is the learner's to judge from the
  preview, as it always was.
