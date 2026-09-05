# 0016 — Anki package parsing

Date: 2026-08-19
Status: Accepted

## Context

Milestone 5 has to read reviewed vocabulary out of an `.apkg` or `.colpkg` the
learner chose, entirely in the browser, with no server and no write access to
their collection. An Anki package is a ZIP holding a SQLite database, and
nothing in the dependency graph could read either format.

Inspecting a current export (Kaishi 1.5k, 1,500 notes) showed what has to be
supported:

- `meta`, a two-byte protobuf holding the package version (`3`);
- `collection.anki21b`, a **zstd** frame wrapping a **schema 18** SQLite
  database — 1.0 MB compressed, 3.5 MB decompressed;
- `collection.anki2`, a schema 11 stub holding one note telling older clients to
  upgrade;
- `media`, plus numbered media members.

Packages exported with legacy support instead carry an uncompressed
`collection.anki21`, and older Anki versions carry only `collection.anki2` with
decks and note types stored as JSON inside the `col` row.

## Decision

### Read the ZIP directly, with no library

The central directory is parsed by hand and deflate members are inflated with
`DecompressionStream('deflate-raw')`, which every supported browser has. A ZIP
reader is a few hundred lines of well-specified structure parsing, and writing
it means the safety checks — encryption, unsafe names, entry counts, declared
sizes, compression ratios — are decisions in our code rather than options in
someone else's.

ZIP64 records are followed. A collection with more than 65,535 media files
writes saturated 32-bit fields, and those are exactly the largest real packages.

**Media is never read.** The central directory names every member, but only
`meta` and the collection are ever decompressed. This is a property of the code,
not a promise: nothing calls `read` on a media entry.

### `fzstd` for zstd

No browser exposes a zstd decoder — `DecompressionStream` has gzip, deflate, and
deflate-raw only — and the modern package format is zstd, so a decoder is not
optional. `fzstd` is roughly 10 kB, MIT licensed, decompression only, with no
WebAssembly of its own. It decompressed the real 1.0 MB collection in 35 ms.

Being decompression-only is a feature here: the dependency that touches the
learner's collection has no ability to write one.

### `sql.js` for SQLite

The alternative was a hand-written read-only b-tree page reader. That is real
binary parsing against a format where a subtle mistake reads plausible-looking
wrong data rather than failing, and the data decides which vocabulary a learner
is told they know. `sql.js` is the standard SQLite build, and the queries stay
ordinary SQL that can be checked against Anki's own schema.

It is wrapped behind `CollectionDatabase`, whose entire surface is
`query(sql, params)` and `close()`. There is no `run` or `exec`, so "Monosai
never writes to your Anki collection" is a type, not a review question.

The WebAssembly binary is copied to `assets/sqlite/` by the build and its URL is
passed into the worker, because a worker cannot know the application base href —
the same pattern the language worker uses for its bundle. It is deliberately not
a versioned language-bundle component: it is a runtime, not a language asset, it
has no manifest entry to version against, and nothing stored in IndexedDB
depends on which build parsed a package.

Both libraries are imported dynamically **inside the package worker**, so the
850 kB initial-bundle budget is untouched and a learner who never imports a
package never downloads either.

### Supported collection members

Preferred in order: `collection.anki21b` (zstd), `collection.anki21` (plain),
`collection.anki2` (plain). Preferring the newest is what stops the legacy
upgrade stub from being read as the collection.

Two schema layouts are supported behind one reader, chosen by which tables
exist rather than by the version number:

- **normalized** (schema 18): `decks`, `notetypes`, `fields`; nested deck names
  use the unit separator `U+001F`;
- **legacy JSON** (schema 11): `col.decks` and `col.models`; nested deck names
  use `::`.

Both are normalized to `::` so the rest of the application sees one convention,
the one Anki itself displays.

Anything else fails as `package-schema-unsupported`. No package is ever
converted in place.

### Review eligibility

A note is eligible when at least one of its cards is in the selected deck scope
and has `reps > 0`. A card sitting in a filtered deck records its real deck in
`odid`, so the home deck is `odid !== 0 ? odid : did` — otherwise studying
through Custom Study would silently move a card out of its mapping.

A collection whose `cards` table has no `reps` column cannot prove eligibility
and fails as `package-review-data-missing`. A collection that has the column but
no reviews is a different answer: it yields zero entries and a warning that the
package may have been exported without scheduling information. The two are not
distinguishable from the data alone, so the warning names the possibility rather
than asserting it.

### Resource limits

Every size in a learner-supplied archive is attacker-controlled, so
`DEFAULT_PACKAGE_LIMITS` bounds the archive (512 MB), the entry count (200,000),
any single decompressed member (512 MB), and the expansion ratio of one member
(250x). Real collections sit far below all four — the Kaishi collection expands
about 3.4x — so a legitimate package never meets one.

## Consequences

- Two new runtime dependencies, both worker-only and lazily imported.
- Fixtures must be committed rather than generated at test time: zstd has no
  compressor in `fzstd` or in `CompressionStream`, and `node:sqlite` does not
  exist in the browser test bundle. `web/scripts/fixtures/build-anki-fixtures.mjs`
  builds them reproducibly using only Node built-ins.
- The package pipeline runs in its own worker, terminated after use. A `close`
  message frees the database, but only terminating the worker returns the
  WebAssembly heap to the browser.
- Field markup is **not** turned into text in the worker: `DOMParser` does not
  exist there. Raw field values cross back and `DomMarkupTextExtractor` parses
  them into an inert document on the main thread.

## Alternatives considered

**`@sqlite.org/sqlite-wasm`.** The official build, but oriented around OPFS
persistence; opening a byte array as a transient in-memory database is more
ceremony for no benefit when nothing is ever persisted.

**A hand-written SQLite page reader.** Rejected above: no dependency, but the
failure mode is silently wrong vocabulary rather than a clear error.

**A ZIP library.** Rejected because the safety checks are the point, and a
library's are whatever they are; the parsing this needs is small and fully
specified.
