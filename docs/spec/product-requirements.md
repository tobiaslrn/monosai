# Product requirements

## 1. Product goal and audience

Monosai helps Japanese learners read approachable Japanese with precise local assistance and optionally generate practice stories from vocabulary they have already reviewed. The primary audience is an absolute beginner with roughly 50–1,800 reviewed expressions, though the reader must remain useful for more advanced users reading their own material.

V1 is a public bring-your-own-OpenRouter-key application. It is single-learner per browser profile, accountless, local-first, and static. Windows desktop and Android mobile are equally important.

### Success means

- A new visitor can paste Japanese and reach a useful reader without setup.
- A learner can connect or import Anki data without granting Monosai any write capability.
- A learner can understand why each generated token was accepted, excepted, warned, or rejected.
- A generated story that enters the library contains no unresolved unknown vocabulary.
- A learner can use saved readings and local aids offline.
- All primary workflows work with keyboard on Windows and touch on Android.
- The implementation remains modular, testable, and suitable for future provider or persistence replacements.

## 2. Scope

### Included in v1

- Pasted Japanese and UTF-8 `.txt` import.
- Import review with title editing and sentence split/merge correction.
- Combined library for imported readings and generated stories.
- Local tokenization, whole-word furigana, part-of-speech information, compact dictionary glosses, and vocabulary markers.
- Read-only vocabulary refresh through desktop AnkiConnect, an Android AnkiConnect-compatible bridge, or Anki package parsing.
- One replaceable current vocabulary snapshot and snapshot-linked generated stories.
- Device-wide N5–N1 grammar selection and named custom rules.
- Custom-premise micro and short story generation.
- Local validation, AI exception review, maximum two targeted repairs, advisory grammar review, translations, and cloud TTS.
- Per-sentence and explicit batch enrichment, caching, progress, cancellation, retry, and offline replay.
- PWA installability, offline app shell, storage management, light/dark/system themes, and update handling.
- Individual-reading deletion and complete local-data reset.

### Explicitly excluded

- Accounts, login, hosted profiles, backend APIs, server databases, telemetry, analytics, and push notifications.
- Anki card creation, edits, tagging, deletion, rescheduling, syncing, or collection management.
- Native Android integration or an Android wrapper.
- CSV/TSV/EPUB/PDF/web-page import.
- Reading edits after save, annotations, bookmarks, favorites, tags, search, manual sorting, and folders.
- Backup, export, import of Monosai data, cross-device transfer, and sync.
- Topic suggestions, genre metadata, target-word display, register selector, generation history outside saved stories, and raw prompt editing.
- Device/browser speech synthesis and non-OpenRouter AI providers.
- Full or downloadable dictionary packs.
- Dedicated privacy policy, terms page, cost dashboard, budget controls, or exact cost estimates.
- Firefox, Safari, iOS, and non-Chromium compatibility guarantees.

## 3. Core use cases

### UC-01: Read pasted text with no setup

1. A first-time user opens Monosai and selects **Paste Japanese**.
2. The user enters Japanese, optionally supplies a title, and continues.
3. Monosai normalizes line endings, preserves paragraph breaks, segments sentences off the main thread, and presents a review screen.
4. The user can split a sentence at a cursor position, merge it with the previous/next sentence, edit the title, or return to raw input.
5. The user saves the immutable reading and enters the reader.
6. Furigana, spacing, markers available without Anki, and already-cached translations are enabled. Word inspection works locally.

Acceptance:

- No Anki/API configuration is requested.
- Input up to 50,000 Unicode characters remains responsive.
- Empty/whitespace-only input is blocked with an inline message.
- No missing translation, grammar analysis, or audio request starts automatically.

### UC-02: Import a text file

The flow matches UC-01, except the title defaults to the filename without its extension. Only UTF-8 plain text is supported. Files that cannot be decoded as UTF-8, exceed the configured 50,000-character limit, or contain no visible text receive distinct errors. File contents are never uploaded during import.

### UC-03: Configure a grammar profile

1. The user opens Grammar, or reaches it from the Generate prerequisite panel.
2. The user reads six ordered difficulty presets, each shown with a name, a caption, a one-line description, and a real Japanese example sentence, and selects one.
3. The user may optionally set a register preference of everyday spoken, polite written, or either.
4. The user may optionally fork the selected preset into a custom variant: a free-text field prefilled with that preset's guidance, bounded at 1,000 characters.
5. Changes save locally immediately.

Presets are ordered `Starter forms`, `Basic forms`, `Everyday forms`, `Explanatory forms`, `Formal patterns`, `Literary patterns`, and are cumulative: each leaves everything simpler available. They are named for the grammar the learner commands, never for a JLPT level; the level appears only as a caption reading "usually taught around N…".

Acceptance:

- A fresh install defaults to `Starter forms`, and generation is never gated on the grammar profile.
- No JLPT level is used as a preset name, and no copy states or implies that an official exhaustive JLPT grammar list exists.
- A custom variant behaves exactly as a preset does: its guidance is what generation and grammar analysis both receive.
- The always-permitted structural baseline is visible as explanatory read-only content and is not represented as learner knowledge.
- There is no rule catalog and no selection surface. UC-08 findings are named by the pattern and explanation the grammar review itself returns; see [ADR 0014](../decisions/0014-remove-grammar-rule-catalog.md).

### UC-04: Refresh reviewed Anki vocabulary

1. The user chooses Local Anki connection or Anki package.
2. Monosai discovers available decks, note types, and fields.
3. The user creates one or more explicit source mappings and enables the desired mappings.
4. A manual refresh reads only cards reviewed at least once and extracts the selected field's visible text literally.
5. Monosai shows counts for queried cards, eligible notes, empty values, duplicates, provider errors, and unique entries.
6. The user confirms replacement of the current vocabulary snapshot.

Acceptance:

- No write-capable Anki action exists in the production adapter.
- An unsuccessful or cancelled refresh never changes the current vocabulary.
- Package import refuses to call entries reviewed when usable scheduling/review evidence is absent.
- Simple duplicates are deduplicated while source provenance is retained.

### UC-05: Generate a story

Prerequisites:

- A remembered OpenRouter key.
- A successfully tested exact text-model ID.
- A completed current snapshot containing at least 50 unique entries.
- A non-empty premise.

A grammar preset is always set, so it is never a prerequisite. When the selected preset is far above what the snapshot can supply, the prerequisite panel shows a non-blocking warning that generation is likely to produce unknown vocabulary.

Flow:

1. The user enters a premise, chooses Micro (4–6 sentences) or Short (13–20), optionally enters special instructions, and starts.
2. Monosai displays cancellable progress through preparation, writing, parsing, local validation, exception review, repair if needed, grammar review, translation, and finalization.
3. Ordinary vocabulary is validated locally. Candidate exceptions are reviewed against the captured exception policy. Unknowns receive at most two targeted repair attempts.
4. If unknowns remain, the result is shown as an unsaved marked draft.
5. If vocabulary validation succeeds, auxiliary grammar/translation failures are recorded but do not discard the story.
6. The accepted story is saved automatically and opened in the reader.

Acceptance:

- Cancellation before finalization saves no story.
- Sentence count is checked locally.
- The title and Japanese sentences are validated; translations are never used as validation input.
- The library never labels a story strictly valid when it contains exceptions, unknowns, or incomplete validation.

### UC-06: Inspect a word

The inspector provides surface form, normalized lemma when available, hiragana reading, part of speech, compact offline English glosses, validation category, captured source/explanation, sentence context, and an appropriate next action. A missing dictionary entry is a normal explicit state.

### UC-07: Translate imported content

- A sentence action generates one translation and caches it.
- A whole-reading action confirms sentence count, processes only missing/currently incompatible translations, shows progress, permits cancellation, caches each success immediately, and can resume.
- Existing translations remain viewable if the text-model setting changes. They are labeled with stored provenance; v1 has no regenerate control unless the cached result is stale/failed.

### UC-08: Analyze imported grammar

The user explicitly requests analysis for one sentence. The response identifies likely grammar points and out-of-profile constructions, includes English explanations, captures the grammar-profile hash, and is advisory. If the profile changes, the result is shown as stale with a re-analyze action.

### UC-09: Prepare and play audio

- Individual sentence audio is generated on demand using the configured TTS model/voice and cached.
- Whole-reading playback first prepares every missing clip in sentence order. Playback starts only after the complete compatible set exists.
- Cancellation stops future requests and preserves completed clips.
- Failure identifies the sentence and permits retry. Reading and translation remain available.
- The reader header always exposes an Audio toggle with stateful accessible naming. Opening shows a compact fixed player without requesting or playing audio; closing calls playback Stop, clears the active sentence and cursor, and does not cancel generation.
- The player supports Previous, Play/Pause/Resume, Next, current-sentence indication, progress, and starting from the captured current reading sentence. Previous and Next do not wrap and remain disabled until a sentence is active. Ready-state Stop is the header toggle rather than a player control; generation retains its own Stop action.

### UC-10: Browse, filter, and delete

- Library is newest first and filters by All, Imported, and Generated. The filter appears only once the shelf holds at least eight readings.
- A card shows the reading's title, the opening of its text in Japanese, and one line of metadata. Monosai records no reading position, so there is no Continue reading card and no progress indicator (ADR 0025).
- Deletion requires confirmation, removes the reading and its owned translations, grammar analyses, audio, and token data in one transaction, and returns focus predictably.
- Deleting a story does not delete the shared current vocabulary.

## 4. Functional rules

### Imported versus generated readings

| Rule | Imported | Generated |
| --- | --- | --- |
| Source text | Learner | OpenRouter |
| Post-save editing | No | No |
| Vocabulary snapshot | Current vocabulary, dynamically reclassified | Frozen validation evidence captured at creation |
| Unknown vocabulary | Informational | Blocks acceptance after repairs |
| Translation | Explicit per sentence/batch | Attempted automatically after validation; retryable |
| Grammar review | Explicit per sentence | Automatic advisory review |
| Exception policy | Not used for acceptance | Captured and applied during pipeline |
| Deletion | Yes | Yes |

### Global reader preferences

The following are global, persist locally, and start enabled: furigana, token spacing, validation/status markers, and translation expansion when a translation exists. Theme defaults to System. Changing a preference updates every open/future reading. Preferences are not stored per reading.

### Reading progress

Progress is based on stable paragraph and sentence IDs, not only scroll offset. Update progress when a sentence becomes the primary viewport sentence and on route exit. Debounce writes. If an old target no longer exists after a migration, fall back to the nearest surviving paragraph, then the beginning.

### Deletion and reset

- Individual deletion is permanent and confirmed.
- Clearing audio deletes only audio blobs/jobs.
- Removing the API key does not remove readings or cached aids.
- Full reset deletes all Monosai IndexedDB databases and caches after a second, explicit confirmation and reloads into first-use state.

## 5. Failure taxonomy and required messaging

Errors must use distinct typed categories and user language:

- Offline/unreachable network.
- OpenRouter authentication, insufficient access, rate limit, provider unavailable, invalid model, malformed response, or unsupported task capability.
- TTS model/voice incompatibility.
- Anki application/bridge not running, connection timeout, permission or origin denial, unsupported API action, malformed response, or query failure.
- Package unreadable, unsupported format/schema/compression, missing collection database, missing scheduling evidence, or resource/safety limit exceeded.
- Missing deck/note type/field after a source changed.
- Local parsing/worker failure.
- Unknown generated vocabulary.
- Advisory grammar warning versus grammar-review unavailable.
- Browser storage quota, denied persistence, failed transaction, or corrupted stored record.

Every error state provides: what failed, what did not fail, whether data was saved, a primary next action, and a secondary escape path. Never recommend installing the native AnkiDroid API because the PWA cannot use it.

## 6. Non-functional requirements

### Performance

- App shell becomes interactive within a reasonable mobile budget after first cache; large language assets load lazily behind a clear initialization state.
- Long parsing and validation never occupy the main thread for more than one animation frame at a time.
- Reader scrolling remains smooth for 50,000-character imports; render by paragraph/window rather than mounting every inspector overlay.
- IndexedDB queries use bounded indexes and pagination. Avoid loading audio blobs or all token JSON when rendering the library.

### Reliability

- All multi-record saves use transactions.
- External responses are validated before entering the domain.
- Jobs are idempotent by cache key.
- Service-worker updates never reload during unsaved import review or an active job.
- Existing data remains readable across schema migrations or the migration fails without destroying the previous database.

### Accessibility

Target WCAG 2.2 AA. All actions are keyboard operable, touch targets are at least 44 CSS pixels where practical, focus is visible, status is not color-only, dialogs trap/restore focus, hover content is available on focus/click, Japanese/English use correct language metadata, text reflows at 320 CSS pixels and 400% zoom, reduced motion is honored, and audio never autoplays.

### Security and data handling

- Render imported and provider text as text nodes, never trusted HTML.
- Never interpolate learner text into executable templates.
- Redact credentials and request authorization headers from all logs/errors.
- Use no third-party runtime scripts, analytics, remote fonts, or CDNs.
- Restrict network destinations to the static host, configured OpenRouter endpoint, and local Anki endpoints.
- UI must label actions that require OpenRouter or local Anki so network behavior is understandable, without adding a dedicated policy page.

## 7. Product acceptance checklist

V1 is product-complete only when every use case above passes on Windows Chrome and Android Chrome, first-use reading requires no setup, generated acceptance cannot bypass local validation, Anki adapters contain no write action, all promised offline behaviors pass after network removal, storage/cancellation semantics match this document, and every deliberate exclusion remains absent from the primary UI.
