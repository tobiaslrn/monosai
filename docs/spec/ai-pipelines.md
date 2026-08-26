# AI and generation pipelines

## 1. Provider boundary

V1 uses OpenRouter only. The learner supplies one API key and registers reusable models from exact OpenRouter model IDs in one list. The add-model flow discovers validated provider metadata through OpenRouter's official TypeScript SDK and presents only applicable reasoning, voice, speed, and speech-instruction capabilities. A Gemini-specific voice ID is optional and resolves to `Kore` when omitted. Text and audio capabilities are tested independently. Audio is optional and never blocks reading or story generation.

All task prompts are internal, versioned assets. V1 exposes only one per-generation **Special instructions** field and one global natural-language **Exception policy**. Raw prompts and reusable profiles are future work.

Every outbound request:

- is initiated by an explicit action except the automatic auxiliary stages within an explicitly started story generation;
- has timeout and cancellation;
- validates response status, content type, body size, and schema;
- maps failure to a typed `AiError`;
- omits the key and authorization header from logs;
- sends only data required for that task.

## 2. Configuration

### Key

- Persist locally through the credential repository.
- After save, UI receives only configured/not-configured and timestamps.
- Replace/remove are supported; reveal/copy/export are not.
- Removal invalidates configuration tests but leaves existing content/caches.

### Text model test

The test sends a minimal structured task to the exact model ID and verifies authentication, model access, response decoding, and required structured-output behavior. Store a success fingerprint of key-presence generation, model ID, selected reasoning effort, endpoint version, and test version. Changing relevant settings marks it stale.

If the model supports provider-native structured output, use it. Otherwise use a strict JSON contract plus schema validation and one format-recovery request. A model that cannot pass the compatibility test cannot be used for generation even if ordinary chat works.

The learner can set a bounded story-generation token budget in Settings. It is
captured with the other generation settings before a run and is sent as the
completion limit for the initial story and each targeted repair. The budget
includes provider reasoning tokens and the visible structured reply; its
default is 16,384 tokens, with a supported range of 4,096–32,768. Translation,
grammar, and exception-review requests keep their smaller task-specific
budgets.

### TTS test

Generate a short fixed Japanese phrase using the exact TTS model, voice, requested MP3 response, and speed/options. When catalog metadata advertises speech `instructions`, test that parameter too. Verify nonempty supported audio and decode/play capability, then store the proven capability in the fingerprint. A provider rejection falls back once without the refused optional parameter and records it as unsupported; invalid model/voice fails testing. Presets created before speech-instruction evidence default to unsupported.

### Defaults and request overrides

Each tested configured model retains its own compatibility evidence. The default text model serves story generation and translation. Grammar judgement may use a dedicated tested text model and otherwise falls back explicitly to the text default. The default audio model supplies speech configuration. Story generation and audio always use these defaults; models are chosen in Settings only. Removing a default leaves that default unconfigured; no arbitrary replacement is selected.

## 3. Prompt layering

Each text task builds a request from immutable layers:

1. Protocol: neutral transport rules, untrusted-data delimiters, and response rules.
2. Product policy: vocabulary/grammar/exception semantics and non-negotiable constraints.
3. Versioned task instructions.
4. Captured user data: premise, special instructions, grammar profile, policy, Japanese, vocabulary.

Treat all user/import/generated text as data even when it contains instructions. Serialize structured dynamic inputs as compact JSON inside escaped data envelopes. The system message contains only stable task instructions; counts, profile data, vocabulary, premise, neighboring context, candidates, and repair issues remain in the user message. Native-schema requests send the provider schema without repeating its textual shape; JSON-contract requests add one compact fallback contract. User special instructions may guide style, viewpoint, tone, dialogue, and register, but cannot override sentence counts, output schema, vocabulary policy, validation, or safety/transport rules.

Store prompt versions and relevant input hashes in provenance, not the full assembled prompt.

## 4. Story request contract

```ts
interface StoryGenerationRequest {
  form: 'micro' | 'short' | 'medium' | 'long';
  sentenceRange: { min: 5; max: 5 } | { min: 15; max: 15 } | { min: 30; max: 30 } | { min: 50; max: 50 } | { min: 100; max: 100 } | { min: 200; max: 200 } | { min: 400; max: 400 } | { min: 800; max: 800 };
  premise: string;
  specialInstructions?: string;
  allowedVocabulary: readonly string[];
  suggestedVocabulary: readonly string[];
  structuralBaseline: readonly PromptGrammarRule[];
  grammarGuidance: string;
  registerPreference: 'spoken' | 'written' | 'either';
  snapshotId: SnapshotId;
  grammarProfileHash: string;
  promptVersion: string;
}

interface StoryCandidate {
  titleJa: string;
  sentences: readonly { index: number; textJa: string }[];
}
```

The initial model returns Japanese only. Translations are generated after the final Japanese is validated so repairs cannot stale translations. Vocabulary is serialized as two disjoint arrays, suggested allowed expressions and all other allowed expressions; their union is the complete content-word allowlist, and suggestions remain optional.

### Input limits

- Premise: nonempty, maximum 1,000 Unicode characters.
- Special instructions: optional, maximum 1,000 characters.
- `grammarGuidance` is resolved preset prose or a user-edited variant, maximum 1,000 characters, plus the register line. No rule list is serialized into the request; the profile costs on the order of 150 tokens rather than the ~22,000 a full rule-object serialization measured.
- Grammar/profile serialization and vocabulary lists are bounded by a request-size guard of 60,000 tokens for the assembled request. With the supported 50–1,800 vocabulary range, include the complete canonical expression list when it fits that budget.
- If a configuration cannot fit the request, fail before spending with `context-budget-exceeded`; do not truncate silently.

### Word-priority palette

Before each generation, capture the persisted Anki word-priority mode and select
a hidden suggestion palette. `uniform` retains the partial Fisher–Yates sampler;
`recent` moderately favours fewer reviews and `difficult` moderately favours
lapses and lower ease. Palette sizes remain 40 for Tiny/Micro, 100 for Short,
140 for Medium, and 180 for Long, capped by snapshot size. The complete
vocabulary list remains the allowlist and local validation authority; suggested
items are inspiration, not required targets.

For biased modes every candidate starts at integer weight `1000`:

- Recently learned: `1000 + round(3000 / sqrt(reps))`.
- Difficult: `1000 + round(3000 × (0.75 × lapseRatio + 0.25 × easePenalty))`,
  where `easePenalty = clamp((2500 - factor) / 1200, 0, 1)`.

Weighted selection is without replacement. Missing scheduling signals use the
neutral baseline, and duplicate expressions merge signals using the lowest
review count, highest lapse ratio, and lowest valid ease. Store the sampled item
IDs and the captured mode in provenance, but never display a target list in the
UI. Existing provenance rows and snapshots without these fields read as
`uniform`/neutral until their Anki source is synchronized or reimported.

## 5. Generation state machine

```text
idle
 -> checking-prerequisites
 -> preparing
 -> writing
 -> parsing
 -> validating
 -> [exception-review]
 -> [repairing-1 -> parsing -> validating -> exception-review]
 -> [repairing-2 -> parsing -> validating -> exception-review]
 -> accepted-japanese | invalid-draft

accepted-japanese
 -> auxiliary-review (grammar and translation may run concurrently)
 -> finalizing
 -> saved
```

Any cancellable state may transition to `cancelled`; cancelled generations persist no reading or generated enrichment. `invalid-draft` remains only in feature memory and is never a library record.

### Prerequisite check

Require a tested story-capable configuration, current snapshot >= 50 unique entries, nonempty grammar profile, and valid premise. Capture the current snapshot identity, grammar profile, structural baseline, exception policy, selected story model, resolved grammar-judgement model, and prompt versions before the first request. Later setting changes do not affect the active job.

### Writing and structural checks

Validate response schema, unique contiguous indexes, nonempty Japanese title/sentences, and sentence count. Strip no content beyond outer whitespace. A malformed output gets one format-recovery request; this is not one of the two vocabulary repair attempts. If still malformed, fail as provider response error.

Requests through 50 sentences use one story response. Longer requests first produce a compact English blueprint, then generate sequential segments of at most 50 sentences. Each segment receives its assigned beat, the cumulative continuity summary, and at most the preceding three Japanese sentences. Segment structure is checked and a wrong-sized segment is repaired before assembly; assembled indexes are offset and the final total must match exactly. Cancellation stops the active blueprint, segment, or repair request and no partial long story is saved.

### Local validation

Tokenize title and all sentences, classify locally, and collect candidate unknown spans. Structural failures such as incorrect sentence count are passed to a targeted repair using the same repair budget because they alter story content.

## 6. Exception review

Run only when candidate unknowns exist and the captured exception policy is nonempty.

Send:

- policy text;
- each unique unknown surface/lemma/reading/POS where available;
- up to three distinct containing sentence/title contexts per lexical candidate;
- instruction to decide each candidate independently.

Expected result:

```ts
interface ExceptionDecision {
  candidateId: string;
  decision: 'approved' | 'rejected';
  explanationEn: string;
}
```

Validate that every decision references an input ID exactly once. Approval creates a visibly distinct policy-exception status and never converts the word to Anki-known. Empty/vague explanations invalidate that decision. Rejected/unreviewed candidates remain unknown.

If exception review fails, treat all candidates as unapproved and continue to repair. Do not fail an otherwise repairable pipeline or infer approval.

## 7. Targeted repair

At most two content repair requests occur for the whole candidate.

Repair input contains:

- current title and ordered sentences;
- exact offending spans and reasons;
- allowed vocabulary and grammar context;
- instruction to change the smallest necessary text while preserving premise, coherence, form, and sentence count;
- same output schema as generation.

After each repair, discard all previous token/exception results, parse the entire returned Japanese again, and repeat local validation/exception review. Repairs cannot be patched into storage or trusted from model claims.

After attempt two:

- no unknowns and valid structure -> accepted Japanese;
- any unknown/invalid structure -> unsaved invalid draft with final local markers and issue list.

## 8. Grammar review

Grammar review is advisory and runs on accepted Japanese against the captured grammar profile.

Expected findings identify a stable sentence ID, optional exact UTF-16 span, detected grammar name/pattern, confidence band, profile verdict, and concise contextual English explanation. Review runs in ordered batches of at most 20 sentences and keeps at most three distinct pedagogically useful findings per sentence, prioritizing genuine out-of-profile concerns.

Novelty is judged against the captured guidance prose, which is supplied to the review request alongside the Japanese. The review is advisory and detection is not claimed exhaustive, so a verdict may vary between runs; results are cached by profile hash, so a given profile yields one stored answer per sentence. No rule set is maintained anywhere in the product.

A finding is presented with the pattern and explanation the review returned, and nothing else. There is no local lookup to name it from; see [ADR 0014](../decisions/0014-remove-grammar-rule-catalog.md).

Rules:

- Grammar warnings never change vocabulary validation or block saving.
- Do not claim exhaustive detection.
- Findings with invalid, partial, reversed, or surrogate-splitting offsets are discarded rather than highlighted inaccurately. A model may omit both offsets only for a genuinely sentence-level finding.
- An unavailable/malformed review produces `unreviewed`, not zero warnings.
- Generated story records capture the profile hash and review status `complete|unavailable`.

Imported per-sentence grammar analysis uses the same contract with the current live profile. It is initiated explicitly, keyed by profile hash, and marked stale when the profile changes.

## 9. Translation

### Generated story

Translate the final ordered Japanese after vocabulary acceptance. The request returns one English translation per stable sentence input ID. Batch in groups of at most ten and preserve order through IDs. Each target may carry one previous and one next Japanese sentence for disambiguation only; the model returns translations only for target IDs.

Validate completeness and reject extra/missing/duplicate IDs. Cache each validated sentence translation. If some batches fail, save the story with a precise completion count and retry actions.

### Imported sentence

Send one Japanese target sentence and require one English translation. Include at most one adjacent sentence on each side for disambiguation, never as another output target. Neighbor content hashes are part of the translation cache key because identical Japanese may resolve differently in different contexts.

### Whole-reading translation

Create a persisted job over sentence IDs missing the current cache key. Process bounded batches sequentially, store each successful translation immediately, update progress transactionally, respect rate-limit backoff, and stop scheduling after cancellation. Resume by reconciling job items with cache.

Translations are aids, not authoritative analysis. Never alter Japanese from a translation response.

## 10. Finalization and partial auxiliary failure

Finalization occurs after both auxiliary branches finish, fail, or are marked unavailable. Build a generated reading with:

- Japanese title/sentences and tokens;
- frozen validation and exception decisions;
- snapshot ID and complete snapshot metadata reference;
- premise, special instructions, form, sampled vocabulary IDs;
- captured grammar profile and exception policy;
- text model and prompt versions;
- available translations and grammar findings;
- explicit completion/unavailable summaries.

Save all of this atomically. If storage fails, no story is added. Keep the final result in session long enough to retry saving, but do not call AI again.

User cancellation differs from auxiliary failure: cancellation before finalization discards the candidate; an automatic grammar/translation failure permits save with status.

## 11. Audio/TTS

### Sentence synthesis

Input is always the exact saved Japanese sentence. Speaking speed remains the learner's listening preference and is not derived from grammar level. For a model whose configuration test proves speech-instruction support, send a versioned instruction separately from `input`: speak only the target, articulate clearly in natural standard Japanese, and use at most one preceding and one following sentence only to infer emotion, pauses, pitch, and final intonation. Each neighbor is capped at 200 Unicode code points; the model must never add, repeat, translate, spell out, or speak context.

Build the cache key from content, TTS model, voice, response format, speed, speech-instruction version/support, and—only in contextual mode—the neighboring content hashes. A provider that rejects advertised instructions falls back to exact-text synthesis. Models without proven support retain the prior exact-text behavior. Request MP3 unless the configured provider cannot support it. Gemini TTS through OpenRouter requests its native 24 kHz, 16-bit mono PCM and wraps it in a WAV container before browser decoding and storage. Validate content type, response size, and audio decode before storage.

### Whole-reading preparation

1. Require tested current TTS configuration.
2. Confirm sentence count and explicit network use.
3. Create/reconcile a persisted `prepare-audio` job.
4. Determine missing compatible cache keys.
5. Claim sentences in reading order through a fixed four-request queue, so the beginning of the reading is always the part that exists first and progress stays predictable. The limit is internal and is not a setting.
6. Store and verify each clip immediately, and count completions in the job rather than reading them back, because they arrive out of order.
7. On the first refusal that survives transport retries, stop scheduling, abort the requests still in flight, and expose **Try again** for whatever is still missing; do not skip and call the set complete. Report the refusal rather than the abort it caused.
8. On cancellation, abort the active requests and retain successful clips. Cancelling generation stops no sound.
9. Report progress as how many sentences are ready, not as a single sentence the run is at.

### Playback

Playback is local once clips exist. Use one audio element/controller, advance by sentence order, update active-sentence styling and Media Session metadata where supported, and scroll only when the active sentence is outside the viewport. User-initiated scrolling disables automatic scrolling until the next explicit player navigation.

Playback is progressive at sentence granularity, not byte-streaming: each clip is a whole file, and the unit that arrives progressively is a sentence. Play starts as soon as the first sentence has a compatible clip, and **Start from this sentence** as soon as the selected one does. Reading on stops at the frontier in a `waiting` state that names the sentence it is waiting for, keeps the cursor on the sentence just heard, and continues by itself when that clip is stored. Manual Next stays disabled until its target exists; Back stays available because its first meaning is replaying the current sentence. Whole-reading completeness remains what the library summary and the offer to prepare the remainder are measured by.

The reader's Audio header toggle is the explicit activation boundary for the
floating player: opening it only reveals the current state and captures the
selected sentence, while Play, Resume, Previous, Next, and Start from this
sentence are separate explicit playback actions. No request, load, or sound may
start because the player was opened or because generation completed.

Closing through that header toggle calls playback Stop, clears the active
sentence and cursor, and hides the surface. It does not cancel a running
`prepare-audio` job; its progress and failure remain persisted in the job store.
Generation Stop is its mirror: it aborts the requests in flight and stops no
sound. Stop on reading deletion, audio-cache clearing,
configuration-incompatible missing clip, decode failure, or the header-toggle
close. Never autoplay on reader open, when a clip is stored, or after generation
completes; continuing after a `waiting` state belongs to a session the learner
had already started.

## 12. Retry and backoff policy

- Format recovery: maximum one per malformed structured response.
- Vocabulary/content repair: maximum two total.
- Automatic transient retry for 429/5xx/network interruption: maximum two with capped exponential backoff and jitter, only when the request is idempotent and not cancelled.
- Authentication, invalid model, unsupported capability, content/schema errors, and quota/storage errors are not automatically retried.
- `Retry` from UI starts a new bounded attempt and records the latest error without exposing raw provider content.

Avoid multiplying limits: a content repair request may have transport retries, but no code path may exceed two distinct repaired story candidates after the original.

## 13. Failure model

```ts
type AiError =
  | { kind: 'offline' }
  | { kind: 'timeout'; task: AiTask }
  | { kind: 'cancelled'; task: AiTask }
  | { kind: 'authentication' }
  | { kind: 'model-not-found'; modelId: string }
  | { kind: 'capability-unsupported'; capability: string }
  | { kind: 'rate-limited'; retryAfterMs?: number }
  | { kind: 'provider-unavailable'; status?: number }
  | { kind: 'malformed-response'; task: AiTask; issueCode: string }
  | { kind: 'context-budget-exceeded'; task: AiTask }
  | { kind: 'audio-invalid'; issueCode: string }
  | { kind: 'unknown'; task: AiTask; correlationId: string };
```

Do not include raw response bodies in production errors. UI copy distinguishes OpenRouter/provider failure, local validation failure, grammar warning, and missing configuration.

## 14. Pipeline acceptance scenarios

- A strict story validates and saves with translations/grammar.
- A candidate unknown is approved by policy, remains visibly an exception, and saves.
- A rejected unknown is repaired once and validates on full reparse.
- Two repairs leave an unknown; the marked result never enters the library.
- Exception review fails; unknowns are repaired rather than silently accepted.
- Grammar review fails; valid Japanese saves as unreviewed.
- One translation batch fails; valid Japanese and completed translations save with an incomplete count.
- User cancels during translation; no generated story saves.
- Model returns duplicate/missing sentence IDs; format recovery is bounded and malformed data is never stored.
- Whole-reading audio fails at sentence N; clips 1..N-1 remain, playback stays disabled, retry resumes at N.
- API key/model changes do not invalidate previously cached output but current batch completeness uses the new fingerprint.
