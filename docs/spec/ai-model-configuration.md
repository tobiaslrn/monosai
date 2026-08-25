# AI model configuration and capability routing

Status: **proposed** — not yet implemented.

On acceptance this document becomes authoritative for AI provider configuration
and supersedes:

- [ADR 0030 — Unified model selection and scoped overrides](../decisions/0030-unified-model-selection.md);
- [AI pipelines](ai-pipelines.md) §1 *Provider boundary* and §2 *Configuration*, and the
  configuration paragraphs of §11 *Audio/TTS*;
- [UX/UI specification](ux-ui-specification.md) §10 *Models*.

Everything not named above is unchanged. Prompt layering, the story contract, the
generation state machine, repair limits, retry policy, whole-reading preparation,
and playback behaviour all keep their current definitions.

---

## 1. Why this exists

### 1.1 The learner-visible problem

Monosai asks the learner to classify a model before it knows anything about it.
[`models-section.component.ts`](../../src/app/features/settings/models-section.component.ts)
opens an **Add model** menu whose first choice is *Text model* or *Audio model*,
and the two answers lead to two different records — `TextModelPreset` and
`TtsPreset` — that are joined back together by string equality on `modelId` to
render one row. The learner is asked to answer a question the provider can answer
better, and the data model then has to undo the answer.

The classification is also wrong in the one case that matters most. Gemini TTS
through OpenRouter does not advertise voices, so the *Audio model* branch carries
an explicit `isGeminiTtsModel` escape hatch in the dialog
([`add-model-dialog.component.ts:387`](../../src/app/features/settings/add-model-dialog.component.ts))
so that the save button is reachable at all. A provider-family check has leaked
into the UI because the general rule — *catalogue metadata is not authoritative* —
was never stated.

### 1.2 Two concrete defects the current shape produces

**Defect A — a refused `speed` is forgotten on reload.** The TTS test returns
`speedApplied` and the synthesizer degrades correctly when a provider rejects the
parameter, but the flag lives only in a signal
([`tts.store.ts:52`](../../src/app/application/settings/tts.store.ts)) and is never
written to `TtsPreset`. After a page reload the settings screen shows a speed
slider that looks effective and is not, for every provider that ignores it.

**Defect B — speed invalidates the audio cache even when it was never sent.**
`audioOptionsFingerprint` always hashes the learner's `speed`
([`cache-keys.ts`](../../src/app/domain/enrichment/cache-keys.ts)), while synthesis
omits the parameter for providers that refuse it
([`tts-synthesis.adapter.ts:39`](../../src/app/infrastructure/openrouter/tts-synthesis.adapter.ts)).
For a Gemini TTS user, moving the speed slider from 1.0 to 1.2 changes every audio
cache key while producing byte-identical requests: a whole reading's prepared
audio becomes unreachable and has to be paid for again to obtain the same clips.

Both defects have the same root cause: **what the provider actually accepted is
computed and then thrown away.** It is not a persisted, first-class fact.

### 1.3 The structural problem

[`openrouter.providers.ts`](../../src/app/infrastructure/openrouter/openrouter.providers.ts)
binds `TEXT_GENERATION_PROVIDER` and `TEXT_TO_SPEECH_PROVIDER` to OpenRouter for
the whole injector. There is exactly one credential
([`CredentialRepository`](../../src/app/domain/settings/credential-repository.ts) has
no notion of *which* endpoint a key belongs to) and one endpoint. A second
provider — a local Ollama, an OpenAI-compatible server, a second cloud account —
cannot be expressed at all.

### 1.4 What is already right and must survive

This design keeps, rather than replaces, four existing mechanisms that are good:

- **Evidence over flags.** Readiness is derived by comparing a stored fingerprint
  with the current one
  ([`configuration-readiness.ts`](../../src/app/domain/ai/configuration-readiness.ts)),
  so a configuration cannot drift out of agreement with its own test.
- **Negotiation with bounded fallback.** The TTS tester and synthesizer already
  retry once per optional parameter and report the degraded shape instead of
  pretending. This design promotes that pattern to the general rule.
- **No unrequested spend.** Nothing reaches a provider except on an explicit
  action. Opening settings, typing an ID, and adding a model stay free.
- **Cache keys hold no secrets and no route identity.** They are derived from the
  model, voice, options, and content only.

---

## 2. Use cases

The design is judged against these. Each names the outcome it must produce.

| # | Situation | Required outcome |
| --- | --- | --- |
| 1 | First launch, no key. Learner pastes Japanese and reads. | AI setup is never encountered. No AI panel blocks or nags the reading path. |
| 2 | Learner wants generated stories and nothing else. | Key → pick model → **Test** → done. Four interactions, no capability vocabulary, no text/audio question. |
| 3 | Learner adds audio later. | The AI screen shows which registered models can read aloud, and for the ones that cannot, one line saying why. |
| 4 | One model family does everything (Gemini text + Gemini TTS). | Two registered models cover four features. Assignment is suggested, not typed. |
| 5 | Cost split: strong model for stories, cheap model for translation. | Four independent feature assignments, changed in one click each. |
| 6 | Learner wants to try a different model for *one* story. | Per-request override remains, captured before the request, recorded in provenance, does not change any default. |
| 7 | API key replaced or removed. | All evidence for that connection goes stale. Nothing stored is deleted. Existing readings, translations, and clips stay usable. |
| 8 | Learner deletes the model that reading audio uses. | That feature becomes unconfigured with a named next action. No silent promotion of another model. Cached clips still play. |
| 9 | Offline. | Routes and evidence are readable, probes are unavailable and say so, reading and cached audio are unaffected. |
| 10 | A model is registered whose metadata claims no audio, but which does speak (Gemini TTS). | The learner can run the speech probe anyway; the probe decides. No provider-family branch in the UI. |
| 11 | A speech model produces well-formed audio that is not Japanese, or is unpleasant. | A machine check cannot catch this. The probe hands the learner a playable sample before assignment. |
| 12 | Learner assigns a text-only model to reading audio. | Not offered. The reason is one line, on demand, not a wall of metadata. |
| 13 | *(future)* Local Ollama for text, cloud for speech. | Two connections, four routes, no change to feature code, prompts, provenance, or cache identity. |

Non-goals, stated so they are not designed around: automatic model selection by
cost or quality, spend dashboards, prompt editing, user-supplied provider plugins,
and model marketplaces.

---

## 3. The model of the world

Three persisted concepts replace the current two preset lists.

```
Connection ──< ModelProfile ──< CapabilityEvidence
                    ▲
                    │ (referenced by id)
              FeatureRoute × 4
```

### 3.1 `Connection`

Where models run and how Monosai authenticates.

```ts
export type ConnectionKind = 'openrouter';           // one entry per built-in adapter

export interface Connection {
  readonly id: ConnectionId;
  readonly kind: ConnectionKind;
  /** Learner-visible label. Defaults to the adapter's product name. */
  readonly label: string;
  /** Adapter-defined, validated by the adapter's own schema. Never holds a secret. */
  readonly endpoint: CanonicalRecord;
  readonly createdAt: number;
}
```

The credential is **not** part of the record. `CredentialRepository` gains a
connection id on every method, so a key is stored, replaced, removed, and used per
connection and still never reaches a component, a log, or a fingerprint.

`ConnectionKind` is a closed union over adapters compiled into the build. There is
no user-installed provider code; a new provider is a reviewed adapter plus one
union member.

### 3.2 `ModelProfile`

One model as the learner intends to use it, with its options and its evidence.

```ts
export interface ModelProfile {
  readonly id: ModelProfileId;
  readonly connectionId: ConnectionId;
  /** Exact provider model ID. No aliases, no fuzzy matching. */
  readonly providerModelId: string;
  readonly label: string;
  readonly text: TextOptions | null;      // null until the learner configures text use
  readonly speech: SpeechOptions | null;  // null until the learner configures speech use
  readonly declared: DeclaredCapabilities | null;   // catalogue metadata, advisory
  readonly evidence: readonly CapabilityEvidence[];
  readonly createdAt: number;
}

export interface TextOptions {
  readonly reasoningEffort: string | null;
}

export interface SpeechOptions {
  readonly voiceId: string;
  /** Learner listening preference, 0.5–2.0. Delivery is decided by evidence. */
  readonly speed: number;
}
```

One profile is one model **plus one set of options**. A learner who wants the same
TTS model with two voices registers two profiles — "Gemini TTS (Kore)" and "Gemini
TTS (Puck)" — which is how people describe them anyway. There is no separate
configuration entity, and no join to render a row.

The `text` / `speech` fields are not a classification the learner makes up front.
They are filled in by whichever probes were run: registering a model and probing
speech populates `speech` and leaves `text` null. Both may be populated.

### 3.3 `FeatureRoute`

Which profile powers each learner-facing feature.

```ts
export type AiFeature = 'story' | 'translation' | 'grammar' | 'speech';

export interface FeatureRoutes {
  readonly story: ModelProfileId | null;
  /** null means "use whatever story uses". */
  readonly translation: ModelProfileId | null;
  readonly grammar: ModelProfileId | null;
  readonly speech: ModelProfileId | null;   // never inherits
  readonly updatedAt: number;
}
```

`null` on `translation` and `grammar` is a plain fallback to `story`, exactly as
`grammarPresetId ?? activePresetId` works today. It is not a general inheritance
graph and does not chain: `speech` has no fallback, and a null `story` is simply
unconfigured.

Tasks map onto features as follows; the mapping is exhaustive over `AiTask` and is
unit-tested as such.

| `AiTask` | Feature |
| --- | --- |
| `story-generation`, `story-repair`, `exception-review` | `story` |
| `translation` | `translation` |
| `grammar-review` | `grammar` |
| `tts-synthesis` | `speech` |
| `model-discovery`, `text-model-test`, `tts-test` | none — routed by the profile under test |

---

## 4. The capability model

A capability is **not a property of a model**. It is the outcome of a negotiation
between what Monosai asks for and what an endpoint accepted, recorded together
with the shape it settled on. Four kinds of knowledge, ranked, and never mixed:

1. **Declared** — provider catalogue metadata. *Advisory only.* It pre-fills
   fields, hides inapplicable controls, and suggests which probe to offer. It
   never gates anything, because it is wrong in exactly the cases that matter.
2. **Proven** — the outcome of a probe Monosai ran against this exact endpoint,
   model, and options. *Authoritative.* Only proven capability makes a profile
   assignable to a feature.
3. **Negotiated** — the request shape the probe settled on after degradation:
   which optional parameters survived, which format came back, which voice was
   used. *Persisted*, and shown to the learner in plain words. This is the fix for
   Defect A.
4. **Quirks** — provider-specific request and response adaptations, such as
   Gemini's PCM response needing a WAV container, or its `Kore` default voice.
   These live in **one file per adapter**, keyed by a documented match rule, and
   never appear in `domain/` or in a component. This retires
   [`domain/ai/tts-configuration.ts`](../../src/app/domain/ai/tts-configuration.ts).

### 4.1 Capabilities

There are two, deliberately. More would be a taxonomy nobody maintains.

```ts
export type CapabilityId = 'structured-text' | 'japanese-speech';
```

`structured-text` is required by `story`, `translation`, and `grammar`.
`japanese-speech` is required by `speech`. A feature's requirement is a constant,
not a computed vector; there is no capability-matching engine.

Differences between the three text features are **limits**, not capabilities: a
short-context model is a warning on the story route, not a different capability.

### 4.2 Evidence

```ts
export interface CapabilityEvidence {
  readonly capability: CapabilityId;
  readonly outcome: 'passed' | 'failed';
  readonly fingerprint: string;
  readonly probedAt: number;
  readonly probeVersion: number;
  readonly negotiated: NegotiatedText | NegotiatedSpeech | null;  // null when failed
  /** Redacted classification of the failure, for the row's explanation. */
  readonly failure: { readonly code: AiErrorCode; readonly capability?: string } | null;
}
```

Readiness stays derived, reusing
[`readinessOf`](../../src/app/domain/ai/configuration-readiness.ts) unchanged, per
(profile, capability): `not-configured` → `untested` → `stale` → `ready` /
`failed`. A profile row can therefore read *"Story: ready · Reading audio: needs
retest"* without a second state machine.

### 4.3 Probes

A probe is **the real request the feature sends, at its smallest**. It is not an
abstract capability check, and it is never run implicitly.

- `structured-text` — the existing minimal structured task. Proves
  authentication, model access, decoding, and structured-output behaviour; records
  the mode it settled on.
- `japanese-speech` — the existing fixed phrase `これはテストです。`. Proves
  authentication, voice validity, a storable and *browser-decodable* clip, and
  which optional parameters survived. Returns the clip.

Each probe degrades along an ordered ladder, one retry per optional parameter, and
records where it stopped. It never degrades a *required* element into success: an
unusable voice or an undecodable clip is a failure, not a fallback.

---

## 5. Speech: the restriction analysis

Speech is where provider variation is widest and where metadata is least
trustworthy. Each axis below states what varies, how Monosai learns it, what it
does when the answer is *no*, and what the learner is told.

### 5.1 The axes

| Axis | Variation across real providers | How Monosai learns it | Degradation | Learner-visible |
| --- | --- | --- | --- | --- |
| **Speaks at all** | OpenAI audio models, Gemini TTS, dedicated speech engines, local Piper; some advertise `audio` output, Gemini via OpenRouter advertises neither audio nor voices | Probe only. Declared metadata pre-selects which probe to *offer*, never whether it may run | none — this is required | "Reading audio: ready / not supported by this model" |
| **Voice identity** | Enumerated list (OpenAI); named but unlisted (Gemini); file-backed (local); none (single-voice engines) | `declared.voices`; else free text; else the adapter's quirk default | Empty voice with no quirk default is a probe failure, not a guess | Select when a list exists, text field with the adapter's suggested default when not |
| **Speed** | `speed` honoured (OpenAI); rejected or silently ignored (Gemini TTS); native scale (local Piper) | Probe attempts the configured speed and records whether it survived | **Playback delivery**: the clip is synthesized at provider default and the player applies `playbackRate` with pitch preservation | "Speed is applied during playback for this model" — not a slider that looks effective and is not |
| **Contextual delivery** | `instructions` parameter (OpenAI 4o-mini-tts); prompt-steered (Gemini); none (older and most local engines) | `declared.supportedParameters`, then probe with one fallback | Exact-text synthesis, which is the current behaviour for unproven models | Badge reads **Context-aware speech** or **Basic speech** |
| **Response format** | MP3, WAV, raw 24 kHz 16-bit mono PCM (Gemini), Opus/AAC | Probe requests the preferred format and inspects what came back | Format ladder: preferred → any format the adapter can normalise → any format the browser proves it can decode | Only on failure: "returned audio Monosai cannot store" |
| **Browser decodability** | A well-formed file Chrome cannot decode is possible | `AudioDecoder.canDecode` during the probe, before anything is stored | none — required | Probe failure with `audio-invalid` |
| **Language** | An engine may produce fluent non-Japanese, or unnatural Japanese, without any error | **Not machine-checkable.** The probe returns a playable sample | none | The sample player sits next to Assign with one line: automatic checks cannot judge pronunciation |
| **Input length** | OpenAI caps TTS input around 4k characters; local engines cap lower | `declared.maxInputCharacters` when present, else recorded from probe failure | Sentence-level synthesis is already far below any known cap; a sentence exceeding a recorded cap fails that sentence and stops the job, as today | Only on failure |
| **Delivery mode** | Stored clip (all cloud TTS, local Piper) vs. spoken live at playback (browser `SpeechSynthesis`) | Adapter constant, not a probe | **Not supported in this design** — see §12 | n/a |

### 5.2 Negotiated speech

```ts
export interface NegotiatedSpeech {
  /** After quirk-default resolution — the voice actually sent. */
  readonly voiceId: string;
  readonly requestedFormat: string;
  /** What the clip is stored as after adapter normalisation. */
  readonly storedMimeType: AudioMimeType;
  readonly speedDelivery: 'provider' | 'playback';
  readonly contextDelivery: 'instructions' | 'none';
  readonly maxInputCharacters: number | null;
}
```

This record is the whole point of the redesign. It is persisted with the evidence,
it drives the badges, it drives the cache key, and it drives whether the player
sets a rate. Defect A disappears because `speedDelivery` survives a reload.

### 5.3 Speed delivery, precisely

- The probe sends the configured `speed`. If the endpoint refuses the parameter,
  the probe retries once without it and records `speedDelivery: 'playback'`.
- Synthesis sends `speed` **only** when evidence says `provider`.
- `AudioPlayer` gains `setRate(rate: number)`; the browser implementation sets
  `playbackRate` and `preservesPitch = true`. The playback store applies the
  profile's speed when and only when `speedDelivery` is `'playback'`. The settings
  sample player uses the same rule, so the sample sounds like the reader will.
- Monosai's bounds stay 0.5–2.0, comfortably inside every known provider range, so
  a *range* rejection is not an expected case; a rejection is treated as
  parameter-unsupported.

Consequence: **speed becomes free to change.** No re-test, and for
playback-delivered models no cache invalidation.

### 5.4 The sample is part of the contract

`japanese-speech` evidence is only meaningful to a person who has heard it. The
probe result panel therefore shows, in this order: the negotiated summary in plain
words, a **Play sample** button (explicit action, no autoplay, consistent with the
reader's activation rules), and then **Assign to reading audio**.

Assignment does not *require* playing the sample — that would be friction for a
learner re-testing a model they already trust — but the sample is the most
prominent element of a passing speech probe, with the line *"Automatic checks
cannot judge pronunciation. Listen before assigning."*

---

## 6. Text: the restriction analysis

Narrower, and mostly already handled.

| Axis | Variation | How learned | Degradation |
| --- | --- | --- | --- |
| Structured output | Provider-native schema; JSON-contract only; refuses `response_format` entirely | Probe, recording `StructuredOutputMode` | Native → strict JSON contract plus one format-recovery request, as today. Neither working is a probe failure |
| Reasoning effort | Enumerated efforts; mandatory reasoning; none | `declared.reasoning` | Effort omitted when unsupported. The quirk table may supply an adapter default |
| Context length | 8k to 1M+ | `declared.contextLength` | **Advisory warning on the story route only** when below the story token budget. Never blocks |
| Completion budget | — | Not a model property | The story token budget moves out of model registration into **Generation** settings, where it belongs: it is request policy, bounded 4,096–32,768, default 16,384 |

```ts
export interface NegotiatedText {
  readonly structuredOutput: StructuredOutputMode;
  readonly reasoningEffort: string | null;
  readonly contextLength: number | null;
}
```

---

## 7. Routing

### 7.1 Resolution

```ts
export type RouteResolution =
  | { readonly kind: 'resolved'; readonly request: ResolvedRequestConfig }
  | { readonly kind: 'unconfigured' }
  | { readonly kind: 'profile-missing'; readonly feature: AiFeature }
  | { readonly kind: 'untested' | 'stale' | 'failed'; readonly profile: ModelProfile }
  | { readonly kind: 'no-credential'; readonly connection: Connection };
```

Every variant has its own copy and its own next action; the union is exhaustive
and the UI is required to handle each. This replaces today's single
`capability-unsupported` error carrying prose in `message`.

Rules:

- Resolution is deterministic. Monosai never picks a substitute model, never falls
  back to another connection, and never re-routes mid-request.
- `translation` and `grammar` resolve their own route, else `story`'s.
- Deleting a profile clears every route that referenced it — preserving ADR 0030's
  rule — and never promotes a replacement.
- Deleting a connection deletes its profiles and clears their routes. Both are
  two-step confirmations naming what will be cleared.

### 7.2 Capture before work

The route is resolved **once**, before any network work, into an immutable
`ResolvedRequestConfig` that is passed down through the job. A route changed
mid-generation does not affect the run in flight. This is today's behaviour in
[`audio-configuration.service.ts`](../../src/app/application/enrichment/audio-configuration.service.ts)
and it is preserved verbatim, only with routes as the input.

### 7.3 Per-request override — kept

ADR 0030's scoped override stays. Story generation and the reader's audio surface
each keep a compact selector over profiles with passing evidence for that feature,
marked with which one is the route default. It affects one request, is recorded in
provenance and cache identity, and writes no setting.

What changes is prominence, not existence: it is a quiet control beside the
action, not a decision the learner is asked to make every time. Trying a cheaper
model for one story is ordinary behaviour for this audience and the provenance
model already records it exactly.

---

## 8. Identity: provenance, fingerprints, cache keys

The single hard constraint: **no learner loses stored content to this refactor.**

### 8.1 Fingerprints

Fingerprint inputs change in three ways:

- `keyGeneration` becomes the credential generation **of the profile's
  connection**, so replacing one connection's key cannot stale another's.
- `connectionKind` joins the hash, because the same model ID at two endpoints is
  two different things.
- Speech: `speed` is included **only when the last evidence says
  `speedDelivery: 'provider'`**; when it says `'playback'`, speed is `null`.
  Without evidence the configured value is used and readiness is `untested`
  anyway. This is well-defined and non-circular.

`AI_ENDPOINT_VERSION` and the per-probe versions keep their existing role.
`TTS_TEST_VERSION` bumps, which marks all existing speech evidence stale: one
**Test** press per speech profile after upgrading.

### 8.2 Cache keys

Cache keys must stay stable for existing installs. `canonicalJson` omits
`undefined` properties, so an optional field added as `undefined` for the existing
provider hashes byte-for-byte identically to today.

- `translationCacheKey`, `grammarCacheKey`, `audioCacheKey`, and
  `audioOptionsFingerprint` each gain an optional `providerScope?: string`, passed
  as `undefined` for `openrouter` and as the connection kind for any future
  adapter. Every existing key is preserved; a future local model cannot collide
  with a cloud model of the same name.
- `audioOptionsFingerprint` takes `speed: number | null` plus a `speedDelivery`
  field, with speed `null` under playback delivery.

**The one accepted regression, stated plainly.** Because `speedApplied` was never
persisted (Defect A), Monosai cannot know retroactively which stored clips were
made by a provider that ignored speed, so historical keys cannot be rewritten
correctly. After upgrading and re-testing, a speech profile found to be
playback-delivered derives keys without speed; readings prepared under the old key
at a *different* speed will miss cache once. That is no worse than today — where
any speed change already invalidated them — and from then on speed changes are
free. **No stored clip is deleted.** Orphans are reclaimed by the existing *Clear
audio cache* action.

### 8.3 Provenance

`GenerationProvenance` continues to record the provider model ID, options, and
prompt versions. It additionally records `connectionKind`, so a reading generated
against a local model is distinguishable from one generated against a cloud model
of the same name. Route and profile IDs are **not** recorded: they are local
bookkeeping that can be renamed or deleted, and provenance must stay meaningful
after they are.

---

## 9. The extension seam

### 9.1 Adapter contract

```ts
export interface ProviderAdapter {
  readonly kind: ConnectionKind;
  readonly displayName: string;

  /** Validates the endpoint shape and, when a key is present, that it works. */
  validateConnection(connection: Connection, signal?: AbortSignal): Promise<Result<ConnectionStatus, AiError>>;

  /** Advisory metadata for one exact model ID. */
  describe(connection: Connection, modelId: string, signal?: AbortSignal): Promise<Result<DeclaredCapabilities, AiError>>;

  /** Optional. Absent for adapters with no listable catalogue. */
  list?(connection: Connection, signal?: AbortSignal): Promise<Result<readonly CatalogEntry[], AiError>>;

  probe(capability: CapabilityId, profile: ModelProfile, signal?: AbortSignal): Promise<Result<ProbeOutcome, AiError>>;

  text?: TextGenerationProvider;    // existing port, unchanged
  speech?: SpeechProvider;          // existing port, unchanged
}
```

`AI_ADAPTERS` is a multi-provider injection token. `TEXT_GENERATION_PROVIDER` and
`TEXT_TO_SPEECH_PROVIDER` are replaced by an `AiTaskRouter` that resolves the
feature route and dispatches to the owning adapter. **Every port below the router
is unchanged**, which is what keeps this refactor out of the pipelines.

Adding a provider is: one adapter directory, one `ConnectionKind` member, one
quirk table, and the shared contract test suite. No feature, prompt, provenance,
or persistence change.

### 9.2 Catalogue browsing is new infrastructure, not a UI change

Today's [`ModelCatalog`](../../src/app/domain/ai/model-catalog.ts) has only
`discover(modelId)` — a single-model lookup. "Browse the catalogue" means a new
`list()` method, OpenRouter's large `/models` payload, a bounded cache, an offline
path, and a completely different endpoint for a local connection.

It is therefore **stage 4** (§13), not part of the core change. Until then the
add-model flow is exact-ID entry plus **Discover**, which is what exists and works.

### 9.3 What a local connection will have to answer

Named now so the seam is honest rather than assumed:

- **Reachability.** A PWA served over HTTPS calling `http://localhost:11434` hits
  mixed-content blocking and Private Network Access preflight. `validateConnection`
  must produce a specific, actionable failure for this, not `provider-unavailable`.
- **No credential.** `CredentialRepository` must tolerate a connection with no
  key; `keyGeneration` for such a connection is a constant.
- **No speech.** Ollama's OpenAI-compatible surface has no speech endpoint, so such
  an adapter exposes `text` and not `speech`, and the speech probe is not offered
  for its profiles.
- **Weaker structured output.** Local models fail native schemas more often, so the
  JSON-contract path and format recovery carry more weight — they already exist and
  are already tested.

The first local adapter should be **OpenAI-compatible**, because Ollama, LM Studio,
and llama.cpp all speak it. Until one exists the connection layer has a single
implementation, so §13 sequences it last and deliberately: an abstraction with one
implementation is not yet proven.

---

## 10. Interface

### 10.1 Placement

Settings gains one **AI** section replacing *Models*, with three panels in this
order: **Uses**, **Models**, **Connections**. Routing first, because it is what a
returning learner comes to change; connections last, because they are set once.

Reading is never gated by any of it. With nothing configured, the AI section shows
a single **Connect a provider** card and the rest of the app is unchanged.

### 10.2 Uses

Four rows, one per feature: **Story**, **Translation**, **Grammar**, **Reading
audio**. Each row shows the assigned profile name, its evidence state, and a
**Change** control. Translation and Grammar rows show *"Same as Story"* when unset
— the fallback is visible, not hidden.

**Change** opens a compact list of profiles with passing evidence for that feature
only. Profiles without it are not listed; a collapsed *"3 models can't do this"*
disclosure names each with one line — *"Text only"*, *"Speech probe failed: voice
not accepted"*, *"Needs retest"* — and a direct action to fix it.

Changing a route saves immediately, affects nothing else, and never silently
alters another route.

### 10.3 Models

One list of registered profiles. Each row: label, exact model ID under a
disclosure, connection when more than one exists, capability badges reflecting
**proven** evidence only, and the routes it currently serves.

Badges are honest about the negotiated shape:

- **Story · Translation · Grammar** — from passing `structured-text`.
- **Basic speech** / **Context-aware speech** — from passing `japanese-speech` and
  its `contextDelivery`.
- **Needs retest** when evidence is stale.

Row actions are consistent: **Test**, **Edit**, **Remove**. Negotiated facts appear
as sentences, not fields: *"Speed applied during playback"*, *"Returns WAV"*.

### 10.4 Adding a model

The flow, with the text/audio question removed:

1. Pick a connection (skipped when there is one).
2. Enter the exact model ID. **Discover** fetches advisory metadata; it is
   optional and skippable — a model that discovery does not know can still be
   registered and probed.
3. Options appear for what is applicable: reasoning effort when the catalogue
   lists efforts; voice as a **select** when voices are listed and a **text field
   with the adapter's suggested default** when they are not; speed always, with
   its delivery determined later by the probe.
4. **Test** offers the probes the metadata suggests, and always offers *"Test
   speech anyway"* when speech metadata is absent. This single rule replaces the
   Gemini branch in the dialog: metadata is advisory, the learner may probe
   anything, the probe decides. **Use case 10, solved generically.**
5. The result panel states what was proven and what was negotiated, plays a sample
   for speech, and offers **Save** with suggested route assignments pre-ticked.
   The learner reviews and confirms; nothing is assigned silently.

No provider request happens before step 2's explicit **Discover** or step 4's
explicit **Test**.

### 10.5 Connections

Label, endpoint summary, credential state, model count, connection status. The
credential is a password input showing a masked placeholder when configured, with
**Replace** and **Remove** beside it and no reveal, no copy, and no "Saved" text
duplicating what the mask already says.

### 10.6 Accessibility and responsive requirements

- Every state is text, never colour alone; badges carry words.
- Probe progress and outcome are announced through a live region; the sample
  player is an explicit control that never autoplays.
- The **Change** overlay follows the shared overlay contract: keyboard access,
  visible focus, Escape, outside click, focus return, correct ARIA state, and
  close after action.
- 320 px reflow with no horizontal overflow; touch targets meet the shared
  minimum; verified in light and dark at desktop and Android viewports.

---

## 11. Persistence and migration

Dexie **version 7**. Committed versions stay immutable; this adds one entry.

New settings rows, each one validated payload per concern, consistent with the
existing key/value `settings` table:

| Key | Payload |
| --- | --- |
| `ai-connections` | `readonly Connection[]` |
| `ai-model-profiles` | `readonly ModelProfile[]` |
| `ai-feature-routes` | `FeatureRoutes` |

`credentials` gains a connection-scoped key. Table shapes are otherwise unchanged,
so no index or primary-key change is required.

### 11.1 Upgrade, in one transaction

1. Create one `Connection` of kind `openrouter`, id `openrouter-default`, from the
   existing key. Re-key the stored credential to it.
2. For each `TextModelPreset`: one `ModelProfile` with `text` options and, when its
   `lastTestFingerprint` is non-null, one `structured-text` evidence entry carrying
   its `structuredOutput` and `lastTestedAt`.
3. For each `TtsPreset`: one `ModelProfile` with `speech` options and, when tested,
   one `japanese-speech` evidence entry. `speedDelivery` and `contextDelivery`
   cannot be recovered from storage, so this evidence is written at the **old probe
   version** and therefore reads as **stale**.
4. Presets sharing a `modelId` stay **separate profiles**. They were separate
   configurations and merging them would silently change what the learner set up.
   The models list may group them visually; the records stay distinct.
5. Routes: `activePresetId` → `story`; `grammarPresetId` → `grammar` (null stays
   null, meaning *same as Story*); TTS `activePresetId` → `speech`; `translation`
   starts null.
6. `storyTokenBudget` moves to the generation-policy settings row.
7. Everything else — readings, provenance, translations, grammar analyses, audio
   assets, jobs, cache keys — is untouched.

Failure inside the upgrade aborts the transaction and surfaces the existing
recovery path. The database is never silently reset.

---

## 12. Deferred seams

Named because the design has a place for them, not because they are planned.

- **Live-delivery speech engines.** The browser `SpeechSynthesis` API is the most
  natural local TTS for a local-first app — free, offline, no key — but it speaks
  at playback time and produces no storable clip. Whole-reading preparation, the
  audio cache, cache keys, resumable jobs, and Media Session metadata all assume a
  stored clip. Supporting live delivery is a change to the audio pipeline, not to
  this configuration model. The seam is a `deliveryMode: 'clip' | 'live'` adapter
  constant; this design supports `'clip'` only, and adapters that cannot produce a
  clip must not expose `speech`.
- **Catalogue browsing** — §9.2, stage 4.
- **Multiple connections of the same kind** — the records already permit it; the UI
  assumes one per kind until there is a reason.
- **Cost or latency-aware routing** — explicitly rejected. Routing is deterministic
  and learner-chosen.

---

## 13. Delivery stages

Each stage ships on its own and leaves the app fully working.

**Stage 1 — Unify registration.** One profile record, one add-model flow, no
text/audio question, evidence with negotiated shape, quirk table moved into the
adapter, `domain/ai/tts-configuration.ts` retired. Dexie v7. Fixes Defect A and use
case 10. *This is the stage that removes the thing that feels wrong.*

**Stage 2 — Feature routes.** Four routes replacing the three scattered defaults,
`AiTaskRouter`, the `RouteResolution` union and its copy, speed delivery in cache
keys and the player. Fixes Defect B and use cases 5, 8, 12.

**Stage 3 — Connections.** Connection record, per-connection credentials, adapter
registry, `providerScope` in cache keys. OpenRouter is the only adapter; the UI
shows the Connections panel only once a second kind exists.

**Stage 4 — Second adapter and catalogue browsing.** An OpenAI-compatible adapter
and `list()`, together. Stage 3's abstraction is validated here or reconsidered.

Stages 1 and 2 deliver nearly all the everyday benefit. Stage 3 is paid for by
stage 4 and should not ship far ahead of it.

---

## 14. Testing

**Domain (unit).**

- `readinessOf` per (profile, capability) across all five states.
- Route resolution: explicit, fallback-to-story, null story, missing profile, stale
  evidence, failed evidence, no credential — exhaustive over `RouteResolution`.
- Task→feature mapping is exhaustive over `AiTask`, proven by a runtime list test
  as `ALL_AI_TASKS` already is.
- Fingerprints: per-connection key generation isolates connections; the speech
  fingerprint excludes speed under playback delivery and includes it under provider
  delivery.
- Cache keys: **golden vectors asserting that an `openrouter` key with
  `providerScope: undefined` is byte-identical to the pre-change key.** This is the
  regression test that protects every learner's stored content.

**Adapter (contract).** The existing
[`openrouter-provider.contract.spec.ts`](../../src/app/infrastructure/openrouter/openrouter-provider.contract.spec.ts)
becomes a shared suite every adapter must pass: authentication, model-not-found,
capability refusal, cancellation, timeout, size limits, error redaction, and probe
degradation ladders.

**Probes (integration, fixtures).** Speech probe: speed refused → `playback`;
instructions refused → `none`; both refused; PCM normalised to WAV; undecodable
clip fails; empty voice with no quirk default fails; rejected voice fails. Text
probe: native schema, JSON-contract fallback, both refused.

**Migration (integration).** v6→v7 with: no settings at all; text presets only; TTS
presets only; both; two presets sharing a model ID (stay separate); a tested-active
preset and an untested one; a grammar default set and unset. Asserts routes,
evidence staleness, preserved credential, and **untouched readings, translations,
grammar analyses, audio assets, and jobs**.

**Behavioural.** A speed change on a playback-delivered profile does **not** change
any audio cache key and does **not** mark evidence stale. A speed change on a
provider-delivered profile does both.

**End-to-end.** Empty setup → connect → register → probe → assign → generate. A
route change takes effect on the next request and not the one in flight. Deleting a
routed profile clears exactly that route and leaves clips playable. Offline: routes
readable, probes refuse with the offline code, cached audio plays. No autoplay
anywhere. Keyboard-only traversal of the AI section, 320 px reflow, and dark theme.

---

## 15. Open questions

1. **Grammar's default route.** Today it falls back to the text default. Should a
   fresh install instead suggest the cheapest passing profile for grammar, given
   that grammar review runs far more often than story generation? This design keeps
   the current fallback; changing it is a product decision.
2. **Should a failed probe block registration, or only assignment?** This design
   allows registering a profile whose probe failed, so the row can carry the reason
   and a retry. The alternative — refuse to save — loses the explanation.
3. **Grouping profiles that share a model ID.** Records stay separate (§11.1 step
   4); whether the list groups them under one heading is a visual decision to make
   against a real list.
