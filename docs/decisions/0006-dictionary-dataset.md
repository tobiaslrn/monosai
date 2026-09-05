# 0006 — Bundled dictionary dataset

Date: 2026-08-18
Status: Accepted

## Context

The specification requires a compact common-word Japanese–English dataset that
permits static redistribution in a public application, includes written forms,
readings, English glosses and part-of-speech data, has versioned reproducible
build inputs with attribution in the manifest, fits an offline budget set by
implementation testing, has no runtime network dependency, and passes lookup
fixtures for common beginner vocabulary, kana-only words, orthographic variants,
and inflections.

## Decision

Use **JMdict, English, common words only**, taken from the
`jmdict-simplified` JSON conversion, release `3.6.2+20260817122448`.

The release archive is pinned by URL and SHA-256 in
`web/scripts/assets/sources.json`. `npm run assets:build` downloads it into the
gitignored `.asset-cache/`, verifies the digest, and compacts it into
`public/assets/language/1/dictionary.json`, which is committed.

### Gates

| Gate                            | Evidence                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| Static redistribution permitted | JMdict is CC BY-SA 4.0 (EDRDG); the conversion is CC BY-SA 4.0. Both notices ship in the manifest |
| Written forms and readings      | Kanji forms and kana forms, most common first                                                    |
| English glosses                 | Up to four senses per entry, four glosses per sense                                              |
| Part-of-speech data             | JMdict codes mapped at build time to the bounded `PartOfSpeech` enum                              |
| Ambiguous kana ranking          | Bounded verb families and JMdict's usually-kana marker retained as compact sense metadata         |
| Reproducible build inputs       | Pinned release URL plus digest; the build fails if either changes                                 |
| Offline budget                  | 3.46 MB raw, 0.90 MB gzipped, 22,629 entries, parsed in ~36 ms                                    |
| No runtime network dependency   | The artifact is served from the application's own origin and cached immutably                    |
| Lookup fixtures                 | `dictionary-index.spec.ts` covers beginner words, kana-only words, variants, and inflections     |

### Rejected alternatives

- **Full `jmdict-eng`** (11 MB compressed, ~200k entries). Rejected on size: the
  audience is beginners with 50 to 1,800 reviewed entries, and the common-only
  subset already covers the vocabulary they will meet.
- **`jmdict-examples-eng`.** Adds example sentences and 13.5 MB for a feature the
  specification does not ask for in v1.
- **EDICT2 / raw JMdict XML.** Same data, but XML would have to be parsed in the
  build script for no benefit over the maintained JSON conversion, which already
  normalizes tags and marks common forms.
- **A hand-curated beginner word list.** Rejected because it would be
  unmaintainable and would give worse coverage than a licensed dataset for the
  same effort.

## Consequences

- The compaction is lossy by design: JMdict cross-references, dialects, fields of
  use, and language-of-origin data are dropped, search-only kanji forms (`sK`) and
  outdated or irregular kana (`ok`, `ik`) are dropped, and senses and glosses are
  bounded. Verb conjugation families and the usually-kana marker (`uk`) survive
  only as library-neutral ranking metadata. `dictionaryAssetHeaderSchema` records the applied limits in the
  artifact, so what was dropped stays visible.
- Because the derived asset is a JMdict derivative, it is redistributed under
  CC BY-SA 4.0; the notice is part of the shipped manifest and is displayed in
  Settings.
- JMdict codes never reach application code. If a future release introduces an
  unmapped code, `npm run assets:build` fails rather than silently flattening it
  to `other`.
- The lookup index is built in the worker at initialization rather than shipped,
  which keeps the artifact small and keeps the dictionary out of the user's
  database entirely.
- Refreshing the dataset means bumping the pinned release, rerunning
  `npm run assets:build`, and reviewing the diff: entry count and digests change
  in the manifest, so the change is visible in review.
