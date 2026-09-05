# Monosai Anki read protocol

Version 6 of the AnkiConnect request shape: `POST /` with JSON
`{"action":"version","version":6,"params":{}}`. Content-Type is optional.
UTF-8 responses are compact JSON with a final LF and always contain `result`
and `error`. On error, result is null; on success, error is null. Empty arrays
are successful results. Fixtures are literal wire bytes, not formatter input.

| Action            | Parameters                | Result                                                       |
| ----------------- | ------------------------- | ------------------------------------------------------------ |
| version           | none                      | `6`                                                          |
| requestPermission | none                      | `{permission:"granted",requireApiKey:false,version:6}`       |
| deckNames         | none                      | array of deck names                                          |
| modelNames        | none                      | array of note type names                                     |
| modelFieldNames   | modelName: string         | field names in stored order                                  |
| findCards         | query: Anki search string | card IDs, using the id-only projection                       |
| cardsInfo         | cards: integer ID array   | cardId, note, reps, lapses, factor, deckName                 |
| notesInfo         | notes: integer ID array   | noteId, modelName, fields keyed by name with value and order |

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
