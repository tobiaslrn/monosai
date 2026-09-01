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

1. Protocol: neutral transport rules, envelope semantics, and response rules.
2. Product policy: vocabulary/grammar/exception semantics and non-negotiable constraints.
3. Versioned task instructions.
4. Captured input, in one of two envelopes.

Captured input comes in two kinds, because one envelope cannot describe both honestly. A `MONOSAI_CONFIG` block carries a learner setting the task is defined to honour within the limits the task instructions state: the grammar profile and register, the vocabulary inventory, the sentence-count requirement, the exception policy, and special instructions. A `MONOSAI_DATA` block carries content the task operates on and never obeys: the premise, a story under repair, candidate words, sentences to review or translate. Instructions written inside a data block are never followed; nothing in either block can change the task instructions, the output contract, or the validation rules. Both delimiters are neutralized inside captured text, in both envelopes, so content can neither close its own block nor open a block of the more privileged kind. Serialize structured dynamic inputs as compact JSON inside those escaped envelopes. The system message contains only stable task instructions; counts, profile data, vocabulary, premise, neighboring context, candidates, and repair issues remain in the user message. Native-schema requests send the provider schema without repeating its textual shape, and that schema carries per-field descriptions and the exact sentence-count bounds so the constraint is stated where the field is emitted; JSON-contract requests add one compact fallback contract. Each task is sent with an explicit sampling temperature: judgement tasks - translation, both reviews, planning, and repair - are pinned low, while story writing is deliberately warm because varying between runs is the point. The single format recovery drops every optional parameter, including temperature, since a refused parameter is not always named in the response. User special instructions may guide style, viewpoint, tone, dialogue, and register, but cannot override sentence counts, output schema, vocabulary policy, validation, or safety/transport rules.

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

Any cancellable state may transition to `cancelled`; cancelled generations persist no reading or generated enrichment. `invalid-draft` remains only in feature memory and is never a library record; it is reached by structural failure alone. Words the repair budget could not replace do not block acceptance: they are saved marked, and the reader carries the warning. See ADR 0033.

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

A repair whose only problems are vocabulary is scoped to the sentences at fault. It sends each offending entry with one untouched neighbour on each side, deduplicated and in reading order, and asks for replacements keyed by the original index; the title travels as its own entry when the offending word is in it. The patch is spliced in locally and the spliced story is then revalidated in full. This is not a weaker check: every pass already re-tokenizes, re-classifies, and re-reviews the whole story from scratch, so a spliced candidate is checked exactly as hard as a rewritten one - while the untouched sentences no longer get fresh chances to acquire a new unknown that spends the remaining repair budget. A patch that does not answer exactly what was asked - a missing target, an index that was not a target, one answered twice, a blank replacement, a title that was not requested - is refused whole rather than partly applied.

A repair that must also fix the story's shape sends the whole story, because a wrong sentence count is a property of the story and no per-sentence edit can fix it.

Repair input contains:

- the entries to rewrite, or the current title and ordered sentences for a structure repair;
- the offending spans, as sentence index and surface; the reason they must go is stated once for the request, not repeated per span;
- the attempt number, and the surfaces an earlier repair in this run was already asked to remove and did not;
- allowed vocabulary and grammar context;
- instruction to change the smallest necessary text while preserving premise, coherence, form, and sentence count.

After each repair, discard all previous token/exception results, parse the entire returned Japanese again, and repeat local validation/exception review. Nothing a repair returns is trusted from model claims.

A word the exception policy explicitly refused is not put to the policy again in the same run: the same policy text asked about the same word cannot answer differently, so re-asking is a request the learner pays for twice. The word stays unknown and goes to repair. A candidate that stayed unknown for any other reason - the review failed, skipped it, or answered unusably - is asked about again, because nothing was settled.

After attempt two:

- valid structure -> accepted Japanese, with any word still unknown frozen as `unresolved-after-repair` and marked in the reader;
- invalid structure -> unsaved invalid draft with final local markers and issue list.

## 8. Grammar review

Grammar review is advisory and runs on accepted Japanese against the captured grammar profile.

Expected findings identify a stable sentence ID, an optional span, the detected grammar name/pattern, a confidence band, a profile verdict, and a concise contextual English explanation of one or two plain sentences a beginner can read. The span is requested as the exact substring of the sentence, quoted character for character, and Monosai locates it locally; counting UTF-16 code units is character-level arithmetic over text a model sees as tokens, and asking for a quote instead removes a failure mode that had nothing to do with the pedagogy. Review runs in ordered batches of at most 20 sentences and keeps at most three distinct findings per sentence. The prompt states the priority the app applies: out-of-profile concerns first, then the merely useful.

Novelty is judged against the captured guidance prose, which is supplied to the review request alongside the Japanese. The review is advisory and detection is not claimed exhaustive, so a verdict may vary between runs; results are cached by profile hash, so a given profile yields one stored answer per sentence. No rule set is maintained anywhere in the product.

A finding is presented with the pattern and explanation the review returned, and nothing else. There is no local lookup to name it from; see [ADR 0014](../decisions/0014-remove-grammar-rule-catalog.md).

Rules:

- Grammar warnings never change vocabulary validation or block saving.
- Do not claim exhaustive detection.
- A finding whose quoted span is not actually in its sentence is downgraded to sentence-level rather than discarded: the label and the explanation are still valid when only the highlight is not. A repeated span resolves to its first occurrence. A model may omit the span only for a genuinely sentence-level finding.
- An unavailable/malformed review produces `unreviewed`, not zero warnings.
- Generated story records capture the profile hash and review status `complete|unavailable`.

Imported per-sentence grammar analysis uses the same contract with the current live profile. It is initiated explicitly, keyed by profile hash, and marked stale when the profile changes.

## 9. Translation

### Generated story

Translate the final ordered Japanese after vocabulary acceptance. The task is framed as what it is: a reading aid shown beside the Japanese for a beginner checking comprehension, so the sentence's order of information is preserved wherever English allows it, rather than reorganized for literary effect.

Batch in groups of at most ten. A batch sends one ordered window - its targets plus each target's immediate neighbours, deduplicated - with an explicit list of the ids to translate; entries outside that list are context and are never returned. One window says what a before/after pair per sentence said for roughly half the Japanese, and gives the model the paragraph rather than a one-sentence keyhole. Ids on the wire are the entry's position in the window, not the generated sentence id: they are shorter, ordered, and cannot be corrupted by mistranscribing a character, which matters because a single bad id rejects the whole batch. The caller's ids are restored in the adapter.

The generated path also sends the premise, story title, and the register the Japanese was written to, so preserving subject matter and register has a referent. A context entry that was already translated earlier in the same run carries its English. For proper nouns identified by the tokenizer, the first translated occurrence is also kept as a bounded established-rendering example and sent again when that Japanese surface recurs in a later batch. This preserves a chosen name rendering even when the two occurrences are not adjacent.

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

Speaking speed comes only from the model. Ask for it through `speed` where the provider honours the parameter, and through the delivery instruction, which names the requested multiplier, where it does not. Never slow a clip locally and never time-stretch one; a model that offers neither channel is marked as fixed-pace in the model picker and is still selectable.

Which channels a request may use is declared by the provider catalog's `supported_parameters` and confirmed by the configuration test, which attempts exactly the declared channels and records what the provider honoured (ADR 0040). An empty parameter list means "not known yet", not "nothing", so both channels are attempted and the provider's refusal decides. Two overrides outrank the catalog because it cannot state them: Gemini TTS ignores `speed` rather than refusing it, and takes its direction as a prefix inside `input` rather than as a parameter. Synthesis reads only the stored findings, never the catalog. The delivery instruction also asks for distinct word boundaries, brief pauses at natural phrase boundaries, and intact pitch accent and rhythm, never mora-by-mora speech.

Build the cache key from content, TTS model, voice, response format, speed, speech-instruction version/support, and—only in contextual mode—the neighboring content hashes. A provider that rejects advertised instructions falls back to exact-text synthesis. Models without proven support retain the prior exact-text behavior. Request MP3 unless the configured provider cannot support it. Gemini TTS through OpenRouter requests its native 24 kHz, 16-bit mono PCM and wraps it in a WAV container before browser decoding and storage. Validate content type, response size, and audio decode before storage.

### Whole-reading preparation

1. Require tested current TTS configuration.
2. Confirm sentence count and explicit network use.
3. Create/reconcile a persisted `prepare-audio` job.
4. Determine missing compatible cache keys.
5. Claim sentences through a fixed four-worker priority queue ordered by position in the reading, so the beginning of the reading is always the part that exists first and progress stays predictable. A sentence whose returned bytes fail audio validation returns to the queue at its original priority for one bounded queue-level retry. Transient transport failures keep the provider's existing maximum of two retries and are not retried again by the queue. The concurrency and retry limits are internal and are not settings.
6. Store and verify each clip immediately, and count completions in the job rather than reading them back, because they arrive out of order.
7. After the queue or provider retry budget is exhausted, record a sentence-local invalid-audio, malformed-response, or transient failure and continue preparing the remaining sentences. Finish with the precise failed count and expose **Try again** for only the missing clips. Configuration-wide failures such as authentication, model, capability, context, offline, cancellation, or unknown errors stop scheduling and abort requests still in flight.
8. Bound that retry as well. A settled failure states whether running it again could plausibly produce a clip, and says no once two consecutive runs for that reading and configuration have stored none: one fruitless run can be an outage that has passed, two in a row are a sentence this configuration cannot read. Any run that stores a clip clears the count, a changed configuration starts its own, and a run the learner stopped never counts against it. Where the answer is no, offer dismissal rather than a retry and say that repeated attempts produced nothing and that another voice or model may work.
9. On cancellation, abort the active requests and retain successful clips. Cancelling generation stops no sound.
10. Report progress as how many sentences are ready, not as a single sentence the run is at. A settled run reports the reading's ready-over-total — the figure the track is drawing — and states separately, as an attempt, how much of what it set out to read it covered.

### Playback

Playback is local once clips exist. Use one audio element/controller, advance by sentence order, update active-sentence styling and Media Session metadata where supported, and scroll only when the active sentence is outside the viewport. User-initiated scrolling disables automatic scrolling until the next explicit player navigation.

Playback is progressive at sentence granularity, not byte-streaming: each clip is a whole file, and the unit that arrives progressively is a sentence. Play starts as soon as the first sentence has a compatible clip, and **Start from this sentence** as soon as the selected one does. Reading on stops at the frontier in a `waiting` state that names the sentence it is waiting for, keeps the cursor on the sentence just heard, and continues by itself when that clip is stored. Manual Next stays disabled until its target exists; Back stays available because its first meaning is replaying the current sentence. Whole-reading completeness remains what the library summary and the offer to prepare the remainder are measured by.

The reader's Audio header toggle is the explicit activation boundary for the
floating player: opening it only reveals the current state and captures the
selected sentence, while Play, Resume, Previous, Next, and Start from this
sentence are separate explicit playback actions. No request, load, or sound may
start because the player was opened or because generation completed.

Closing through that header toggle hides the card and clears the captured
sentence, and silences nothing (ADR 0037): hiding a card to read the text under
it is not "stop reading to me", and the header toggle keeps saying that a
reading is playing. It does not cancel a running `prepare-audio` job either; its
progress and failure remain persisted in the job store. Generation Stop is the
mirror of that: it aborts the requests in flight and stops no sound.

A session ends when the reader is left (ADR 0041). The reader carries the only
transport in the application, so playback that outlived the route was a sound
with no control anywhere; leaving it stops playback, clears the cursor, and
empties the media session. Being backgrounded is not leaving — a hidden
document, a locked screen, or another application in front stops nothing, which
is what the continuous media resource and the media notification are for. Stop
also on reading deletion from either the reader or the library, audio-cache
clearing, a configuration-incompatible missing clip, and decode failure. Never
autoplay on reader open, when a clip is stored, or after generation completes;
continuing after a `waiting` state belongs to a session the learner had already
started.

## 12. Retry and backoff policy

- Format recovery: maximum one per malformed structured response.
- Vocabulary/content repair: maximum two total.
- Automatic transient retry for 429/5xx/network interruption: maximum two with capped exponential backoff and jitter, only when the request is idempotent and not cancelled.
- Authentication, invalid model, unsupported capability, content/schema errors, and quota/storage errors are not automatically retried.
- `Retry` from UI starts a new bounded attempt and records the latest error without exposing raw provider content.
- Whole-reading audio withdraws that offer after two consecutive attempts that stored no clip, because each one costs a request per missing sentence to reproduce the same answer.

Avoid multiplying limits: a content repair request may have transport retries, but no code path may exceed two distinct repaired story candidates after the original.

## 13. Failure model

```ts
type AiError =
  | { kind: 'offline' }
  | { kind: 'timeout'; task: AiTask }
  | { kind: 'cancelled'; task: AiTask }
  | { kind: 'authentication' }
  | { kind: 'credit-exhausted' }
  | { kind: 'model-not-found'; modelId: string }
  | { kind: 'capability-unsupported'; capability: string }
  | { kind: 'rate-limited'; retryAfterMs?: number }
  | { kind: 'provider-unavailable'; status?: number }
  | { kind: 'malformed-response'; task: AiTask; issueCode: string }
  | { kind: 'context-budget-exceeded'; task: AiTask }
  | { kind: 'audio-invalid'; issueCode: string }
  | { kind: 'unknown'; task: AiTask; correlationId: string };
```

`credit-exhausted` is separate from `authentication` because their recoveries
are unrelated: a rejected key is replaced, an empty balance is topped up, and
saving the key again cannot help the second. See ADR 0018.

Do not include raw response bodies in production errors. UI copy distinguishes OpenRouter/provider failure, local validation failure, grammar warning, and missing configuration.

## 14. Pipeline acceptance scenarios

- A strict story validates and saves with translations/grammar.
- A candidate unknown is approved by policy, remains visibly an exception, and saves.
- A rejected unknown is repaired once and validates on full reparse.
- Two repairs leave an unknown; the story saves with that word marked `unresolved-after-repair`.
- Two repairs leave the wrong sentence count; the marked result never enters the library.
- Exception review fails; unknowns are repaired rather than silently accepted.
- Grammar review fails; valid Japanese saves as unreviewed.
- One translation batch fails; valid Japanese and completed translations save with an incomplete count.
- User cancels during translation; no generated story saves.
- Model returns duplicate/missing sentence IDs; format recovery is bounded and malformed data is never stored.
- Whole-reading audio fails at sentence N; clips 1..N-1 remain, playback stays disabled, retry resumes at N.
- API key/model changes do not invalidate previously cached output but current batch completeness uses the new fingerprint.
