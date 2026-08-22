# System architecture

## 1. Architectural style

Monosai uses a feature-oriented Angular application with clean dependency boundaries:

```text
presentation -> application use cases -> domain
                         |                ^
                         v                |
                    infrastructure -------+
```

The domain defines types, invariants, and ports. Application services orchestrate use cases and state machines. Infrastructure implements repositories, OpenRouter, Anki, workers, hashing, and browser APIs. Presentation consumes use cases/facades and never imports Dexie tables, provider clients, or worker message types.

No server exists. “API” in this suite refers to external OpenRouter/local Anki APIs or internal TypeScript ports.

## 2. Runtime topology

```text
Angular main thread
  |-- Router and feature shells
  |-- Signals-based view/facade state
  |-- Application use cases and job coordinators
  |-- Dexie repositories (small reads/writes, transactions)
  |-- OpenRouter HTTPS client
  |-- Local Anki HTTP client
  |-- Audio playback / Media Session integration
  |
  +-- Language worker
  |     tokenization, readings, POS, segmentation assist,
  |     phrase matching, vocabulary classification
  |
  +-- Package worker
        archive inspection/decompression, transient collection DB,
        schema discovery, reviewed-entry extraction

Browser storage
  |-- IndexedDB: domain records, credentials, token data, blobs, job state
  |-- Cache Storage: versioned app shell and immutable language assets
  +-- service worker: navigation fallback and update lifecycle
```

Use one language worker instance with a typed request multiplexer and cancellation IDs. Use a separate package worker because archive/SQLite/WASM memory should be reclaimable by terminating it after import.

## 3. Suggested source organization

```text
src/app/
  core/
    bootstrap/          initialization and fatal-state handling
    routing/            routes and guards
    layout/             desktop/mobile shells
    platform/           online, storage, install, update facades
  domain/
    reading/
    vocabulary/
    grammar/
    generation/
    enrichment/
    shared/             IDs, Result, clocks; no miscellaneous utilities
  application/
    reading/
    vocabulary/
    generation/
    enrichment/
    settings/
  infrastructure/
    persistence/        Dexie database, migrations, repository adapters
    anki/               ports, desktop/android-compatible/package adapters
    openrouter/         HTTP client, schemas, task adapters
    language/           worker client and worker implementation
    dictionary/         immutable asset loader/index
    pwa/                caches, install, updates, persistence request
  features/
    library/
    import-reading/
    reader/
    generate/
    vocabulary/
    grammar/
    settings/
  shared-ui/            bounded reusable primitives only
```

Workers live under `src/workers/` if required by the Angular builder. Static versioned datasets live under `public/assets/language/<version>/` and contain their attribution metadata.

### File and dependency rules

- One primary responsibility per production file.
- Split components when orchestration, rendering, and interaction logic coexist.
- Feature code may import domain/application/shared UI, not sibling feature internals.
- Infrastructure may implement domain ports but domain never imports infrastructure.
- No `any`, broad type assertions, or raw external JSON outside adapter validation.
- No generic `utils.ts`, `helpers.ts`, repository god object, global app store, or all-purpose API service.
- Store selectors/computed signals derive state; do not mirror the same state in multiple services.

## 4. Application state

### Persistent state

Dexie owns settings, readings, snapshots, grammar choices, analysis records, cached assets, and resumable batch jobs. Persistent domain state is accessed only through repository ports.

### Session state

Feature facades use signals for form drafts, open reading state, inspectors, job progress, and errors. Generation is an in-memory state machine until the final save transaction. It is intentionally not resumable after app termination.

Translation/audio batch jobs are persisted because they may be long-running. Their coordinator reconstructs progress from the job record and existing cache keys after reload.

### Global state

Limit application-wide signals to initialization, network state, current vocabulary summary, grammar-profile readiness, reader preferences, install/update state, and active audio playback. Feature lists and forms remain feature-local.

## 5. Internal ports

Interfaces below specify responsibilities; exact method syntax may be refined without changing semantics.

```ts
interface AnkiVocabularyProvider {
  readonly kind: 'desktop-connect' | 'android-connect' | 'package';
  probe(signal?: AbortSignal): Promise<Result<AnkiCapabilities, AnkiError>>;
  discover(signal?: AbortSignal): Promise<Result<AnkiCatalog, AnkiError>>;
  extractReviewed(
    mappings: readonly SourceMapping[],
    signal?: AbortSignal,
  ): AsyncIterable<AnkiExtractionEvent>;
}

interface VocabularySourceRepository {
  list(): Promise<Result<readonly VocabularySource[], StorageError>>;
  save(source: VocabularySource): Promise<Result<VocabularySource, StorageError>>;
  readCaches(sourceIds: readonly VocabularySourceId[]): Promise<Result<readonly VocabularySourceCache[], StorageError>>;
  replaceCaches(caches: readonly VocabularySourceCache[]): Promise<Result<void, StorageError>>;
}

interface TextGenerationProvider {
  testConfiguration(config: TextModelConfig, signal?: AbortSignal): Promise<Result<ModelTest, AiError>>;
  writeStory(input: StoryGenerationRequest, signal: AbortSignal): Promise<Result<StoryCandidate, AiError>>;
  repairStory(input: StoryRepairRequest, signal: AbortSignal): Promise<Result<StoryCandidate, AiError>>;
  reviewExceptions(input: ExceptionReviewRequest, signal: AbortSignal): Promise<Result<ExceptionReview, AiError>>;
  reviewGrammar(input: GrammarReviewRequest, signal: AbortSignal): Promise<Result<GrammarReview, AiError>>;
  translate(input: TranslationRequest, signal: AbortSignal): Promise<Result<TranslationResult, AiError>>;
}

interface TextToSpeechProvider {
  testConfiguration(config: TtsConfig, signal?: AbortSignal): Promise<Result<TtsTest, AiError>>;
  synthesize(input: TtsRequest, signal: AbortSignal): Promise<Result<AudioPayload, AiError>>;
}

interface Tokenizer {
  analyzeText(input: AnalyzeTextRequest, signal?: AbortSignal): Promise<Result<AnalyzedText, LanguageError>>;
}

interface Dictionary {
  lookup(query: DictionaryQuery): Promise<readonly DictionaryEntry[]>;
}
```

Repository ports use domain objects, explicit page/cursor types, and atomic use-case operations. `ReadingRepository.deleteReading` owns cascading deletion semantics; callers do not delete tables one by one.

## 6. Bootstrap sequence

1. Render an accessible static loading shell.
2. Open Dexie and run migrations transactionally.
3. Load settings and reader preferences.
4. Validate language-asset manifest and initialize the worker lazily; basic navigation must not wait for the worker.
5. Resolve current vocabulary and grammar readiness.
6. Register service worker in production.
7. Resolve route/first-use destination.

If database initialization fails, show a recovery screen with Retry and Full reset. Never loop reloads or automatically delete data.

## 7. Persistence and transaction boundaries

Required transactions:

- Replace current vocabulary: snapshot, vocabulary items, source provenance, and statistics; keep one stable snapshot identity and update settings only after all succeed.
- Save imported reading: reading, paragraphs, sentences, token analyses, initial progress.
- Save generated story: reading, captured configuration/profile/policy, paragraphs/sentences, frozen token validation, available translations/grammar review.
- Delete reading: all owned children and assets, then repair Continue-reading pointer.
- Commit each batch asset success: asset plus updated job count.

Large blobs must not be read during normal list queries. Store denormalized library summaries on the reading record and update them transactionally when aid completion changes.

## 8. Worker contracts

Worker messages are discriminated unions with protocol version, request ID, operation, payload, and success/error response. Errors are serializable domain errors, not thrown `Error` objects.

Language worker operations:

- Initialize tokenizer/dictionary index.
- Segment text.
- Tokenize paragraphs/sentences.
- Normalize readings/lemmas.
- Compile snapshot phrase/term matcher.
- Classify reading tokens for a given snapshot.
- Validate generated story.

Package worker operations:

- Inspect archive manifest and supported collection member.
- Open transient collection DB.
- Discover deck/note-type/field catalog.
- Extract eligible entries for mappings.
- Close/terminate and release object URLs/memory.

Cancellation checks occur between chunks and within loops at bounded intervals. Main-thread clients ignore late responses after cancellation.

## 9. Offline and service worker strategy

### Precache

- Hashed application JS/CSS, icons, manifest, offline navigation document.
- Small bootstrap assets required to render routes.

### Lazy immutable cache

- Tokenizer runtime/dictionary assets.
- Compact dictionary index/data.
- Grammar difficulty presets and structural baseline.

Each language bundle has an immutable versioned URL and manifest with hashes. A newly installed version is verified before being made active; the prior cached version remains until no stored analysis depends on it or a cleanup migration completes.

Do not cache OpenRouter or Anki responses in the service worker. Domain caching occurs in IndexedDB only. Network-first navigation is unnecessary for an installed local-first app; use Angular's safe app-shell strategy with a user-controlled update prompt.

### Offline behavior

Offline-enabled: library, import, segmentation/tokenization after assets are cached, reading, dictionary, furigana, markers, saved translations/grammar results, cached audio, grammar/vocabulary/settings views.

Online-only: OpenRouter tests and tasks, local Anki HTTP refresh when unavailable from the browser context, and app update checks. Package import remains local and works offline after parser assets are cached.

## 10. Network and security boundaries

- Use browser `fetch` through task-specific adapters, not an all-purpose HTTP service.
- Apply timeouts and `AbortSignal` to every request.
- Send OpenRouter authorization only to the configured OpenRouter origin.
- Permit only allowlisted local Anki origins/ports; do not accept arbitrary URLs in v1.
- Use a restrictive CSP through deployable mechanisms available to the static host, while recognizing that a meta CSP cannot replace every response header.
- No runtime remote assets, inline script generation, `eval`, or unsafe HTML bypasses.
- Convert Anki HTML fields to inert visible text in a detached/sanitized parser. The result is still treated as text.
- Store the key in a dedicated settings record excluded from ordinary export/log/debug utilities. Client persistence is a convenience boundary, not server-grade secret storage.

## 11. Deployment

- Production output is static and uses a GitHub Pages-compatible base path.
- Prefer hash-based Angular routing for reliable deep-link reloads without server rewrite configuration.
- PWA manifest supplies standalone display, icons, theme/background colors, and start URL under the repository base path.
- GitHub Actions builds from a locked dependency graph, tests, produces the static artifact, and deploys only from the protected main branch.
- The app displays its semantic version, build commit, database schema version, language-asset versions, and prompt versions in a diagnostics subsection of Settings without exposing user content or credentials.

## 12. Observability without telemetry

All diagnostics remain local and ephemeral unless naturally persisted as task
status. The application emits structured, redacted console logs in development
and production. Development includes `debug` events; production includes
`info`, `warn`, and `error` events. A bounded in-memory buffer keeps the newest
200 entries for the current tab so Settings can copy them for support. The
buffer is cleared on reload and is never written to IndexedDB or sent to a
remote service.

Logging accepts only an allowlisted set of scalar fields. It must never receive
the API key, authorization header, full vocabulary, premise, reading text,
prompt, request body, or provider response body. Raw exceptions are reduced to
their type and stable error codes before logging. Production error screens may
show a copyable technical code and build version, and Settings may copy the
current redacted diagnostics buffer.
