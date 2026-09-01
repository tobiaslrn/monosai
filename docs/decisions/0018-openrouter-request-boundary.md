# 0018 — OpenRouter request boundary and error model

Date: 2026-08-19
Status: Accepted

## Context

Milestone 6 introduces the only place Monosai sends an API key anywhere. Four
things had to be settled before writing it: how the specified `AiError` union
fits the repository's existing error convention, how much of the provider ports
to declare while only configuration testing exists, which HTTP shape to use for
speech, and where the retry limits live.

## Decision

### `AiError` keeps the repository's error shape and carries its payload beside it

The AI specification writes the failure model as a payload-carrying union
(`{ kind: 'model-not-found'; modelId: string }`). Every other error in the
codebase is a `DomainErrorBase` with `domain`, `code`, `message`, and an optional
redacted `cause`, which is what `technicalCode()`, the error screen, and the
storage-error copy tables already consume.

`AiError` is therefore `DomainErrorBase<'ai', AiErrorCode>` plus a required
`task` and an optional `detail` record holding `modelId`, `voiceId`,
`capability`, `retryAfterMs`, `status`, `issueCode`, and `correlationId`. No
variant loses information, and the UI reads AI failures the same way it reads
Anki and storage failures.

`detail` is deliberately a closed record of learner-supplied values and
provider-reported numbers. There is no field a response body could be assigned
to, because a field that could hold provider content eventually would.

### 402 has its own variant (revised 2026-09-01)

OpenRouter answers a credit-exhausted account with 402. It was originally mapped
to `authentication`, on the grounds that both send the learner to their
OpenRouter account and the copy named both causes.

That was wrong in practice. The one action an `authentication` failure asks for
is checking the key and saving it again, which a working key does not need and
an empty balance is not fixed by; the reader surfaces that dropped the "or no
remaining credit" half of the wording left no trace of the real cause at all.
402 is now mapped to `credit-exhausted`, the thirteenth variant, whose next step
is adding credit. The specified failure model is amended to match rather than
the mapping bent to fit it: a variant is justified exactly when its recovery
differs, and this one's does.

### Ports declare only what is implemented

`TextGenerationProvider` and `TextToSpeechProvider` carry the names and
semantics from the architecture specification but declare only
`testConfiguration`. `writeStory`, `repairStory`, `reviewExceptions`,
`reviewGrammar`, `translate`, and `synthesize` are added by the milestones that
implement them.

Declaring the full surface now would mean shipping methods that throw or return
placeholder failures, which the project's own rules forbid, and would give
Milestone 7 a signature written before the request it has to make was
understood. The port name and shape are what later milestones need to be
compatible with, and those are fixed here.

### Speech uses the OpenAI-compatible `/audio/speech` shape

OpenRouter does not document one canonical synthesis endpoint. Monosai posts to
`{base}/audio/speech` with `model`, `voice`, `input`, `speed`, and
`response_format: 'mp3'` — the OpenAI-compatible shape most providers behind
OpenRouter expose, and the one whose response is a plain audio body rather than
a base64 payload inside a chat message.

The path is a constant in `openrouter-endpoints.ts` and the request is built in
one adapter, so moving to a different shape is a change in two files. The
compatibility test exists precisely so an incompatible provider fails at
configuration time rather than mid-reading.

A provider that rejects the `speed` parameter is retried once without it and the
result records `speedApplied: false`, which the UI states plainly. The
alternative — silently dropping the option — would let the screen imply a
setting that never took effect.

### Every limit lives in one module

`retry-policy.ts` owns the maximum of two automatic retries, the capped
exponential backoff with jitter, and the refusal to sit through a `Retry-After`
longer than ten seconds. Only `rate-limited`, `provider-unavailable`, and
`timeout` are retried; authentication, unknown models, missing capabilities, and
schema failures are not, because retrying them spends money to reproduce the
same answer.

The bound on format recovery is separate and lives in the text adapter: at most
one recovery request per test, so a failing model costs at most two calls.

### Fingerprints use a key generation, never the key

Configuration tests are stored in ordinary settings rows. A fingerprint
therefore takes the credential's `updatedAt` as a generation counter rather than
the key or a hash of it — a hash of a secret is still derived from the secret.
The counter moves on save, replace, and removal, which is exactly when a stored
test result should stop counting.

The text and TTS fingerprints share no other input, which is what makes their
readiness genuinely independent rather than independent by convention.

## Consequences

- The settings screen can render every provider failure from one exhaustive copy
  table, proved complete by a test over `ALL_AI_ERROR_CODES`.
- Milestones 7 to 9 extend the two ports and the `AiTask` union rather than
  replacing them, and inherit the transport, redaction, and retry guarantees for
  free.
- If OpenRouter's synthesis shape turns out to differ for a provider a learner
  wants, the TTS test fails with `capability-unsupported` and the fix is
  confined to `tts-test.adapter.ts`.
