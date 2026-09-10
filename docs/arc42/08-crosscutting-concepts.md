# 8. Cross-cutting Concepts

These concepts appear in many building blocks. They are stated once here so that they are not
explained again in each place they touch.

## 8.1 Domain model

The reading model is one hierarchy. A **reading** holds **paragraphs**, a paragraph holds
**sentences**, and a sentence holds **tokens**. A reading is immutable after it is saved. It is
either **imported** or **generated**.

A **vocabulary snapshot** is the one current, deduplicated set of expressions the learner has
reviewed and not suspended. Its stored items are identified by canonical expression plus the
optional visible meaning from the learner's Anki note: identical pairs merge, while two meanings
for one expression remain separate items. A refresh replaces it atomically; a failed or cancelled
refresh leaves the previous one untouched. The matcher, practice selection, and generation still
project one expression at a time; that projection carries all distinct meanings. The snapshot's
`uniqueEntryCount` continues to count distinct expression hashes, so it can be lower than the
number of stored/browser items.

Its id is stable across refreshes so a generated story keeps one link to the current vocabulary,
which means the id cannot say whether the words behind it changed. Each committed replacement
therefore also writes a **revision**: an opaque token that changes on every commit, including one
where the word list is identical and only what those words prove about recent study is new. Anything
that captured a vocabulary compares the revision to learn its capture is stale, and a commit can name
the revision it was prepared against so a slow build cannot overwrite a newer one.

Every token in the reader carries one of three statuses:

| Status | Meaning |
| --- | --- |
| **Known** | Matched locally, either against the current snapshot or against a generated story's frozen evidence |
| **Exception** | Not known through Anki, but accepted by the AI exception review under the policy the learner wrote. The writer sees the same policy and may use what it clearly allows, but only the review accepts |
| **Unknown** | Accepted by no authoritative check. It is marked, not hidden |

An imported reading is classified against the current snapshot each time it is opened, so it follows
the learner's progress. A generated story keeps the evidence it was judged against, so its history
stays reproducible. On open it is classified against the current snapshot too, and any token the
snapshot does not cover falls back to that frozen evidence: a policy exception, or a word known when
the story was written, stays unmarked, while a word the learner has since reviewed stops being
marked. The types live in `domain/reading/` and `domain/vocabulary/`.

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

Grammar review is a bounded provider interaction: a request covers at most 30
sentences and 12,000 estimated input tokens, returns at most one useful finding
per sentence, and has a response allowance sized from the batch. One
format-recovery request is the most the adapter adds, and a model already known
to refuse a native schema does not pay for it again. An empty findings array
passes validation and completes coverage for every sentence in that batch. A
reply the provider stopped at the token limit is `context-budget-exceeded` with
the issue code `reply-truncated` — a statement about the output, not the input,
and never eligible for the format recovery
([ADR 0018](../decisions/0018-openrouter-request-boundary.md)); anything else
malformed remains a typed provider failure.

How many such requests are in flight is not this layer's decision. All three
preparation layers draw permits from one `PreparationPacer`, capped at ten
together and granted to the lowest waiting sentence position, so a reading fills
front to back across English, grammar and audio at once
([ADR 0059](../decisions/0059-preparation-fills-the-reading-in-order.md)). There
is no client-side rate limit: the only reaction to provider load is a back-off
driven by a real 429's own `Retry-After`.

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

Vocabulary meaning fields were added in schema version 14. This version changes no index and has
no upgrade function: every new field is optional, and an absent value on an existing row already
has the correct meaning of "not mapped". Versions 1 through 13 remain immutable
([ADR 0062](../decisions/0062-vocabulary-identity-is-expression-plus-meaning.md)).

Schema version 15 adds optional first-review precision to vocabulary items and source caches.
Existing timestamps remain exact when the marker is absent; Android study-day observations write
`anki-day`. No index or row rewrite is needed because absence already has the legacy meaning.

Translation plans are validated persisted state with three explicit forms: opening pending,
glossary repair required, and ready with a frozen glossary. Establishing a ready plan and its
accepted opening translations is one transaction. Provisional opening rows remain recoverable but
do not carry a ready plan's cache identity. Schema history adds the plan store monotonically and
does not rewrite or discard existing translation or job rows.

Other tabs learn about a deleted or changed reading through a `BroadcastChannel`, not by polling
([ADR 0042](../decisions/0042-cross-tab-reading-mutations.md)).

## 8.6 Caching of AI results

AI readiness distinguishes missing credentials from incomplete model configuration.
Text and speech settings keep up to twenty failed test attempts, with a configuration
fingerprint, timestamp, typed failure code, and redacted reason. Matching failures
survive reloads and take precedence over old successful tests; a successful retry
removes that configuration's failure. Schema version 10 initializes this history
transactionally. Invalid settings abort the upgrade and reach the existing storage
recovery screen with the original data retained.

Every AI result is stored under a **configuration fingerprint**: a stable hash of everything that
could change the answer. If the fingerprint matches, the stored result is used and no request is
made. If it does not match, the stored result is not shown as current.

| Result | Keyed by |
| --- | --- |
| Translation | Sentence content hash, ready-plan fingerprint, stable Japanese passage-window fingerprint, model and prompt version. The plan covers title, premise, register, ordered source identity, candidate-selection policy and the canonically ordered frozen glossary |
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

Translation separates the input fingerprint from the ready plan fingerprint: creation time and job
progress affect neither. A retry may narrow its target ids without changing passage-window identity,
so successful sibling rows remain cache hits. Old rows stay available as history but never satisfy
a different active plan.

The preparation lane writes each accepted grammar record before advancing its
job row. Story options therefore reports the real queue/request/save outcome:
completed analyses survive a provider failure, cancellation, reload, or a
retry, while a storage failure leaves the job recoverable without counting an
unwritten record. Per-reading maintenance clears translation, grammar, or audio
atomically with that layer's resumable job and denormalized summary, leaving the
Japanese text and every other aid untouched.

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
`web/src/styles/_tokens.scss` and `web/src/styles/_controls.scss`. A change that departs from the design
system changes that document first, in the same commit.

Two rules from it reach into the code directly: colour is never the only carrier of meaning, and
dates and numbers format in one fixed locale, which
`domain/shared/` declares.

The vocabulary browser follows the same boundary: `listVocabularyEntries` returns the active
snapshot, item projections, provenance source ids, and included source observations from one Dexie
read transaction. Its store keeps only the current query and expanded item; the pure domain query
function owns matching, filtering, and total sorting. A filter dialog is an app-level CDK Dialog,
so focus, Escape, and focus return are shared overlay behaviour rather than reader-specific code.

## 8.10 Testing seams

Selects with catalogue-driven options use Angular's `ngModel` select value accessor.
It reapplies the saved value when options arrive or change; direct DOM `[value]`
binding cannot synchronize asynchronous options. Static selects need no change.

The architecture is shaped so that tests do not need the outside world.

| Seam | What it makes testable |
| --- | --- |
| Port tokens | Any adapter can be replaced with a fake in a TestBed |
| `CLOCK`, `ID_GENERATOR`, `RANDOM_SOURCE` | A run produces the same ids, timestamps, and hashes every time |
| `fetchFn`, `isOnline`, and `sleep` injected into the OpenRouter client | Offline states are deterministic and backoff is instant |
| Contract tests beside each adapter | A fake and a real adapter are held to the same contract |
| Fake IndexedDB with real Dexie | Repository tests run real transactions and real migrations |

[Chapter 10](10-quality-requirements.md) lists the suites and the thresholds.

### Keyboard access to reading text

Each sentence has one tab stop. Left/Right arrows move focus through its inspectable
words (wrapping at the ends); Home/End choose its first/last word. Enter and Space use
native button activation, and closing details returns focus to that word. A focused or
clicked word becomes its sentence's next tab entry. **Skip past story** reaches the
Library action after the text. Paragraphs retain native `p` semantics.
This focus model does not intercept touch pointers. Touch gestures on the reading
surface are decided separately, in the paragraph gesture directive: a short tap belongs
to whatever it landed on, and a press held for 450ms opens sentence details from the
pressed word, punctuation, furigana, or line leading. That press is why the reading
surface — and only the reading surface, and only under a finger — gives up native text
selection and the platform's long-press callout ([ADR 0058](../decisions/0058-one-gesture-per-meaning-on-touch.md)).
A gesture that fired consumes its own release and click by pointer id, so the popover's
outside-press rule cannot dismiss the surface that press just opened. Focus is set and
returned with `preventScroll`, and replacing one surface with another skips the
intermediate focus return.
Story titles carry Japanese language metadata in the Library and reader header.

### One presentation for a link that addresses nothing

Three routes can conclude that what a link named is not here: a `/reader/` segment
that is not an id, a well-formed id with no reading behind it, and a generation run
that ended with the tab that owned it. All three render `mn-not-found-panel` — the
same alert panel, the same explanation shape, and the application's ordinary primary
and secondary buttons — so a dead link never looks like a different product.

Application chrome follows the same rule. The shell drops its masthead only for the
reader itself, which is decided by classifying the URL's id rather than by matching
the `/reader/` prefix: a segment that is not an id never reaches the reader, and that
screen previously lost every way out of the application to the prefix match.

The reader's own not-found state keeps the reader's bar rather than the masthead: it
is reached only after a reading has begun loading, and swapping the chrome in when a
load fails would make the masthead appear and disappear as a reading opens. Its bar
carries the same back control and names what was not found, so the two differ in
identity row alone.
