# 9. Architecture Decisions

## 9.1 How decisions are recorded

Every architecturally significant decision has one record in [`docs/decisions/`](../decisions/). A
record states the context, the decision, and the consequences, and it stays in place after the fact.
A superseded record is not deleted; the record that replaced it says so.

These arc42 chapters never repeat a record's reasoning. They describe the system and link to the
record for the reason. [Chapter 4](04-solution-strategy.md) links the five decisions that shape
everything else.

Two notes on the numbering. The records are ordered by when the decision was made, not by importance.
Two records share the number `0028`, which is a real duplicate that is left as it is, because the
files are already linked from code comments and from other records.

## 9.2 Index

### Persistence and data integrity

| ADR | Decision |
| --- | --- |
| [0002](../decisions/0002-hashing-and-canonical-serialization.md) | Hashing algorithm and canonical serialization |
| [0004](../decisions/0004-persistence-shape.md) | Persistence shape decisions |
| [0012](../decisions/0012-resume-basis.md) | Resume basis: exact, nearest, or beginning, stated rather than hidden |
| [0042](../decisions/0042-cross-tab-reading-mutations.md) | Tabs tell each other about deleted readings, and format in one locale |

### Language processing

| ADR | Decision |
| --- | --- |
| [0005](../decisions/0005-tokenizer-selection.md) | Japanese tokenizer selection |
| [0006](../decisions/0006-dictionary-dataset.md) | Bundled dictionary dataset |
| [0007](../decisions/0007-grammar-catalog-and-structural-baseline.md) | Grammar catalog and structural baseline |
| [0008](../decisions/0008-grammar-profile-presets.md) | Grammar profile as difficulty presets |
| [0009](../decisions/0009-language-protocol-v2-analyze-sentences.md) | Language protocol version 2 and `analyze-sentences` |
| [0010](../decisions/0010-sentence-text-boundary-trimming.md) | Sentence text drops the line breaks and padding that end a segment |
| [0014](../decisions/0014-remove-grammar-rule-catalog.md) | Remove the grammar rule catalog |
| [0015](../decisions/0015-structural-baseline-stays-curated.md) | The structural baseline stays curated, not derived from part-of-speech tags |
| [0026](../decisions/0026-word-derivation-ladder.md) | Word details read as a derivation ladder, built from the analyzer's inflection form |
| [0029](../decisions/0029-ambiguous-kana-dictionary-ranking.md) | Ambiguous kana dictionary lookup uses morphological ranking |

### Anki

| ADR | Decision |
| --- | --- |
| [0016](../decisions/0016-anki-package-parsing.md) | Anki package parsing |
| [0017](../decisions/0017-anki-connect-origin-policy.md) | What an opaque AnkiConnect failure is called |
| [0036](../decisions/0036-android-package-share-target.md) | Android package sharing uses a service-worker inbox |

### AI providers and generation

| ADR | Decision |
| --- | --- |
| [0018](../decisions/0018-openrouter-request-boundary.md) | OpenRouter request boundary and error model |
| [0019](../decisions/0019-generated-story-structure.md) | Generated story structure and where prompts live |
| [0020](../decisions/0020-persisted-structured-output-mode.md) | Persisting the tested structured-output mode |
| [0021](../decisions/0021-enrichment-provider-port.md) | One batched translate, and separating producing records from storing them |
| [0030](../decisions/0030-unified-model-selection.md) | Unified model selection and scoped overrides |
| [0033](../decisions/0033-unresolved-unknown-words-are-marked-not-rejected.md) | A word repair could not replace is marked, not a reason to throw the story away |
| [0040](../decisions/0040-speech-capabilities-are-declared.md) | The catalog declares speech capabilities, the probe confirms them |
| [0044](../decisions/0044-backgrounded-story-generation.md) | A story is written by a job, not by a screen |

### The reader

| ADR | Decision |
| --- | --- |
| [0011](../decisions/0011-paragraph-window-bounds.md) | Paragraph window bound, radius, step, and moving rather than growing |
| [0022](../decisions/0022-reader-floating-popover.md) | One floating popover replaces the reader's side panel and bottom sheet |
| [0023](../decisions/0023-japanese-only-reading-surface.md) | The reading surface carries Japanese and nothing else |
| [0025](../decisions/0025-reader-as-the-centre.md) | The reader is the centre: no navigation, no reading position, one place for audio |
| [0028](../decisions/0028-word-form-summary-popup.md) | Word details use a compact form summary |
| [0031](../decisions/0031-touch-reading-gestures-and-docked-details.md) | On touch, a long press selects a sentence and details dock as a sheet |
| [0032](../decisions/0032-touch-word-taps-and-one-selection-colour.md) | A tap on a phone is one press, one colour, and one open thing |

### Audio

| ADR | Decision |
| --- | --- |
| [0024](../decisions/0024-audio-cache-and-playback-ownership.md) | Audio cache keys and who owns playback |
| [0028](../decisions/0028-floating-audio-player.md) | Floating audio player |
| [0034](../decisions/0034-progressive-four-way-audio.md) | Progressive playback and four-way audio generation |
| [0035](../decisions/0035-priority-retry-audio-queue.md) | Priority retries for whole-reading audio |
| [0037](../decisions/0037-audio-transport-recovery-and-one-track.md) | Audio transport recovery, navigation, and one track |
| [0038](../decisions/0038-minimal-audio-player.md) | A player that says nothing and shows its state |
| [0039](../decisions/0039-continuous-android-audio.md) | Continuous Android audio uses one native media resource |
| [0041](../decisions/0041-playback-ends-with-the-reader.md) | A reading session ends when the reader is left |
| [0045](../decisions/0045-a-reading-is-extended-while-it-is-generated.md) | A continuous reading is extended while it is generated |

### Platform and toolchain

| ADR | Decision |
| --- | --- |
| [0001](../decisions/0001-angular-21-toolchain.md) | Angular toolchain and unit-test environment |
| [0003](../decisions/0003-architectural-boundary-enforcement.md) | Architectural boundary enforcement |
| [0013](../decisions/0013-cdk-overlay-stylesheet-requirement.md) | The CDK overlay and accessibility stylesheets are a hard build requirement |
| [0027](../decisions/0027-pwa-caching-and-update-activation.md) | PWA caching boundaries and update activation |
| [0043](../decisions/0043-voice-changes-hide-clips-and-say-so.md) | Changing the voice hides clips, and both screens say so |
