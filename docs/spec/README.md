# Monosai specification

Status: implementation-ready v1 specification  
Product: Monosai  
Delivery: static, installable Angular PWA hosted on GitHub Pages  
Official clients: current Google Chrome on Windows and Android 12+

## 1. Purpose

Monosai is a local-first Japanese reading application for learners, especially absolute beginners with approximately 50–1,800 reviewed vocabulary entries. It has two equal content paths:

1. Read Japanese supplied by the learner by pasting text or opening a UTF-8 `.txt` file.
2. Generate short Japanese stories constrained by vocabulary the learner has reviewed in Anki.

Reading does not require Anki, an OpenRouter key, or a network connection after the application assets have been cached. AI features are optional additions for story generation, translation, advisory grammar analysis, exception review, and cloud text-to-speech.

Monosai does not manage Anki or provide spaced repetition. It reads eligible vocabulary and turns it into reading support. Anki remains the source of review history.

## 2. Canonical decisions

This suite supersedes both earlier Monosai drafts wherever they conflict. The following decisions are intentional:

- The product is a public bring-your-own-key application, not a private prototype.
- It remains a static PWA with no backend, accounts, telemetry, analytics, or sync.
- Angular and Dexie/IndexedDB replace the proposed persistent SQLite/OPFS architecture.
- Chrome is the only officially supported browser family in v1.
- Android Anki access uses an installed AnkiConnect-compatible bridge when it works; it does not use native Android APIs directly.
- `.apkg` and `.colpkg` package parsing is a first-class fallback on Windows and Android.
- Users enter their own story premise. Topic suggestions and genre metadata are excluded.
- The model chooses Japanese register. A per-generation special-instructions field can guide it.
- Both story forms become available at 50 unique reviewed entries; story length is not tied to vocabulary count.
- The grammar profile is one choice from six ordered difficulty presets carrying prose guidance, plus a register preference and an optional user-edited variant. There is no rule catalog and no per-rule selection.
- Reader aids start enabled globally rather than opening in a natural-text-only mode.
- Imported readings use the current vocabulary snapshot. Generated stories retain the stable current-snapshot identity and their frozen validation evidence.
- Individual readings can be deleted. Search, editing, export, backup, and sync remain excluded.
- The bundled dictionary is a compact common-word dictionary only.
- Whole-reading audio is fully prepared before playback; successful clips survive cancellation.

## 3. Required implementation stack

- Current stable Angular, standalone components, signals, Angular Router, strict TypeScript.
- Angular CDK primitives for focus management, overlays, dialogs, and accessibility.
- SCSS component styles and CSS custom properties for design tokens; no runtime CSS framework dependency.
- Dexie over IndexedDB for application persistence.
- Angular service worker for application-shell and immutable language-asset caching.
- Web Workers for tokenization, long-text analysis, vocabulary matching, and Anki package processing.
- Runtime schema validation at every external boundary. The implementation may select the validation library, but schemas must infer or declare TypeScript types from a single source.
- Playwright for end-to-end tests, Angular's supported unit-test runner for unit/component tests, and automated accessibility checks.

The concrete tokenizer and open grammar dataset are implementation-time dependency selections. They must satisfy the selection gates in [Anki and language processing](anki-and-language-processing.md); their choice must not alter domain interfaces.

## 4. Document map

| Document | Authority |
| --- | --- |
| [Product requirements](product-requirements.md) | Users, use cases, scope, behavior, failure policy, product acceptance |
| [UX/UI specification](ux-ui-specification.md) | Navigation, screens, interactions, responsive behavior, visual system, accessibility |
| [System architecture](system-architecture.md) | Modules, dependency rules, runtime topology, workers, offline/PWA behavior, security boundaries |
| [Domain and data model](domain-and-data-model.md) | Canonical types, persistence schema, identity, immutability, caching, migrations |
| [Anki and language processing](anki-and-language-processing.md) | Provider adapters, package import, current vocabulary, parsing, dictionary, furigana, validation |
| [AI pipelines](ai-pipelines.md) | OpenRouter configuration and generation, repair, translation, grammar, exception, and TTS workflows |
| [AI model configuration](ai-model-configuration.md) | *Proposed.* Connections, model profiles, capability probes, and per-feature routing. Supersedes the configuration sections of AI pipelines on acceptance |
| [Testing and delivery](testing-and-delivery.md) | Test layers, fixtures, quality gates, CI, deployment, manual acceptance |
| [Implementation roadmap](implementation-roadmap.md) | Ordered build milestones, checkpoints, and definition of done |

## 5. Terminology

| Term | Meaning |
| --- | --- |
| Reading | Any saved content opened in the reader; either imported or generated. |
| Imported reading | Learner-supplied pasted text. |
| Generated story | Vocabulary-validated Japanese produced by the story pipeline. |
| Source mapping | One explicit deck + note type + expression field selection. |
| Vocabulary snapshot | The one current, deduplicated set of eligible visible field values created by the latest successful refresh. |
| Current snapshot | The single successfully completed vocabulary row. A refresh replaces it atomically; failed/cancelled refreshes leave it unchanged. |
| Structural baseline | Versioned grammar/function material that is always allowed to form Japanese sentences. It is not starter content vocabulary. |
| Grammar profile | The learner's device-wide difficulty preset, register preference, and optional user-edited guidance. |
| Exception policy | One device-wide natural-language policy evaluated by AI for otherwise unknown generated vocabulary. |
| Known | Locally validated against frozen story evidence or the current snapshot, as appropriate. |
| Exception | Not known through Anki, but accepted by the AI exception review under the captured policy. |
| Unknown | Not accepted by any authoritative validation category. |
| Auxiliary aid | Translation, advisory grammar analysis, or audio. Failure does not invalidate vocabulary-valid Japanese. |
| Provider configuration fingerprint | Stable hash of the model, voice/options, task prompt version, and relevant profile version used to key cached output. |

## 6. Decision precedence

When implementation questions arise, resolve them in this order:

1. Explicit behavior and acceptance criteria in this suite.
2. Privacy, read-only Anki, accessibility, data-integrity, and no-unrequested-spend invariants.
3. Domain interfaces and dependency rules.
4. UX details.
5. Implementation convenience.

Do not silently broaden v1. If a dependency cannot satisfy its acceptance gate, replace it behind the defined port. Do not change user-visible behavior to accommodate a library.

## 7. One-shot implementation instructions

1. Follow [Implementation roadmap](implementation-roadmap.md) in order; each checkpoint is a merge-quality gate.
2. Create architectural boundaries before feature screens. UI components may depend on application use cases, never directly on Dexie, workers, OpenRouter, or Anki.
3. Build fixtures and contract tests alongside every external adapter.
4. Treat all imported, cached, local-API, and AI data as untrusted until runtime validation succeeds.
5. Use explicit result/error types. Do not communicate provider failures as validation failures or vice versa.
6. Never persist a cancelled generation, an incomplete vocabulary snapshot, or an unknown-containing generated story as an accepted reading.
7. Run the full quality suite and manual device checklist before considering v1 complete.

## 8. Product-wide invariants

- Basic reading is never gated by AI or Anki setup.
- Missing AI aids never trigger requests automatically.
- Anki operations are read-only by construction and by allowlist.
- Ordinary vocabulary validation is local and authoritative.
- Color is never the sole carrier of meaning.
- Existing accepted content stays usable through network, provider, model, and Anki outages.
- Stored history is reproducible: generated content captures its current-snapshot identity, frozen validation evidence, grammar profile, exception policy, model, and prompt-version provenance.
- The application never displays, logs, exports, or includes the saved OpenRouter key in error reports.
- No user content is sent anywhere except in direct response to an AI action described in the AI pipeline specification.
