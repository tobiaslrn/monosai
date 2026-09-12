# 0074 — Provider MP3 preserves speech quality

Date: 2026-09-12
Status: Accepted

Supersedes [ADR 0070](0070-gemini-speech-is-stored-compressed.md).

## Context

Monosai previously requested raw PCM from Gemini-family speech models, encoded it to
24 kbit/s Opus with WebCodecs, and wrote its own WebM container. The resulting clips
were small and decoded successfully in automated checks, but a real listening test
found them metallic, choppy, and echo-like. Decode success and duration checks cannot
establish perceptual speech quality.

The application talks to Gemini through OpenRouter's OpenAI-compatible
`/audio/speech` boundary. That boundary documents MP3 and PCM output, not direct
Google-specific `OGG_OPUS` selection. Adding a separate Google credential and adapter
only to choose that format would expand the product and credential boundary.

## Decision

**Every OpenRouter speech request asks the provider for MP3.** The returned MP3 bytes
are verified as decodable and stored without another lossy encode. Monosai does not
bundle an MP3 encoder and does not locally transcode provider audio.

**Raw Gemini PCM remains a compatibility response.** If the provider returns PCM even
though MP3 was requested, Monosai wraps those samples in a WAV header without changing
them. This costs more storage but does not introduce a lossy quality regression.

**The local Opus encoder, custom WebM muxer, and background re-encoding pass are
removed.** Existing `audio/webm` and `audio/wav` rows remain playable; no existing audio
is rewritten or deleted. New synthesis uses a new storage fingerprint, so a locally
encoded clip is stale and regeneration creates provider MP3. The previous clip can
still play as the same-content fallback until then.

**The configuration-test contract is versioned again.** A model that passed the old
PCM-plus-local-encode preview must produce and decode audio under the provider-MP3
request before it is considered tested under this contract.

Direct Google support may later request `OGG_OPUS` in a dedicated adapter. That is a
separate external-boundary decision; it must not be inferred from the capabilities of
OpenRouter's compatibility endpoint.

## Consequences

- New clips avoid Monosai's audible low-bitrate transcode and custom-container path.
- MP3 storage remains compact without adding an encoder dependency or licence burden.
- A provider that ignores the MP3 request can produce larger WAV clips, deliberately
  preferring fidelity to storage efficiency.
- Existing WebM clips continue to work, but become stale and are replaced only when the
  learner regenerates them.
- Automated tests prove the request, MIME handling, PCM fallback, decode gate, and cache
  invalidation. A human listening test remains necessary for perceptual quality.
