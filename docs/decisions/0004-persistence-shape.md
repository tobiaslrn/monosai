# 0004 — Persistence shape decisions

Date: 2026-08-17
Status: Accepted

Decisions taken while implementing the Dexie schema and repositories that the
specification left to the implementation.

## Row envelopes and validation

Every stored row carries a `v` schema-version field and is parsed against a Zod
schema when read. Small records (settings, readings, jobs, cache entries) are
validated on every read. Token analyses can hold tens of thousands of tokens for
a 50,000-character import, so they are validated in development only, where
fixtures and migrations run; production reads trust rows written by the same
schema version and fail loudly on any structural mismatch that reaches domain
code.

## Audio is stored as bytes, not `Blob`

`AudioAsset` still exposes a `Blob` to the domain, but the row stores an
`ArrayBuffer` plus its MIME type and the repository rebuilds the `Blob` on read.
Bytes round-trip identically across IndexedDB implementations, keep the test
environment faithful, and avoid browser-specific `Blob`-in-IndexedDB quirks.

## Selection by row presence

`grammarSelections` holds a row only while its catalog rule is selected.
IndexedDB cannot index booleans, and presence semantics keep a fresh install
empty by construction, leave no residue after deselection, and avoid a
`0`/`1` flag that would have to be translated in every query.

`sourceMappings.enabled` and `customGrammarRules.enabled` stay as booleans on
the row and are filtered in memory, because both tables are small by design.

## Denormalized library summaries

`readings` rows carry `lastOpenedAt`, translation, grammar, and audio summaries.
Library queries therefore read one table, never join sentence children, and
never touch audio bytes. Enrichment writes update the owning reading's summary
inside the same transaction, so a summary cannot outlive the data it describes.

Continue reading is derived from `readings.lastOpenedAt` rather than stored as a
pointer, so deleting a reading repairs it automatically.

## Credential isolation

The API key lives in its own `credentials` table with a dedicated repository
whose only read path is `useApiKey(callback)`. No method returns the key, so it
cannot reach a component value, template, log, or serialized diagnostic. The
`credentials` table is excluded from every other repository.

## Transaction boundaries

Saving an imported reading, committing a vocabulary snapshot, deleting a
reading, and advancing a batch job are each one transaction. Structural rules
(duplicate identifiers or positions, children referencing a parent outside the
save, counts disagreeing with content) are checked before the transaction opens
or abort it from inside, so a partial graph can never be committed.
