# 8. Cross-cutting Concepts

These concepts appear in many building blocks. They are stated once here so that they are not
explained again in each place they touch.

## 8.1 Domain model

The reading model is one hierarchy. A **reading** holds **paragraphs**, a paragraph holds
**sentences**, and a sentence holds **tokens**. A reading is immutable after it is saved. It is
either **imported** or **generated**.

Import takes paragraphs from the learner's blank lines. The blank lines close the paragraph before
them, and an indent after them, full-width or not, opens the next one, so a paragraph's first
sentence is never stored under the paragraph before it. A line break always ends a sentence and
closes any bracket still open, so a stray 「 cannot pull the lines after it into one sentence. These
rules shape a reading only when it is imported: a saved reading keeps the structure it was saved
with.

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
that captured a vocabulary compares the revision to learn its capture is stale. Every commit names
the revision it was prepared against, or states that it found no vocabulary at all, so a slow build
cannot overwrite a newer one and two first builds from different tabs cannot both count as first.
Removing a source leaves the revision alone, so a commit also refuses a refreshed cache for a source
that is no longer stored; the refresh is then prepared again against the sources that remain.
The worker's compiled matcher is identified by id and revision too, and each classification reads
the stored revision first, so a tab notices a vocabulary another tab committed. Matcher input is
read with its revision in one transaction.

Every token in the reader carries one of three statuses:

| Status        | Meaning                                                                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Known**     | Matched locally, either against the current snapshot or against a generated story's frozen evidence                                                                                                 |
| **Exception** | Not known through Anki, but accepted by the AI exception review under the policy the learner wrote. The writer sees the same policy and may use what it clearly allows, but only the review accepts |
| **Unknown**   | Accepted by no authoritative check. It is marked, not hidden                                                                                                                                        |

An imported reading is classified against the current snapshot each time it is opened, so it follows
the learner's progress. A generated story keeps the evidence it was judged against, so its history
stays reproducible. On open it is classified against the current snapshot too, and any token the
snapshot does not cover falls back to that frozen evidence: a policy exception, or a word known when
the story was written, stays unmarked, while a word the learner has since reviewed stops being
marked. The types live in `domain/reading/` and `domain/vocabulary/`.

A token matches a reviewed word when its written form or its base form equals the word's. Failing
that, it matches by reading: for an inflected word first the reading of its dictionary form (たべた
for 食べる, 来た for くる, recorded as a base-form match), then its own reading, equals the word's
reading. A reading counts only when the two spellings do not contradict each other, and they
contradict only when both are written with kanji and, with all kana removed, neither one's kanji
appear in order within the other's: 紙 is not 神 and 早い is not 速い, while 猫 and ねこ, 行なう and
行う, 子ども and 子供, and ご飯 and 御飯 are one word. A function word (particle, auxiliary, prefix,
suffix or symbol) is never matched by its reading alone, so は is not 歯, て is not 手 and 下さい is
not ください, and the structural baseline wins over a match by a token's own reading. Within a
phrase, any word also matches by its reading where the phrase spells that word in kana at the same
place, since the rest of the phrase vouches for it (宜しくお願い致します for よろしくお願いいたします,
私達 for 私たち). The reader, the word details and the check of a generated story all use this one
matcher.

One gap is known and accepted. An inflected verb or adjective written in kana also matches by its
own reading, so where the learner reviews a word that only reads like its stem but has no card for
the verb, the stem counts as that word: い of いた as 胃, き of きた as 木, み of みた as 実. A card for
the verb wins, since the dictionary form's reading is tried first. The tokens do not tell such a
stem from a word in kana they tag the same way (みせ of みせはどこ for 店, はやく for 早く, き of
きにいった for 気), so refusing the stem would lose those everyday matches.

Evidence frozen by an earlier validator version is held to the rule when a story is read back. It
names its words by ids that each vocabulary refresh replaces, so the spelling it was matched against
is unknown, and a match that could be one the rule refuses no longer counts: a function word matched
by anything but an exact form, or a word written in kanji matched through a kana reading. Where the
rule accepts such a match and the learner still reviews the word, the current snapshot covers the
token instead (猫 for ねこ, 子ども for 子供). A match the rule refuses (紙 for 神, は for 歯), and such a
match of a word the learner no longer reviews, are lost from the display; the stored record is
unchanged. Every other match keeps counting, a kana verb stem matched by its reading among them.

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

A worker that stops answering (it failed to load, crashed, ran out of memory, or sent a message that
could not be read) fails everything pending with a typed error instead of leaving it waiting. The
package worker is then gone for good, since each package gets its own. The language worker is
replaced on the next request; the runtime reports that it lost its state, so the language store
prepares the fresh worker again and the classifier compiles its matcher again. The speech encoder
worker is replaced on the next clip; it keeps no state, so nothing has to be prepared again.

Code loaded on demand is tried once more at once when its import fails, and a later request tries
again after that. Some browsers refuse a module that failed once for the rest of the page's life,
so speech code that still cannot load is reported to the app as a whole rather than as a fault of
one sentence: the failure offers no retry, and the update banner offers a reload, in the reader
too. A clip the provider was already paid for is kept as WAV when its encoder cannot load
(ADR 0070).

State unions are handled exhaustively, with a helper that makes an unhandled case a type error.
Adding a state breaks the compile rather than falling through a screen.

## 8.3 Validation at boundaries

All external data is untrusted until a Zod schema accepts it. This applies to:

| Source                              | Schema                                                        |
| ----------------------------------- | ------------------------------------------------------------- |
| AI provider responses               | A schema per task, beside the adapter that makes the request  |
| AnkiConnect responses               | A schema beside the connection adapters                       |
| Worker messages, in both directions | A versioned protocol schema per worker, applied on both sides |
| Rows read back from storage         | A schema per table, applied on read as well as on write       |
| Downloaded language assets          | A manifest schema, plus an integrity check before use         |

Stored rows are validated on read because storage is external too. A browser can be inspected, and a
schema version can be edited by hand.

Cached language assets are checked the same way each time they are read. The manifest is cached only
after its schema accepts it, and every other file only after it matches the digest the manifest
records. A cached copy that fails its check is dropped and downloaded once more, so an error page
answered in place of a file never sticks.

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

Text-task input uses a small provider-facing Markdown wire format. Headings identify sections,
ordinary entries occupy one line, and backslashes, carriage returns, line feeds, and leading
Markdown controls are escaped deterministically after line escaping. Configuration and data blocks
cannot override the surrounding rules. Indexed wires use request-local ordinal ids; adapters restore
the real domain ids and apply task-specific checks for unknown, duplicate, and partial entries.
Responses remain task-specific JSON,
including separate opening, tail, and glossary-repair translation schemas
([ADR 0071](../decisions/0071-markdown-input-wire-and-cache-friendly-text-requests.md)).

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
3. **A migration failure never resets the database by itself.** It routes to the recovery screen with
   the data still there. Only the learner can delete it from there, after saving a copy if they want
   one and confirming a list of what is removed. Anything an upgrade function throws counts as a
   migration failure, unless the browser itself failed (quota, a blocked or aborted transaction).

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

Schema version 16 moves speech pace from the provider settings to reader playback
preferences. The upgrade snaps the old TTS speed to the supported local rates,
sets every TTS style to `clear`, removes the obsolete speed fields, and leaves
audio rows untouched: an absent `pace` marker means their timing is already
baked. The upgrade is transactional and uses the existing recovery path.

Schema version 17 adds the named `speechPace` to the TTS settings and every preset,
defaulting existing values to `natural`, and changes a migrated reader rate of
`0.7` to `0.8`. It is transactional, preserves the remaining settings and audio
rows, and sends malformed records to the same recovery path rather than resetting
local data.

Schema version 18 adds the local alpha-disclosure acknowledgment to app settings,
defaulting existing installations to unacknowledged. The write is transactional;
a failed migration keeps the original database available through the existing
recovery path.

Schema version 19 indexes sentences by content hash, so deleting a reading or clearing its
grammar or audio can find another reading with the same sentence and hand it the shared row
instead of deleting it. The index is built inside the version-change transaction; no row is
rewritten ([ADR 0096](../decisions/0096-shared-aids-are-counted-by-key-and-outlive-one-reading.md)).

Translation plans are validated persisted state with three explicit forms: opening pending,
glossary repair required, and ready with a frozen glossary. Establishing a ready plan and its
accepted opening translations is one transaction. Provisional opening rows remain recoverable but
do not carry a ready plan's cache identity. Glossary repair reads only the rows stored under the
plan's own provisional keys, so English from another model or an earlier plan never informs the
repaired terms or moves under the ready plan's keys. Schema history adds the plan store monotonically and
does not rewrite or discard existing translation or job rows.

Other tabs learn about a deleted or changed reading through a `BroadcastChannel`, not by polling
([ADR 0042](../decisions/0042-cross-tab-reading-mutations.md)).
A job can still finish a request after its reading was deleted, so every write of a translation,
plan, grammar analysis or clip checks inside its own transaction that the reading exists, and
refuses with `not-found` otherwise. Nothing is left behind that no deletion would remove.

## 8.6 Caching of AI results

AI readiness distinguishes missing credentials from incomplete model configuration.
Text and speech settings keep up to twenty failed test attempts, with a configuration
fingerprint, timestamp, typed failure code, and redacted reason. Matching failures
survive reloads and take precedence over old successful tests, for a saved preset as
for the active configuration, so neither is offered or used; a successful retry
removes that configuration's failure. A test's fingerprint is taken when its request
is sent: if the model, effort, voice or key changes before the answer arrives, a pass
marks nothing as tested. A write that changes a list in these settings, such as the
presets, the favourites or the failed tests, works the list out from the row as
stored, in the transaction that writes it, so it cannot undo a change saved
meanwhile, such as a running story recording a structured-output downgrade.
Schema version 10 initializes this history transactionally. Invalid settings abort
the upgrade and reach the existing storage recovery screen with the original data
retained.

Every AI result is stored under a **configuration fingerprint**: a stable hash of everything that
could change the answer. If the fingerprint matches, the stored result is used and no request is
made. If it does not match, the stored result is not shown as current.

| Result         | Keyed by                                                                                                                                                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Translation    | Sentence content hash, ready-plan fingerprint, stable Japanese passage-window fingerprint, model and prompt version. The plan covers title, premise, register, ordered source identity, candidate-selection policy and the canonically ordered frozen glossary |
| Grammar review | Sentence content hash, grammar profile hash, model, prompt version                                                                                                                                                                                             |
| Audio clip     | Sentence content hash, model, voice, speaking style, options fingerprint, and whether speech instructions are supported. New rows mark `pace: 'playback'`; absent pace is baked. The prompt version is included only for instructed models                     |

The key functions are pure and live in `domain/enrichment/`; hashing is over a canonical
serialization, so the same inputs always produce the same key
([ADR 0002](../decisions/0002-hashing-and-canonical-serialization.md), padding corrected by
[ADR 0085](../decisions/0085-sha256-padding-is-fixed.md)).

Playback keeps current-settings coverage separate from playable coverage. If a current key is
missing, the playback store selects the newest same-content row and marks it stale; coverage and
generation still count only current keys. This lets a reading remain audible after a settings change
without silently serving speech for edited text ([ADR 0072](../decisions/0072-older-clips-play-until-regenerated.md)).
The player applies the saved local rate only to rows marked for playback pacing,
and splits continuous resources when a baked-time row is next ([ADR 0073](../decisions/0073-pace-at-playback-style-in-prompt.md)).

Grammar and audio keys never name the reading, so one row serves the same sentence in every
reading. Coverage, missing-sentence queries and playback ask by key, never by the reading a row was
last written for, and a deletion hands a row on to a reading that still has the sentence
([ADR 0096](../decisions/0096-shared-aids-are-counted-by-key-and-outlive-one-reading.md)).
This is how a repeated request costs nothing, and how a voice change hides clips that no longer match
instead of playing them ([ADR 0043](../decisions/0043-voice-changes-hide-clips-and-say-so.md)).
Persisted whole-reading jobs use a configuration-level fingerprint without sentence content. A
grammar job's version contains the model, prompt version, and immutable profile hash, so it can
resume only work whose remaining items still mean the same thing.

Translation separates the input fingerprint from the ready plan fingerprint: creation time and job
progress affect neither. A retry may narrow its target ids without changing passage-window identity,
so successful sibling rows remain cache hits. Old rows stay available as history but never satisfy
a different active plan.

Translation prompts place their stable plan and captured context before the changing passage window,
so related requests share a reusable prefix. Long story generation uses one random content-free
session id for the blueprint, segments, and format recovery; it is not part of cache identity. The
OpenRouter client accepts optional usage metadata and logs only prompt, completion, total, cached,
and cache-write token counts alongside task and model, never prompt or response content. See
[ADR 0071](../decisions/0071-markdown-input-wire-and-cache-friendly-text-requests.md).

The model catalogue also carries the selected top provider's reported completion maximum. Settings
uses it to bound story and routed-task budget fields; when it is absent, the field falls back to a
broad manual safety ceiling. The stored default remains smaller, so a wider available maximum does
not change request cost by itself ([ADR 0076](../decisions/0076-model-reported-story-output-budgets.md)).

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

An update never takes over a running page. Registration waits for the application to become stable,
the worker downloads a new version in the background, and the next page load uses it. See
[ADR 0094](../decisions/0094-updates-apply-on-the-next-launch.md).

## 8.8 Security and privacy

| Rule                                                                        | Where it is enforced                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The API key is never displayed, logged, exported, or put in an error report | One client is the only reader of the credential                                                                                                                                                                                                                                                        |
| Requests go only to the expected host                                       | The client checks the host before every request                                                                                                                                                                                                                                                        |
| Stored speech cannot cost what it arrives as                                | A model answering with raw PCM has its clip compressed to Opus in a worker before anything stores it, and clips written before that are re-encoded in place by a background pass (see [ADR 0070](../decisions/0070-gemini-speech-is-stored-compressed.md))                                             |
| Responses cannot exhaust memory                                             | Declared size caps on JSON and audio responses, and resource limits in the package worker                                                                                                                                                                                                              |
| Anki access cannot write                                                    | An action allowlist with no write action on it                                                                                                                                                                                                                                                         |
| Anki field markup is never trusted as HTML                                  | Visible text is extracted behind a port, so the one place that parses untrusted markup stays replaceable and out of the domain                                                                                                                                                                         |
| No content is sent anywhere except in response to a learner action          | Every provider call traces to a named act, which may have been taken earlier: a layer switched on, a generated story saved with the layers chosen for it, a reader opened, or an explicit _Prepare_, _Retry_, or _Prepare again_. Nothing else creates work — not a launch, not a configuration change |
| Nothing is collected about the learner                                      | There is no analytics code and no reporting endpoint                                                                                                                                                                                                                                                   |

## 8.9 User interface

[`docs/design/rules.md`](../design/rules.md) holds the binding rules for every visual change and wins
over everything else; [`docs/design/README.md`](../design/README.md) explains the intent behind them.
Each piece of design knowledge has one home. Values live in `web/src/styles/` (`_tokens.scss`,
`_motion.scss`, `_controls.scss`) and the style partials under `web/src/styles/components/`. Each
shared-ui primitive's behaviour and use are documented in its own doc comment, and the gallery build
renders every primitive, with screenshot baselines guarding them. Features and core compose the
primitives and write no styles. `npm run design:check` enforces every rule that can be checked and
names the fix; [`docs/design/checks.md`](../design/checks.md) lists those checks. A rule changes only
when the owner decides, in the same commit as its checks and the code.

Components compose the shared-ui primitives for controls instead of writing their markup: the
segmented control, radio cards, switch row, settings row, and the popup (a native popover that
the browser dismisses, so no menu registers a document listener of its own). A feature places a
primitive and never re-skins it
([ADR 0083](../decisions/0083-floating-panels-are-native-popovers.md)).

Interaction states follow one fixed order — rest, variant, hover, active, pressed, pressed and
hover, busy, read-only, disabled, pressed and disabled — decided by source order. In the shared controls every state qualifier, including the mouse-only
hover guard, is written inside `:where()` so a state rule weighs only its own class
([ADR 0082](../decisions/0082-interaction-states-have-equal-specificity-and-a-fixed-order.md)). A
component styles placement and never recolours a shared control's states. Busy is
`aria-busy='true'`: the control keeps its fill, stays in its place, and is never removed or swapped
while it works, so focus survives the work. A text field holding a value that work is running on is
`readonly`, not `disabled`: the value keeps its full contrast, stays focusable and selectable, and
only the field's surface shows the lock; `disabled` means not available yet. The audio player's job-in-progress check
(`isAudioRunInProgress`) counts a parked `paused` run as still going. The static style audit
also rejects any `:hover` selector, in a component or in `web/src/styles/`, that does not name the
`data-pointer='mouse'` guard, so hover stays a mouse-only state.

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

| Seam                                                                   | What it makes testable                                         |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| Port tokens                                                            | Any adapter can be replaced with a fake in a TestBed           |
| `CLOCK`, `ID_GENERATOR`, `RANDOM_SOURCE`                               | A run produces the same ids, timestamps, and hashes every time |
| `fetchFn`, `isOnline`, and `sleep` injected into the OpenRouter client | Offline states are deterministic and backoff is instant        |
| Contract tests beside each adapter                                     | A fake and a real adapter are held to the same contract        |
| Fake IndexedDB with real Dexie                                         | Repository tests run real transactions and real migrations     |

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
outside-press rule cannot dismiss the surface that press just opened. Back, like a short
tap on nothing, dismisses whatever details are open before it leaves the reader, because
each open surface holds a history entry ([ADR 0083](../decisions/0083-floating-panels-are-native-popovers.md)).
Focus is set and
returned with `preventScroll`, and replacing one surface with another skips the
intermediate focus return.
Story titles carry Japanese language metadata in the Library and reader header.

### One presentation for a link that addresses nothing

Three routes can conclude that what a link named is not here: a `/reader/` segment
that is not an id, a well-formed id with no reading behind it, and a generation run
that ended with the tab that owned it. All three render `mn-not-found-panel` — the
same alert panel, the same explanation shape, and the application's ordinary primary
and secondary buttons — so a dead link never looks like a different product.

Application chrome follows the same rule. The shell drops its banners and
first-use Help offer only for the reader itself, except the notice that the tab lost its database, which is decided by classifying the
URL's id rather than by matching the `/reader/` prefix: a segment that is not an
id never reaches the reader, and that screen previously lost every way out of the
application to the prefix match. Every other page wears the shared page frame and
one top bar, its page header
([ADR 0069](../decisions/0069-one-top-bar-per-screen.md)).
The one-time alpha disclosure is the explicit release-stage exception: it is
shown after any completed initial route, including a reader deep link, and does
not alter the reader's chrome.

The reader's own not-found state keeps the reader's bar rather than a page header: it
is reached only after a reading has begun loading, and swapping the chrome in when a
load fails would make one bar replace another as a reading opens. Its bar carries the
same back control and names what was not found, so the two read alike.

## 8.11 Signals and effects

Derive with `computed`, reset on change with `linkedSignal`, and keep `effect` for side effects
outside Angular's graph: the DOM, storage, observers, and logging.

State that restarts when an input changes — a form that opens from the selected record, a panel that
collapses when the selection moves — is a `linkedSignal` over that input, never an `effect` that
writes signals. A resource tied to a value, such as an object URL for a clip, lives in an effect that
makes it and releases it in `onCleanup`, which runs on replacement and on destroy; the effect writes no
signals. Work that has to be redone when state changes — a catalogue fetched once a key exists, the
standings re-read when the sources or the current vocabulary change, the stored aids re-read when the
model or profile they are keyed on arrives — is a `resource()` whose `params` read that state. Its
loader runs untracked, so what it reads of the same signals cannot make it its own trigger, and
`reload()` is the retry. When the store that commits the data can do the reload itself, as the Anki
connection store does for the history, nothing needs to watch it. An effect that has to call a store
method which reads state it then rewrites wraps the call in `untracked()`, or it becomes its own
trigger.

A store does not copy state into another store. A registry takes the signal itself, as
`AppBusyRegistry.track` and `GenerationActivityRegistry.connect` do, and derives from it; a value
only one caller knows is an argument, as the catalogue parameters are to `TtsStore.acceptsDirection`.
A one-off command has an explicit trigger: a route input that opens or hands something over, or a
count that starts rising from the number on screen, is `ngOnChanges`, a completed navigation is a
router subscription, and the end of a run is a callback from the run. Two effects outside the DOM
remain, each commented with why: the preparation lane's pump, because its hold clears through three
other stores, and the release of a wait for clips in `reader-audio.store.ts`, because it answers both
a job and a wait that starts after the job stopped.

## 8.12 Compiler strictness

Beyond `strict`, the TypeScript configuration enables `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes` for the application, its workers, the specs, and the end-to-end suites
([ADR 0084](../decisions/0084-unchecked-index-and-exact-optional-properties.md)).

An indexed read may be absent, and the code says what happens then. Prefer a shape that makes the
element present — `for…of`, `entries()`, destructuring, iterating the array rather than its indexes —
then a guard whose absent branch is real behaviour. Where the logic already proves the index, such as
parallel arrays whose lengths were checked, `defined(value, context)` from `domain/shared/invariant`
narrows it and throws if that proof is ever broken. `!` is a lint error in application code; specs
may assert, because a wrong assertion fails the test.

An optional property is present with a value or absent, never present as `undefined`. Objects are
built with conditional spreads. A property is typed `?: T | undefined` only where `undefined` is a
value in its own right: a patch in which it clears a field, or raw input to a normalizer. Boundary
schemas use Zod's `.exactOptional()`. A stored row that fails validation is validated once more
after `withoutUndefinedProperties`, so a row written with an explicit `undefined` still reads, as
absent, while a valid row costs one parse and no copy.
