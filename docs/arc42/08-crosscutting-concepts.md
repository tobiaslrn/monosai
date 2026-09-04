# 8. Cross-cutting Concepts

These concepts appear in many building blocks. They are stated once here so that they are not
explained again in each place they touch.

## 8.1 Domain model

The reading model is one hierarchy. A **reading** holds **paragraphs**, a paragraph holds
**sentences**, and a sentence holds **tokens**. A reading is immutable after it is saved. It is
either **imported** or **generated**.

A **vocabulary snapshot** is the one current, deduplicated set of expressions the learner has
reviewed. A refresh replaces it atomically; a failed or cancelled refresh leaves the previous one
untouched.

Every token in the reader carries one of three statuses:

| Status | Meaning |
| --- | --- |
| **Known** | Matched locally, either against the current snapshot or against a generated story's frozen evidence |
| **Exception** | Not known through Anki, but accepted by the AI exception review under the policy the learner wrote |
| **Unknown** | Accepted by no authoritative check. It is marked, not hidden |

An imported reading is classified against the current snapshot each time it is opened, so it follows
the learner's progress. A generated story keeps the evidence it was judged against, so its history
stays reproducible. The types live in `domain/reading/` and `domain/vocabulary/`.

## 8.2 Error handling

Nothing throws across a boundary. Every operation that can fail returns a `Result`: either a value
or a typed error, declared in `domain/shared/`.

Every error is a typed object with a `domain`, a `code`, and a developer-facing `message`. Those two
fields render a stable
`domain/code` string that an error screen can show and a learner can copy. Error domains are separate
on purpose: an `AiError`, a `LanguageError`, a `StorageError`, and an `AnkiError` are distinct types,
so a provider failure can never be shown as a validation failure.

An error message must never contain a credential, the learner's text, or a provider response body.
`describeThrown` and `safeErrorTypeOf` exist so that an unknown thrown value can be described without
its payload being copied into a message.

State unions are handled exhaustively, with a helper that makes an unhandled case a type error.
Adding a state breaks the compile rather than falling through a screen.

## 8.3 Validation at boundaries

All external data is untrusted until a Zod schema accepts it. This applies to:

| Source | Schema |
| --- | --- |
| AI provider responses | A schema per task, beside the adapter that makes the request |
| AnkiConnect responses | A schema beside the connection adapters |
| Worker messages, in both directions | A versioned protocol schema per worker, applied on both sides |
| Rows read back from storage | A schema per table, applied on read as well as on write |
| Downloaded language assets | A manifest schema, plus an integrity check before use |

Stored rows are validated on read because storage is external too. A browser can be inspected, and a
schema version can be edited by hand.

Grammar review is a bounded provider interaction: a request covers only the
runner's small batch, the response has an explicit size allowance, and one
format-recovery request is the most the adapter adds. An empty findings array
passes validation and completes coverage for every sentence in that batch; a
truncated or otherwise malformed reply remains a typed provider failure.

## 8.4 Ports and dependency injection

Every port is an injection token declared in `application/shared/` and bound by a provider function
in `infrastructure/`. Application and feature code injects the token, never the adapter.

`CLOCK`, `HASHER`, `ID_GENERATOR`, and `RANDOM_SOURCE` are ports as well. Time, identity, and
randomness therefore come from the injector, which is what makes a generation run or a cache key
reproducible in a test.

## 8.5 Persistence

Persistence is Dexie over IndexedDB. The schema history is a list of versions in
`infrastructure/persistence/`, which is the authority for which version is current.

Three rules hold:

1. **A published version is immutable.** A change adds a new, higher version.
2. **A shape or meaning change gets an upgrade function**, declared beside the stores it changes so
   the transition stays reviewable.
3. **A migration failure never resets the database.** It routes to the recovery screen with the data
   still there.

Indexes exist only for queries the application actually makes. Large text, token arrays, blobs,
credentials, and policy text are never indexed. Every multi-table write is one transaction, so a
reading is never visible without its sentences and tokens. See
[ADR 0004](../decisions/0004-persistence-shape.md).

Other tabs learn about a deleted or changed reading through a `BroadcastChannel`, not by polling
([ADR 0042](../decisions/0042-cross-tab-reading-mutations.md)).

## 8.6 Caching of AI results

Every AI result is stored under a **configuration fingerprint**: a stable hash of everything that
could change the answer. If the fingerprint matches, the stored result is used and no request is
made. If it does not match, the stored result is not shown as current.

| Result | Keyed by |
| --- | --- |
| Translation | Sentence content hash, the neighbouring sentences, model, prompt version |
| Grammar review | Sentence content hash, grammar profile hash, model, prompt version |
| Audio clip | Sentence content hash, model, voice, options fingerprint, and whether speech instructions are supported. No prompt version |

The key functions are pure and live in `domain/enrichment/`; hashing is over a canonical
serialization, so the same inputs always produce the same key
([ADR 0002](../decisions/0002-hashing-and-canonical-serialization.md)).
This is how a repeated request costs nothing, and how a voice change hides clips that no longer match
instead of playing them ([ADR 0043](../decisions/0043-voice-changes-hide-clips-and-say-so.md)).
Persisted whole-reading jobs use a configuration-level fingerprint without sentence content. A
grammar job's version contains the model, prompt version, and immutable profile hash, so it can
resume only work whose remaining items still mean the same thing.

The preparation lane writes each accepted grammar record before advancing its
job row. Story options therefore reports the real queue/request/save outcome:
completed analyses survive a provider failure, cancellation, reload, or a
retry, while a storage failure leaves the job recoverable without counting an
unwritten record.

## 8.7 Offline and update behaviour

The service worker prefetches the shell and the icons, and caches the language assets lazily. Saved
readings, the dictionary, and word marking work with no network. A new AI request and a live Anki
connection report that they need one, through the offline check inside the OpenRouter client.

An update never activates by itself. Registration waits for the application to become stable, and the
learner activates the new version from a banner. See
[ADR 0027](../decisions/0027-pwa-caching-and-update-activation.md).

## 8.8 Security and privacy

| Rule | Where it is enforced |
| --- | --- |
| The API key is never displayed, logged, exported, or put in an error report | One client is the only reader of the credential |
| Requests go only to the expected host | The client checks the host before every request |
| Responses cannot exhaust memory | Declared size caps on JSON and audio responses, and resource limits in the package worker |
| Anki access cannot write | An action allowlist with no write action on it |
| Anki field markup is never trusted as HTML | Visible text is extracted behind a port, so the one place that parses untrusted markup stays replaceable and out of the domain |
| No content is sent anywhere except in response to a learner action | Every provider call traces to a named act, which may have been taken earlier: a layer switched on, a generated story saved with the layers chosen for it, a reader opened, or an explicit *Prepare*, *Retry*, or *Prepare again*. Nothing else creates work — not a launch, not a configuration change |
| Nothing is collected about the learner | There is no analytics code and no reporting endpoint |

## 8.9 User interface

[`docs/design-system.md`](../design-system.md) is the authority for structure, controls, colour,
units, motion, voice, and state. It holds rules and intent. The values live in
`src/styles/_tokens.scss` and `src/styles/_controls.scss`. A change that departs from the design
system changes that document first, in the same commit.

Two rules from it reach into the code directly: colour is never the only carrier of meaning, and
dates and numbers format in one fixed locale, which
`domain/shared/` declares.

## 8.10 Testing seams

The architecture is shaped so that tests do not need the outside world.

| Seam | What it makes testable |
| --- | --- |
| Port tokens | Any adapter can be replaced with a fake in a TestBed |
| `CLOCK`, `ID_GENERATOR`, `RANDOM_SOURCE` | A run produces the same ids, timestamps, and hashes every time |
| `fetchFn`, `isOnline`, and `sleep` injected into the OpenRouter client | Offline states are deterministic and backoff is instant |
| Contract tests beside each adapter | A fake and a real adapter are held to the same contract |
| Fake IndexedDB with real Dexie | Repository tests run real transactions and real migrations |

[Chapter 10](10-quality-requirements.md) lists the suites and the thresholds.
