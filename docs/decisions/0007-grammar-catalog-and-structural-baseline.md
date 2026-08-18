# 0007 — Grammar catalog and structural baseline

Date: 2026-08-18
Status: Accepted

## Context

The specification requires a licensed N5–N1 grammar catalog with stable ids,
level classification, Japanese pattern, English name and description, optional
formation and examples, source attribution, and a catalog version. It also
requires a separate Monosai-versioned structural baseline of sentence-building
forms which must not contain general content words. Both need reproducible build
scripts, schema validation, duplicate detection, and shipped attribution. The
application must not claim that JLPT publishes an official exhaustive grammar
list.

## Decision

Both datasets are **authored for Monosai** and dedicated to the public domain
under CC0-1.0. They live as reviewable JSON sources under `data/language/` and are
validated and compacted into the shipped bundle by
`scripts/assets/build-grammar-catalog.mjs` and
`scripts/assets/build-structural-baseline.mjs`.

- Grammar catalog: 256 rules — N5 58, N4 55, N3 50, N2 48, N1 45. Ids follow
  `mn-<level>-<slug>` and are stable; the level records where a pattern is
  conventionally taught, which the shipped attribution states explicitly.
- Structural baseline: 177 entries across particles (43), copula (4), auxiliaries
  (20), productive inflection (15), conjunctions (14), formal nouns (16), affixes
  (4), counters (38), and punctuation (23).

### Why not an existing dataset

A survey of published JLPT grammar datasets found none that passes the
redistribution and modification gate together with the content gate. The lists
that are openly licensed (for example the tanos.co.uk level lists, CC BY) are
pattern inventories without English descriptions, so descriptions would have to be
written anyway. The datasets that do carry descriptions are either unlicensed
scrapes of commercial study sites or forks with no licence file at all. Shipping
either would violate the "redistribution and modification rights compatible with
the project" gate. Authoring the catalog keeps the licence unambiguous, the ids
stable and under our control, and the wording consistent.

### Selection gates

| Gate                                   | Evidence                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Broad N5–N1 coverage                   | 256 rules, every level populated, individually selectable                                        |
| Redistribution and modification rights | CC0-1.0, authored in this repository                                                             |
| Attribution shipped with the app       | Notices in `manifest.json`, rendered in Settings                                                 |
| Stable ids                             | `mn-<level>-<slug>`, uniqueness enforced by the build and by `language-asset-bundle.spec.ts`     |
| Schema validation                      | Zod schemas at load time; build-time validation of every field                                   |
| Duplicate detection                    | Duplicate ids and duplicate level-and-pattern pairs fail the build                               |
| Non-empty descriptions                 | Minimum description length enforced by the build                                                 |
| Level validation                       | Level must be one of N5–N1 and must match the id prefix                                          |
| Review of unsafe HTML                  | Angle brackets and HTML entities are rejected in every prose field                                |
| Fixture sampling and language review    | Sampled by `language-asset-bundle.spec.ts`; a full manual language review is a release gate      |

## Structural baseline scope

The baseline contains only forms that build sentences. It deliberately excludes:

- content nouns, verbs, and adjectives, enforced by the build, which rejects the
  `verb`, `adjective-i`, `adjective-na`, and `proper-noun` parts of speech and
  allows `noun` only in the explicitly enumerated `formal-noun` category;
- demonstratives and pronouns such as これ, その, and 誰. They are ordinary
  vocabulary a learner is expected to have reviewed, and marking them readable by
  default would overstate what the learner knows;
- numerals, which the entity recognizer handles deterministically instead.

Counters are included because a counter cannot be avoided when a number is
present, and non-independent verbs (the いる of ている, the おく of ておく) are
included because they are auxiliary morphology rather than the content verb.

A surface can legitimately belong to two entries: で is both a case particle and
the connective form of て. The build records every such overlap in the shipped
artifact as `overlappingForms`, and the matcher resolves them by declaration
order, so the resolution is deterministic and reviewable rather than hidden.

## Consequences

- The catalog and baseline are versioned independently of the tokenizer and
  dictionary; `LanguageAssetSettings` records all four versions.
- Grammar catalog content guides prompts and advisory review only. It is not a
  local grammar validator, and nothing in the classifier reads it.
- Expanding the catalog is additive: new rules get new ids, and existing captured
  grammar profiles keep resolving because generated stories capture resolved rule
  text rather than ids alone.
