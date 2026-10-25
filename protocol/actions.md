# Monosai Anki read protocol

Version 6 of the AnkiConnect request shape: `POST /` with JSON
`{"action":"version","version":6,"params":{}}`. Content-Type is optional.
UTF-8 responses are compact JSON with a final LF and always contain `result`
and `error`. On error, result is null; on success, error is null. Empty arrays
are successful results. Fixtures are literal wire bytes, not formatter input.

| Action            | Parameters                | Result                                                                   |
| ----------------- | ------------------------- | ------------------------------------------------------------------------ |
| version           | none                      | `6`                                                                      |
| requestPermission | none                      | `{permission:"granted",requireApiKey:false,version:6,monosaiBridge:{…}}` |
| deckNames         | none                      | array of deck names                                                      |
| modelNames        | none                      | array of note type names                                                 |
| modelFieldNames   | modelName: string         | field names in stored order                                              |
| findCards         | query: Anki search string | card IDs, using the id-only projection                                   |
| cardsInfo         | cards: integer ID array   | see the card fields below                                                |
| notesInfo         | notes: integer ID array   | noteId, modelName, fields keyed by name with value and order             |

A card always carries `cardId`, `note`, `reps`, `lapses`, `factor`, `queue` and
`deckName`. It carries `interval` (days), `cardType`, `fsrsDifficulty`,
`lastReviewedAt` (epoch milliseconds, converted once from the provider's
seconds) and `originalDeckName` only where they exist, and a key is absent
rather than zero when they do not: an older AnkiDroid does not publish the
column, a card Anki never scheduled with FSRS leaves it null, and a card in its
own deck has no separate home deck. Capability is established per provider
session against real rows, and one unpublished column never costs the others.

These are the column names AnkiDroid's public contract publishes, which are not
the names of the fields behind them — the interval is `interval` here and `ivl`
only inside a collection file. Asking for a backing name makes the provider
reject the whole projection, which the bridge would then read as an old build.
The shared `cardsInfo` fixture stays the small collection both sides replay; the
full card shape is pinned by the bridge's own router test.

`requestPermission` also carries `monosaiBridge`, which is `{version, contract}`:
the bridge's release name, and the loopback contract version in `contract.txt`.
The contract is the only number a caller negotiates against. It is not
AnkiConnect's `6`, which describes this request shape, and not the release
version, which moves for fixes that never reach the wire. It rises by one only
when a caller could not have discovered the change by trying it — a new action, a
field a caller will require, a limit a caller relies on, a changed error meaning —
and a rise ships in at least a minor release. Optional keys are not a contract
change: a caller reads each one where it exists and does without it where it does
not, which is how the scheduling columns above already work.

The bridge never breaks an older caller within a major version. It may add
actions, add optional keys and relax limits; it may not remove an action, change
what a key means, or narrow a limit. A newer bridge answering an older caller is
therefore uneventful, and a caller that finds a higher contract than it knows says
nothing about it. Only an endpoint that sends `monosaiBridge` is held to a
contract; any other AnkiConnect-compatible endpoint has none to send and is judged
by what it can answer.

`getReviewsOfCards` is on Monosai's read allowlist for the desktop add-on but is
deliberately not implemented here: AnkiDroid's content provider has no review
log. `findCards` passes an Anki search through unchanged, so `introduced:N`
recovers the first real review's Anki study-day bucket with parallel binary
search; its representative timestamp is stored with `anki-day` precision.
`rated:` searches answer which cards were actually answered in the last one,
three or seven study days, and `rated:7:1` and `rated:7:2` which of those were
answered Again or Hard.

Unknown actions (including writes) return
`{"result":null,"error":"unsupported action: <name>"}` without querying AnkiDroid.
`AllowedReads` dispatches through `AnkiReads`, which has no mutation method.
IDs are positive JavaScript-safe integers; batches are capped at 500, query/name
strings at 8,192 characters, and request bodies at 64 KiB. Missing IDs are omitted;
card/note records follow requested ID order. Field HTML remains string data.

`version` proves the listener is present. All other actions check the provider
grant and searchable cards URI. AnkiDroid 2.24+ is required. Failures use the
codes `ankidroid-not-installed`, `ankidroid-permission-denied`,
`review-evidence-unsupported`, `query-failed`, `origin-not-allowed`, or
`invalid request`. Stack traces are never wire errors.

The bridge binds only `127.0.0.1:8765`. Allowed origins default to
`https://tobiaslrn.github.io` and `http://localhost:4200`, with exact comparison
and no wildcards or paths. OPTIONS supplies CORS and
`Access-Control-Allow-Private-Network: true` without reading a body. For a valid
but unlisted origin, preflight and the denial response reflect that origin
**only to expose the error**; no collection read is dispatched. An absent or
opaque Origin cannot read either. This lets browser fetch distinguish a refused
address from a stopped listener. No cookies or keys; responses are not cached.

JVM tests compare every fixture byte-for-byte. Vitest validates response schemas,
exercises both live adapters, and checks the fixture-seeded fake's envelopes.
The existing desktop/Android provider contract remains the behavioral invariant.
