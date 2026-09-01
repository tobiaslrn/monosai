# Vocabulary sources, Anki integration, and language processing

## 1. Non-negotiable rules

- All Anki access is read-only.
- The production code contains an allowlist of permitted actions; it does not expose a generic action method to application code.
- Vocabulary sources are explicit records, each independently included in or
  left out of the combined vocabulary. Inclusion is separate from automatic
  syncing, in the model and in the UI. Anki sources
  select a deck, note type, and expression field; text-list sources contain one
  literal expression per line.
- A vocabulary item is eligible only when at least one associated card in the selected deck has been reviewed at least once.
- Every source keeps its most recent successfully read entries locally. Updating
  one source rebuilds one immutable combined snapshot from all enabled source
  caches; an unavailable source never erases its last successful entries.
- AnkiConnect sources may refresh automatically after startup and when the app
  returns to the foreground. Automatic work is non-blocking, rate-limited, and
  never makes application startup fail.
- Ordinary generated vocabulary validity is determined locally, never by the LLM.
- Provider limitations and missing review evidence are reported rather than guessed around.

## 2. Providers and capability negotiation

Implement three adapters behind `AnkiVocabularyProvider`.

### Desktop AnkiConnect

Use the fixed local endpoint(s) supported by the selected AnkiConnect version. Begin with a version/permission probe, then capability-test only required read operations. The adapter may use actions equivalent to:

- version/request-permission capability probe;
- deck discovery;
- note-type/model discovery;
- field discovery;
- reviewed-card or note search;
- batched note/card information reads.

Exact action selection is adapter-internal. Never invoke add/update/delete/media/sync/deck mutation actions.

### Android AnkiConnect-compatible bridge

Use the installed unofficial bridge at its fixed local endpoint. Do not assume desktop action completeness. Probe each required action and record capabilities. Prefer a reviewed-note search such as selected deck plus non-new/reviewed criteria when supported, followed by batched note information. If the bridge cannot prove review eligibility or return mapped fields reliably, return `review-evidence-unsupported` and present package import.

Do not tell users that Monosai can install, configure, start, or obtain native permissions from AnkiDroid. Provide concise instructions to open/configure the bridge outside Monosai.

### Package provider

Accept `.apkg` and `.colpkg` chosen by the user. Process entirely in a dedicated worker:

1. Inspect archive structure without extracting media.
2. Reject encrypted archives, unsafe paths, decompression bombs, unsupported compression/schema, and configured resource-limit violations.
3. Locate the supported collection database variant.
4. Decompress only required metadata/database members.
5. Open the collection in a transient in-memory database implementation.
6. Discover decks, note types, field names, cards, notes, and review/scheduling evidence.
7. Execute the same mapping/eligibility semantics as local providers.
8. Close the DB, revoke URLs, terminate worker, and release buffers.

Package support must be fixture-driven across representative current Anki Desktop and AnkiDroid exports. The implementation agent must document supported collection members/schema versions in diagnostics and tests. Unsupported versions fail clearly; do not attempt destructive in-place conversion.

### Pasted text list

Accept text pasted by the learner and store it locally as a named source. Normalize
line endings, trim surrounding Unicode whitespace, and ignore blank lines. Each
remaining line is one literal vocabulary expression: preserve internal whitespace,
punctuation, slashes, phrases, and spelling. Exact canonical duplicates merge in
the combined snapshot while provenance retains every contributing source.

Editing a text list updates only that source cache and rebuilds the combined
snapshot. It must not require Anki or network access.

## 3. Capability model

```ts
interface AnkiCapabilities {
  apiVersion: string;
  canDiscoverDecks: boolean;
  canDiscoverNoteTypes: boolean;
  canDiscoverFields: boolean;
  canFilterReviewed: boolean;
  canReadNoteFields: boolean;
  maxBatchSize?: number;
  limitations: readonly CapabilityLimitation[];
}
```

The mapping UI is enabled only when discovery is complete. Refresh is enabled only when every enabled mapping can be resolved and the provider can prove reviewed eligibility.

### Required error variants

`not-running`, `bridge-not-running`, `addon-missing-or-unreachable`, `permission-denied`, `origin-not-allowed`, `timeout`, `unsupported-api`, `unsupported-action`, `malformed-response`, `deck-discovery-failed`, `note-type-discovery-failed`, `field-discovery-failed`, `review-evidence-unsupported`, `query-failed`, `package-unreadable`, `package-schema-unsupported`, `package-review-data-missing`, `package-resource-limit`, `cancelled`, `unknown`.

UI messaging must preserve these distinctions.

A browser cannot see why a local request failed, so no variant may be inferred that the application has no evidence for. A page served from anywhere other than `http://localhost` or `http://127.0.0.1` is outside AnkiConnect's default origin allowlist and is refused by the add-on, which is reported as `origin-not-allowed` with the page's own origin as the cause. See ADR 0017.

## 4. Vocabulary sources

Vocabulary source configuration is a discriminated union. Shared fields are a
stable id, learner-facing label, enabled state, timestamps, and source kind.
Anki sources additionally contain provider kind and the mapping below. Text-list
sources contain their normalized local text. Provider-specific fields must never
be faked on another source kind.

```ts
interface SourceMapping {
  id: string;
  providerKind: AnkiProviderKind;
  deckName: string;
  noteTypeName: string;
  expressionFieldName: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}
```

- Dropdown values are discovered, never free-typed.
- Multiple mappings may point at one deck when note types/fields differ.
- Selecting a parent deck follows the provider's normal deck-query semantics and includes descendants only if the displayed label explicitly says so. Store the exact query scope with the mapping.
- A mapping is stale when a selected identifier no longer exists. Stale mappings block refresh until repaired/disabled/removed.
- A source refresh replaces only that source's cache. Snapshot rebuilding always
  combines the latest successful caches of all enabled sources. There is no
  per-generation source selection.

### Automatic AnkiConnect synchronization

- Automatic sync applies only to included desktop/Android connection sources that
  opt in. Package and pasted-list sources are never polled.
- Trigger after successful app initialization and when a hidden app becomes
  visible or regains focus. Coalesce concurrent triggers and enforce a cooldown.
- Unavailable, offline, timeout, and cancellation results are non-destructive.
  Keep the current snapshot and retry later.
- Probe, discover, validate every enabled mapping for that provider, and read all
  entries before replacing any source cache.
- If a valid result is unexpectedly empty while that source previously contained
  entries, hold it for explicit user confirmation instead of silently emptying it.
- A successful automatic refresh that leaves the combined canonical expression
  set unchanged is silent, even when source records, provenance, or timestamps
  differ.
- Do not use service-worker Background Sync and do not cache Anki HTTP responses.

### Manual source sync

- Every live connection source offers a manual read, whether or not it syncs
  automatically. Package and pasted-list sources have nothing to read again and
  offer none.
- A manual read uses the same reader, the same completeness rule, and the same
  unexpectedly-empty guard as the automatic one. It is cancellable while it
  runs, and cancelling writes nothing.
- Any failure before or during the commit leaves the current vocabulary exactly
  as it was, states so, and is retried by pressing the same control again.
- There is no online check: AnkiConnect answers on the loopback address, so a
  device with no network can still sync. An unreachable Anki fails the probe and
  is reported as such.

## 5. Reviewed eligibility

For each selected mapping, include a note's field value when:

1. The note matches the exact selected note type.
2. At least one card for that note is within the selected deck scope.
3. At least one such card has review evidence equivalent to `reps > 0` or a provider query that excludes never-reviewed/new cards.

Suspended, buried, lapsed, or mature state does not remove eligibility after at least one review. Optional scheduling signals are normalized per note: the lowest positive `reps`, the highest `lapses / reps` ratio, and the lowest non-zero ease factor across eligible cards. Missing columns remain valid and produce neutral palette weighting; these signals never change the complete vocabulary allowlist.

When a provider returns notes rather than cards, its query semantics must be contract-tested to prove that each returned note has at least one qualifying card. If that cannot be established, the adapter cannot create a snapshot.

## 6. Literal field extraction

The learner intentionally chooses the field. Monosai does not split, choose among variants, or reject sentence-like values.

Extraction rules:

1. Read the selected field value.
2. Parse any markup into an inert document and extract visible text only. Remove script/style/media content. Never render provider HTML.
3. Decode entities as part of visible-text extraction.
4. Normalize CRLF/CR to LF and trim leading/trailing Unicode whitespace.
5. Reject only missing-field, empty/whitespace-only, or values that cannot produce safe visible text.
6. Preserve internal whitespace, punctuation, slashes, line breaks, phrases, and multiple expressions literally.
7. Do not convert kana/kanji, split on separators, or use the dictionary to rewrite the field.

The canonical expression applies only Unicode normalization and the documented whitespace/newline normalization needed for stable hashing. It does not change lexical content.

Because entries may be phrases, analyze each field into a token sequence and support longest-sequence matching during validation. An odd literal value may never match generated output; that is accepted product behavior, not an import warning.

## 7. Deduplication and provenance

- Compute an expression hash from the canonical visible expression.
- Merge exact canonical duplicates across mappings into one `VocabularyItem`.
- Retain one `VocabularyProvenance` record per source mapping/note where practical. Source note IDs are diagnostic metadata and may be omitted by providers that do not expose them safely.
- Do not deduplicate distinct orthographies merely because dictionary lemmas coincide. They can share normalized lookup forms but remain distinct items.
- Unique-entry count, used by the 50-entry gate, counts deduplicated canonical expressions.

## 8. Refresh workflow

State machine:

```text
idle -> probing -> discovering/validating mappings -> querying
     -> extracting -> analyzing -> summarizing -> awaiting confirmation
     -> committing -> complete
```

Any pre-commit state can transition to `cancelled` or a typed failure. Only committing is non-cancellable. Temporary extracted data lives in worker/session storage and is discarded after failure/cancel.

Summary includes:

- mappings queried;
- cards/notes examined when the provider supplies reliable counts;
- reviewed eligible notes;
- non-empty extracted values;
- rejected missing/empty values;
- exact duplicate occurrences;
- unique expressions;
- provider warnings/limitations.

Confirmation transaction replaces the single current snapshot, items, provenance, and statistics atomically. The existing snapshot identity is reused when one exists, and generated-story links are kept on that identity. If the transaction fails, the previous current vocabulary remains unchanged.

## 9. Language pipeline

### Sentence segmentation

Segmentation operates paragraph by paragraph and preserves all source characters. Use a deterministic Japanese-aware segmenter with versioned rules. It must handle `。！？`, paired quotes/brackets, ellipses, repeated punctuation, dialogue lines, and paragraph endings. Avoid splitting on punctuation inside paired Japanese quotation marks where the sentence continues.

The implementation may combine `Intl.Segmenter` and explicit rules only if output is deterministic across supported Chrome versions; otherwise ship a versioned implementation. Fixture tests are authoritative.

### Tokenizer selection gate

The implementation agent selects the concrete tokenizer. It must:

- run fully offline in current Chrome/Android Chrome;
- run inside a Web Worker;
- return surface, lemma/base form, reading, part of speech, and inflection form;
- preserve offsets against original text;
- support Japanese inflection needed for known-form matching;
- initialize within documented mobile memory/time budgets;
- permit asset redistribution with attribution;
- pass the golden corpus in testing-and-delivery.md.

Default selection rule: use the smallest maintained browser-compatible tokenizer that passes every gate. Kuromoji.js is the fallback candidate if no better maintained option passes. Wrap it behind `Tokenizer`; no feature imports its library types.

### Inflection form

The analyzer reports which shape a conjugating word is in — dictionary form,
irrealis, continuative, hypothetical, imperative — alongside its part of speech.
It is mapped onto a bounded enum in infrastructure, exactly as part of speech is,
and library tags never leave that layer.

It is what makes an inflection that adds no ending explainable: the ば of 行けば
is a separate word and 行け as an order has no second token, so the head's own
form is the only evidence either exists. The reader uses that evidence when it
names compact form summaries; it does not infer a classification from the
surface string (ADR 0028).

### Analyzer output integrity

- Every nonempty source range is represented by a token or explicit unclassified span.
- Convert readings to hiragana for display/matching while retaining source surface.
- Kana-only tokens do not receive redundant ruby.
- Whole-token ruby is acceptable; per-kanji alignment is out of scope.
- POS mapping converts library-specific tags to Monosai's bounded enum while retaining optional raw tags in infrastructure diagnostics only.

## 10. Dictionary

Bundle a compact common-word Japanese–English dataset. Dataset selection must:

- permit static redistribution in a public application;
- include written forms, readings, English glosses, and part-of-speech data;
- have versioned reproducible build inputs and required attribution included in the asset manifest/source distribution;
- fit the agreed core-only offline budget set by implementation performance testing;
- contain no runtime network dependency;
- pass lookup fixtures for common beginner vocabulary, kana-only words, orthographic variants, and inflections.

Build a compact lookup artifact at development time. Do not import the raw source into Dexie per user. Lookup order:

1. Exact surface plus compatible POS.
2. Exact lemma plus compatible POS.
3. Reading plus compatible POS.
4. Exact surface or lemma whose POS disagrees.
5. Canonical orthographic variants supplied by the dataset.

A query is about a whole word, not a morpheme: the surface is the word as
written and the lemma, POS, and bounded verb conjugation family come from its head. POS gates the exact steps
because a spelling can be shared by unrelated words — the あり of あります is
spelled like 蟻, "ant" — and a disagreeing tag is still better evidence than no
entry, which is why step 4 exists.

Before applying the result bound, prefer a compatible verb conjugation family
when both analyzer and dictionary provide one. For a kana lookup, prefer senses
JMdict marks as usually written in kana. Preserve artifact order for remaining
ties and fall back to POS-only matching if the finer metadata has no compatible
candidate.

Return a bounded number of prioritized common senses. The UI shows “No bundled definition” when none is found and never silently makes an online lookup.

## 11. Grammar presets and structural baseline

Monosai ships **no enumerated grammar rule dataset**. The N5–N1 catalog this section once required was built, found not to pay for itself, and deleted; see [ADR 0014](../decisions/0014-remove-grammar-rule-catalog.md).

Grammar difficulty is carried by six ordered presets, each a prose `promptGuidance` string. Requirements:

- a stable preset ID and a contiguous `order` from zero, easiest first;
- a name stating the grammar the learner commands, never containing a JLPT level; the caption records where those patterns are conventionally taught, and the application must not claim JLPT publishes an official exhaustive list;
- guidance bounded at 1,000 characters, plain text, free of unsafe HTML;
- a worked Japanese example with its English gloss, so the learner chooses by reading rather than by self-reporting;
- register guidance for spoken, written, and a neutral choice, the last of which must be empty;
- manual language review of all six guidance texts before release.

Japanese patterns quoted inside guidance are prose, not keys into any table. The build validates their shape — non-empty, no punctuation carried in from the surrounding sentence, no pattern named twice in one string — and nothing more.

The structural baseline is a separate, Monosai-versioned dataset containing particles, auxiliary/copular forms, punctuation, productive inflection, counters/classifiers needed structurally, and other explicitly enumerated sentence-building forms. It must not include general starter content nouns, verbs, or adjectives. Publish the list in-app as read-only, grouped by category.

The grammar profile guides prompts and advisory review. It is not a deterministic local grammar validator.

## 12. Vocabulary matcher and validation

Compile a snapshot matcher in the language worker using:

- canonical surface lookup;
- normalized lemma/readings;
- orthographic variants explicitly supported by the tokenizer/dictionary normalization rules;
- phrase token sequences in a longest-match trie/automaton;
- structural baseline matcher;
- entity recognizers for numbers, dates, times, punctuation, and tokenizer-supported proper-name categories.

### Precedence

1. Punctuation/symbol formatting.
2. Longest exact/normalized Anki phrase.
3. Exact Anki single-token form.
4. Normalized/inflected Anki form.
5. Structural baseline.
6. Deterministic recognized entity.
7. Candidate unknown for exception review/repair.

Precedence prevents a shorter known entry from masking a longer literal phrase. Record all supporting vocabulary IDs when ambiguous, but show one stable primary explanation.

### Imported readings

Classify against the current snapshot when markers or inspector data are requested. No snapshot yields an explicit `vocabulary-not-configured` state rather than marking every word unknown. Nonmatches use `not-in-snapshot` and never reject the reading.

### Generated stories

Validate title and every sentence against the captured snapshot. Classification completes locally before exception review. Candidate unknowns are sent to exception review only as described in the AI specification. Accepted story validation is frozen with validator/analyzer versions.

### Normalization limits

Allowed normalization must be deterministic and explainable: Unicode form, kana reading normalization, tokenizer lemma/inflection, documented common orthographic variants, and literal phrase matching. Do not accept semantic synonyms, model claims, dictionary similarity, fuzzy edit distance, or kanji-sharing as proof of known vocabulary.

## 13. Furigana and rendering contract

- Furigana comes from tokenizer readings and uses hiragana.
- Suppress readings identical to kana surface after script normalization.
- Render whole-token `<ruby>` and `<rt>`; preserve punctuation outside ruby when tokenizer offsets allow.
- Every interactive token retains its original contiguous text. Never replace the Japanese with dictionary canonical spelling.
- Token-spacing CSS and ruby CSS must pass narrow-screen, 200% text scaling, mixed kana/kanji, long token, quotation, and line-wrap fixtures.

## 14. Language-processing acceptance

- A generated inflection of a reviewed dictionary-form verb validates through an explainable lemma relationship.
- A semantic synonym not present in Anki remains unknown.
- A reviewed multi-token phrase wins longest-match classification.
- Imported nonmatches remain readable and informational.
- Titles are subject to the same generated-story validation policy.
- All field content is rendered inert; malicious Anki HTML cannot execute.
- Package parsing never extracts media or writes to the user's Anki collection.
- The main thread remains responsive while parsing a 50,000-character chapter and a large supported package fixture.
