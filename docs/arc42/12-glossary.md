# 12. Glossary

The terms Monosai's code and these chapters use. Where a term names a type, the file is given.

| Term | Definition |
| --- | --- |
| **Reading** | Any saved content that opens in the reader. It is either imported or generated, and it is immutable once saved |
| **Imported reading** | A reading made from Japanese the learner supplied, by pasting it or opening a `.txt` file |
| **Generated story** | A reading written by the text provider and validated against the learner's vocabulary before it was saved |
| **Paragraph window** | The bounded run of paragraphs the reader has mounted. It moves as the learner scrolls; it does not grow without limit. [ADR 0011](../decisions/0011-paragraph-window-bounds.md) |
| **Token** | One word as the tokenizer identified it, with its surface, reading, lemma, and part of speech |
| **Vocabulary source** | One configured way to read reviewed vocabulary: a desktop connection, an Android bridge, a package file, or a text list |
| **Source mapping** | One explicit choice of deck, note type, and expression field within a source |
| **Vocabulary snapshot** | The one current, deduplicated set of eligible expressions, produced by the most recent successful refresh |
| **Current snapshot** | The single snapshot row that is live. A refresh replaces it atomically. A failed or cancelled refresh leaves it unchanged |
| **Structural baseline** | Curated grammar and function words that are always allowed, because Japanese sentences cannot be formed without them. It is not starter vocabulary. [ADR 0015](../decisions/0015-structural-baseline-stays-curated.md) |
| **Grammar profile** | The learner's device-wide setting: one of six ordered difficulty presets, a register preference, and optional edited guidance. There is no rule catalog and no per-rule selection. [ADR 0008](../decisions/0008-grammar-profile-presets.md), [ADR 0014](../decisions/0014-remove-grammar-rule-catalog.md) |
| **Preset** | One of the six ordered difficulty levels, named for the grammar the learner commands rather than for a JLPT level. They are cumulative |
| **Exception policy** | One device-wide sentence the learner writes, which the AI applies to generated words that Anki does not cover |
| **Known** | Validated locally, against the current snapshot or against a generated story's frozen evidence |
| **Exception** | Not known through Anki, but accepted by the exception review under the captured policy |
| **Unknown** | Accepted by no authoritative check. It is marked in the reader, never hidden. [ADR 0033](../decisions/0033-unresolved-unknown-words-are-marked-not-rejected.md) |
| **Frozen validation** | The evidence a generated story was judged against, stored with the story so its history stays reproducible |
| **Auxiliary aid** | A translation, an advisory grammar review, or audio. An aid that fails does not make valid Japanese invalid |
| **Provider configuration fingerprint** | A stable hash of the model, the voice and options, the prompt version, and the relevant profile version. It is the cache key for an AI result |
| **Port** | An interface declared in `domain/`, injected through a token in `application/shared/`, and satisfied by an adapter in `infrastructure/` |
| **Adapter** | The one implementation that talks to a real external system on a port's behalf |
| **`Result`** | The success-or-typed-failure value used at every boundary instead of a thrown exception |
| **Technical code** | The stable `domain/code` string shown on an error screen for the learner to copy |
| **Layer zone** | One entry in the lint rule that forbids an import direction. [`eslint.config.js`](../../eslint.config.js) is the authority |
| **Language worker** | The Web Worker that holds the tokenizer, the dictionary index, and the compiled vocabulary matcher |
| **Package worker** | The Web Worker that unzips an Anki package and queries the SQLite collection inside it |
| **Shared inbox** | The Cache Storage location where the service worker leaves a package that Android's share sheet posted. [ADR 0036](../decisions/0036-android-package-share-target.md) |
