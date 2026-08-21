# Domain and data model

## 1. Modeling conventions

- IDs are opaque UUID strings created client-side. Use branded TypeScript types to prevent cross-entity mistakes.
- Timestamps are UTC epoch milliseconds in storage and ISO strings at external/debug boundaries.
- Ordered children use integer `position` values unique within their parent.
- Domain unions are discriminated and exhaustive. Impossible states must not be representable through optional booleans.
- Persisted JSON payloads carry a schema version and are runtime-validated when read.
- Hashes use a single documented algorithm and canonical UTF-8 serialization. Cache identity is based on normalized input plus configuration, never database row IDs alone.
- User text is preserved exactly after newline normalization. Rendered token spacing and furigana never alter stored Japanese.

## 2. Canonical domain types

The following types define required information, not an exact file layout.

```ts
type ReadingId = Brand<string, 'ReadingId'>;
type ParagraphId = Brand<string, 'ParagraphId'>;
type SentenceId = Brand<string, 'SentenceId'>;
type SnapshotId = Brand<string, 'SnapshotId'>;
type VocabularyItemId = Brand<string, 'VocabularyItemId'>;
type AssetId = Brand<string, 'AssetId'>;
type JobId = Brand<string, 'JobId'>;

type Reading = ImportedReading | GeneratedStory;

interface ReadingBase {
  id: ReadingId;
  kind: 'imported' | 'generated';
  title: string;
  createdAt: number;
  updatedAt: number; // metadata/aid summary only; source text is immutable
  sentenceCount: number;
  characterCount: number;
  lastOpenedAt: number | null;
  excerpt: string; // the opening, denormalized for the library card
  translationSummary: CompletionSummary;
  grammarSummary: GrammarSummary;
  audioSummary: CompletionSummary;
  analyzerVersion: string;
}

interface ImportedReading extends ReadingBase {
  kind: 'imported';
  importSource: 'paste' | 'text-file';
  sourceFileName?: string;
  sourceTextHash: string;
}

interface GeneratedStory extends ReadingBase {
  kind: 'generated';
  form: 'micro' | 'short';
  premise: string;
  specialInstructions?: string;
  snapshotId: SnapshotId;
  generationProvenanceId: string;
  validationOutcome: StrictValidation | ExceptionValidation;
}
```

`updatedAt` changes for aid summaries or metadata migration. It must never imply source editing.

`excerpt` is a bounded, whitespace-collapsed prefix of the source text, written
once when the reading is saved. It exists so a shelf of library cards can show
Japanese without loading any reading's sentences. It is a preview, never the
text: the reader always renders from the sentences themselves.

There is no reading position. Monosai does not record where a learner stopped,
and the reader opens every reading at its first paragraph (ADR 0025).
`lastOpenedAt` remains, as ordering metadata only.

### Text hierarchy

```ts
interface Paragraph {
  id: ParagraphId;
  readingId: ReadingId;
  position: number;
  sourceText: string;
}

interface Sentence {
  id: SentenceId;
  readingId: ReadingId;
  paragraphId: ParagraphId;
  positionInReading: number;
  positionInParagraph: number;
  japaneseText: string;
  contentHash: string;
}

interface TokenAnalysis {
  sentenceId: SentenceId;
  analyzerVersion: string;
  tokens: readonly Token[];
}

interface Token {
  id: string; // deterministic within sentence analysis
  startUtf16: number;
  endUtf16: number;
  surface: string;
  lemma?: string;
  readingHiragana?: string;
  partOfSpeech?: PartOfSpeech;
  dictionaryKeys: readonly string[];
  isPunctuation: boolean;
}
```

Offsets use UTF-16 code units because they index JavaScript strings. Tests must include surrogate pairs and combining marks. The rendered sentence is reconstructed from untouched source slices; token output may not silently drop characters.

### Vocabulary snapshots

```ts
interface VocabularySnapshot {
  id: SnapshotId;
  createdAt: number;
  status: 'complete';
  uniqueEntryCount: number;
  mappingIds: readonly string[];
  providerKinds: readonly AnkiProviderKind[];
  analyzerVersion: string;
  normalizationVersion: string;
  stats: SnapshotStats;
}

interface VocabularyItem {
  id: VocabularyItemId;
  snapshotId: SnapshotId;
  visibleExpression: string;
  canonicalExpression: string;
  expressionHash: string;
  analyzedSequence: readonly VocabularyToken[];
}

interface VocabularyProvenance {
  vocabularyItemId: VocabularyItemId;
  sourceMappingId: string;
  deckName: string;
  noteTypeName: string;
  fieldName: string;
  sourceNoteId?: string;
}
```

Snapshots are append-only. A failed refresh is represented by a transient refresh job, not a snapshot row with an incomplete status. Active snapshot identity is stored in settings and changed in the creation transaction.

### Grammar

```ts
type GrammarPresetId =
  | 'mn-preset-starter'
  | 'mn-preset-basic'
  | 'mn-preset-everyday'
  | 'mn-preset-explanatory'
  | 'mn-preset-formal'
  | 'mn-preset-literary';

type RegisterPreference = 'spoken' | 'written' | 'either';

interface GrammarPreset {
  id: GrammarPresetId;
  order: number; // 0 easiest
  nameEn: string; // never a JLPT level
  captionEn: string; // "usually taught around N4"
  descriptionEn: string;
  exampleJa: string;
  exampleEn: string;
  promptGuidance: string; // prose sent to the model
}

interface GrammarProfileSelection {
  presetId: GrammarPresetId;
  registerPreference: RegisterPreference;
  customGuidance?: string; // <= 1,000 characters; forked from presetId
}

interface GrammarProfileSnapshot {
  id: string;
  profileHash: string;
  capturedAt: number;
  presetId: GrammarPresetId;
  resolvedGuidance: string;
  registerPreference: RegisterPreference;
  isCustomGuidance: boolean;
  structuralBaselineVersion: string;
}
```

The live profile stores one preset ID, a register preference, and optional custom guidance. Generated stories capture the resolved guidance text, not only the preset ID, so preset revisions cannot rewrite history — the same principle that previously applied to resolved rule text.

`CustomGrammarRule`, per-rule selection, and per-preset rule sets are all removed; see [ADR 0008](../decisions/0008-grammar-profile-presets.md). The rule catalog itself, along with `CatalogGrammarRule`, `JlptLevel`, and `GrammarRuleId`, is deleted; see [ADR 0014](../decisions/0014-remove-grammar-rule-catalog.md). No enumerated grammar rule exists anywhere in the model.

`profileHash` covers the resolved guidance, the register preference, and the structural-baseline version, and nothing else. A preset copyedit that leaves the resolved text unchanged does not invalidate stored analyses, and neither does a dictionary or tokenizer refresh. A capture is content addressed: its `id` is its `profileHash`, so an unchanged profile reuses the capture it already has.

### Validation

```ts
type TokenValidation =
  | { category: 'anki-exact'; vocabularyItemIds: readonly VocabularyItemId[] }
  | { category: 'anki-normalized'; vocabularyItemIds: readonly VocabularyItemId[]; basis: string }
  | { category: 'anki-phrase'; vocabularyItemId: VocabularyItemId; tokenSpan: TokenSpan }
  | { category: 'structural-baseline'; ruleId: string }
  | { category: 'entity'; entityKind: 'name' | 'number' | 'date' | 'time' | 'symbol' }
  | { category: 'policy-exception'; exceptionId: string; explanationEn: string }
  | { category: 'not-in-snapshot' }
  | { category: 'unknown'; reason: UnknownReason }
  | { category: 'punctuation' };

interface FrozenSentenceValidation {
  sentenceId: SentenceId;
  snapshotId: SnapshotId;
  validatorVersion: string;
  tokenStatuses: readonly TokenStatusAssignment[];
}
```

Imported status is derived/cached against the active snapshot and uses `not-in-snapshot`, never a generated-story acceptance error. Generated status is frozen and uses `unknown` only for unsaved drafts; accepted generated rows cannot contain that category.

### Enrichment and provenance

```ts
interface TranslationRecord {
  id: string;
  sentenceId: SentenceId;
  sourceContentHash: string;
  textEn: string;
  modelId: string;
  promptVersion: string;
  cacheKey: string;
  createdAt: number;
}

interface GrammarAnalysisRecord {
  id: string;
  sentenceId: SentenceId;
  sourceContentHash: string;
  profileHash: string;
  modelId: string;
  promptVersion: string;
  findings: readonly GrammarFinding[];
  createdAt: number;
}

interface AudioAsset {
  id: AssetId;
  sentenceId: SentenceId;
  sourceContentHash: string;
  modelId: string;
  voiceId: string;
  optionsFingerprint: string;
  mimeType: 'audio/mpeg' | 'audio/pcm';
  byteLength: number;
  blob: Blob;
  cacheKey: string;
  createdAt: number;
}
```

Generated-story grammar review may be story-level externally but is normalized into sentence findings plus a reading summary. Every finding includes confidence (`low|medium|high`), English explanation, optional token/span offsets, and selected/out-of-profile status. The UI must not present confidence as mathematical probability.

### Jobs

```ts
type AssetJobKind = 'translate-reading' | 'prepare-audio';
type JobState = 'queued' | 'running' | 'paused' | 'cancelled' | 'failed' | 'complete';

interface AssetJob {
  id: JobId;
  kind: AssetJobKind;
  readingId: ReadingId;
  state: JobState;
  orderedSentenceIds: readonly SentenceId[];
  completedSentenceIds: readonly SentenceId[];
  failedItems: readonly JobItemFailure[];
  configFingerprint: string;
  createdAt: number;
  updatedAt: number;
}
```

Cancellation changes state and stops scheduling new work. Successfully stored results remain. Restarting creates or resumes a job for the same fingerprint after reconciling cache records.

## 3. Settings model

Separate settings by concern rather than one unvalidated JSON object:

- `AppSettings`: theme, schema-aware flags, active snapshot ID.
- `ReaderPreferences`: furigana, token spacing, markers, translations expanded; all true initially.
- `OpenRouterCredential`: API key and created/updated timestamps. Repository methods expose `isConfigured`, replace, remove, and an internal request credential; UI facades never receive the saved string.
- `TextModelSettings`: exact model ID, last successful test fingerprint/time.
- `TtsSettings`: exact model ID, voice ID, speed/options, last test state.
- `ExceptionPolicy`: text, updated time, policy hash.
- `LanguageAssetSettings`: active tokenizer/dictionary/grammar/baseline versions.

Changing any model-relevant value invalidates only the matching configuration test. It does not delete prior enrichment.

## 4. Dexie schema

Use normalized tables for list/query boundaries and JSON only for bounded immutable aggregates.

```text
settings                 &key
credentials              &key
sourceMappings           &id, enabled, providerKind, [deckName+noteTypeName]
vocabularySnapshots      &id, createdAt, uniqueEntryCount
vocabularyItems          &id, snapshotId, [snapshotId+expressionHash]
vocabularyProvenance     ++id, vocabularyItemId, sourceMappingId
grammarSelections        &ruleId, selected
customGrammarRules       &id, enabled, position
grammarProfileSnapshots  &id, profileHash
readings                 &id, kind, createdAt, lastOpenedAt
paragraphs               &id, readingId, [readingId+position]
sentences                &id, readingId, paragraphId, [readingId+positionInReading]
tokenAnalyses            &[sentenceId+analyzerVersion], sentenceId
frozenValidations        &sentenceId, snapshotId
translations             &cacheKey, sentenceId
grammarAnalyses          &cacheKey, sentenceId, profileHash
audioAssets              &cacheKey, sentenceId, readingId
assetJobs                &id, readingId, kind, state
generationProvenance     &id, readingId
```

Implement indexes needed by specified queries only. Do not index large text, token arrays, blobs, keys, or policy descriptions.

### Library denormalization

The `readings` row includes everything a library card renders: the aid
summaries, the last opened time, and the excerpt. Repository transactions
recalculate the summaries when enrichment changes; the excerpt is written once
and never changes, because the source text never does. The library query does
not join or load sentence children.

## 5. Cache keys

Canonical serialization uses sorted object keys, explicit null omission rules, normalized line endings, and UTF-8.

- Translation: `hash('translation' + sentenceHash + modelId + translationPromptVersion)`.
- Grammar: `hash('grammar' + sentenceHash + modelId + grammarPromptVersion + profileHash)`.
- Audio: `hash('tts' + sentenceHash + ttsModelId + voiceId + canonicalOptions)`.
- Imported validation cache: `hash('validation' + sentenceHash + analyzerVersion + validatorVersion + snapshotId)`.
- Grammar profile: `hash('grammar-profile' + resolvedGuidance + registerPreference + structuralBaselineVersion)`.
- Exception policy: hash normalized policy text and exception prompt version.

Do not include the API key in any fingerprint.

## 6. Immutability and staleness rules

### Immutable

- Saved source paragraphs and sentences.
- Completed vocabulary snapshot content.
- Generated story provenance, captured grammar profile, captured exception policy, and validation result.
- Enrichment record output/provenance.

### Mutable metadata

- Reading progress and last-opened time.
- Library completion summaries.
- Global preferences/settings.
- Live grammar selection/custom rules.
- Source mapping configuration.
- Asset job state.

### Stale versus invalid

- A grammar analysis with an old profile hash is stale but still readable.
- Existing translation/audio from an old model/profile is valid historical cached output; current-config batch completeness ignores it.
- A token analysis whose analyzer version is unsupported is invalid for new classification and must be recomputed from immutable sentence text.
- Generated frozen validation is historical and remains displayable even when current analyzer assets change.

## 7. Referential integrity and deletion

Dexie does not enforce SQL foreign keys, so repository transactions must enforce them and integration tests must verify orphans are impossible.

Delete reading cascade:

1. Stop/cancel active jobs and playback for reading.
2. Delete audio, translations, grammar analyses, validations, token analyses, sentences, paragraphs, progress, generation provenance/profile captures owned only by the reading, and the reading row.
3. Recompute Continue-reading pointer.
4. Leave vocabulary snapshots, the global grammar profile, source mappings, settings, and credentials.

Clear audio deletes all audio blobs and audio jobs, resets reading audio summaries, and stops playback. Full reset deletes the database and application Cache Storage after confirmations.

## 8. Database migrations

- Schema versions are monotonic integers with one migration function per version transition.
- Migrations are idempotent when retried after an aborted open.
- Never mutate immutable text/provenance semantics without retaining the old representation or recomputing from stored source.
- For expensive token migrations, migrate metadata eagerly and mark analysis for lazy recomputation rather than blocking startup.
- Back up is excluded, so migration tests using production-shaped fixtures are mandatory.
- On migration failure, close the DB and present Retry/Reset. Never catch and continue with partially understood data.

## 9. Repository contracts

Required semantic methods include:

- Library pagination/filter and Continue-reading resolution.
- Atomic imported/generated reading creation.
- Reading graph loading by paragraph window and sentence details.
- Reading deletion and progress update.
- Source mapping CRUD and refresh configuration validation.
- Atomic snapshot commit/list/active resolution.
- Vocabulary matcher input streaming by snapshot rather than a monolithic UI array.
- Live grammar profile CRUD/capture/hash.
- Translation/grammar/audio get-by-current-key, store idempotently, and summarize.
- Batch job create/reconcile/advance/cancel/fail/complete.
- Credential configured/replace/remove/request-only access.

Repository implementations translate storage failures into `StorageError` variants (`quota`, `blocked`, `corrupt-record`, `transaction-aborted`, `unavailable`, `unknown`) and never expose raw Dexie errors above infrastructure.

## 10. Data validation acceptance

- Every table record parses against its versioned schema in development and at untrusted/import/migration boundaries.
- Duplicate IDs or positions abort the parent transaction.
- Sentence text hashes are verified when loading related cached data.
- Accepted generated stories cannot be constructed with unknown validation categories or missing snapshot provenance.
- Imported readings can exist with no vocabulary snapshot and no AI configuration.
- Deleting any reading produces zero owned orphan rows in integrity tests.
- Simulated quota failures leave the previously committed state intact and report whether partial batch assets were committed before the failure.

