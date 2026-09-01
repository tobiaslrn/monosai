# 4. Solution Strategy

Five decisions shape everything else in the system. Each one exists to protect a quality goal from
[section 1.2](01-introduction-and-goals.md#12-quality-goals). This chapter states the decision and
its effect. It does not repeat the reasoning: that lives in the linked record.

| # | Decision | Serves | Effect on the system | Record |
| --- | --- | --- | --- | --- |
| 1 | **Layers with ports and adapters, enforced by the linter** | Maintainability | `domain` knows nothing. `application` depends on domain ports only. `infrastructure` and `features` depend inward. A forbidden import fails `npm run lint`, not review | [ADR 0003](../decisions/0003-architectural-boundary-enforcement.md) |
| 2 | **Local-first persistence in Dexie, with immutable schema versions** | Local-first and offline | Every write is a transaction. A published schema version is never edited; a change adds a new version with an upgrade function. A failed migration offers recovery and never resets the database | [ADR 0004](../decisions/0004-persistence-shape.md) |
| 3 | **Heavy work runs in Web Workers** | Performance, and offline | Tokenization and package parsing never touch the main thread. The tokenizer and the dictionary live in the language worker. ZIP and SQLite reading live in the package worker | [ADR 0005](../decisions/0005-tokenizer-selection.md), [ADR 0016](../decisions/0016-anki-package-parsing.md) |
| 4 | **`Result` with typed errors instead of exceptions across boundaries** | Honesty, and maintainability | A failure is a value with a `domain` and a `code`. A provider failure can never be shown as a validation failure. Screens handle states exhaustively | [Chapter 8](08-crosscutting-concepts.md) |
| 5 | **The reader is the centre of the user interface** | Honesty, and usability | Reading needs no setup. Aids are requested, never automatic. Audio, word details, and translation all belong to the reader and end with it | [ADR 0025](../decisions/0025-reader-as-the-centre.md) |

## How the quality goals are reached

| Quality goal | Solution approach | Detail |
| --- | --- | --- |
| **Local-first and offline-capable** | The application shell and the language assets are cached by the service worker. All learner data is in IndexedDB. Reading, the dictionary, and word marking run entirely on the device | [ADR 0027](../decisions/0027-pwa-caching-and-update-activation.md), [chapter 7](07-deployment-view.md) |
| **Honest about what the learner knows** | Vocabulary validation is local and authoritative. A generated story stores the snapshot identity, the frozen evidence, the grammar profile, the policy, the model, and the prompt version. A word that repair could not replace is marked, not hidden | [ADR 0033](../decisions/0033-unresolved-unknown-words-are-marked-not-rejected.md), [chapter 8](08-crosscutting-concepts.md) |
| **No unrequested spend and no telemetry** | One outbound client owns the credential and the request path. No aid starts by itself. Cached results are keyed by a configuration fingerprint, so a repeated request is answered from storage | [ADR 0018](../decisions/0018-openrouter-request-boundary.md), [ADR 0030](../decisions/0030-unified-model-selection.md) |
| **Maintainability** | Layer zones in the linter, `Result` at boundaries, Zod at boundaries, and injection tokens for every port. An adapter can be replaced without touching a screen | [chapter 5](05-building-block-view.md) |
| **Performance efficiency** | The reader mounts a bounded paragraph window. Import analysis runs in batches with progress. Prompt assets and every route load lazily | [ADR 0011](../decisions/0011-paragraph-window-bounds.md), [chapter 6](06-runtime-view.md) |

## Decomposition at a glance

The system is cut by layer first and by domain area second. A domain area such as `reading` or
`vocabulary` appears as a folder inside several layers, and the layer rule decides which of those
folders may import which. [Chapter 5](05-building-block-view.md) shows the result.
