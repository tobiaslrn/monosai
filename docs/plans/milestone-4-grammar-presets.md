# Milestone 4 — Grammar profile as difficulty presets

Implementation plan. Read [ADR 0008](../decisions/0008-grammar-profile-presets.md)
first; it carries the reasoning and the measurements. This document is the work.

> **Status: delivered.** Read this alongside
> [ADR 0014](../decisions/0014-remove-grammar-rule-catalog.md), which deleted the
> grammar rule catalog after this plan was written. Every reference below to the
> catalog surviving as reference content, to `build-grammar-catalog.mjs`, or to
> merging presets into `grammar-catalog.json` is historical: presets ship as
> their own `grammarPresets` component built by `build-grammar-presets.mjs`.

## What you are building

The grammar profile stops being 256 selectable rules and becomes one choice from
six ordered difficulty presets, plus an optional register preference and an
optional user-edited variant. The profile references no rule ids — and, since
[ADR 0014](../decisions/0014-remove-grammar-rule-catalog.md), no rule catalog
exists to reference.

Specifications already updated for this change: `product-requirements.md` UC-03
and UC-05, `ux-ui-specification.md` §7 and §9, `ai-pipelines.md` §4 and §8,
`domain-and-data-model.md` Grammar section, `implementation-roadmap.md` §6. Treat
them as authoritative; this plan is the sequence.

## Stage 0 — Catalog id hygiene — CANCELLED

**Cancelled, not pending.** The catalog was deleted rather than repaired; see
[ADR 0014](../decisions/0014-remove-grammar-rule-catalog.md), which records these
defects as part of the evidence for deleting it. Nothing below is outstanding
work. It is kept only so the decision's evidence has a visible source.

Approximately 24 catalog ids do not correspond to their pattern. Confirmed
examples: `mn-n3-kke-nai` is `〜わけがない`, `mn-n3-mono-no` is `〜つつ`,
`mn-n3-sappari` is `〜さえ〜ば`, `mn-n2-dogeza` is `〜を抜きにして`,
`mn-n2-wo-toshite` is `〜を問わず`, `mn-n1-izure` is `〜いかんによらず`,
`mn-n1-aru-imi` is `〜にあって`, `mn-n1-sokusoku` is `〜そばから`. Audit all 256
and re-slug the mismatches.

Also: `mn-n2-nuki` (`〜抜きで`) and `mn-n2-dogeza` (`〜を抜きにして`) are
near-duplicates the build's duplicate check misses because the pattern strings
differ textually. Decide whether they are one rule or two and make the build
catch the class.

ADR 0007 promises the ids are stable — honour that from this point forward, not
retroactively.

## Stage 1 — Preset data and build

Author `data/language/grammar-presets.source.json` with six entries in this
order. Names never contain a JLPT level; the caption is the only place one
appears.

| id | nameEn | captionEn |
| --- | --- | --- |
| `mn-preset-starter` | Starter forms | the first patterns in any course |
| `mn-preset-basic` | Basic forms | usually taught around N5 |
| `mn-preset-everyday` | Everyday forms | usually taught around N4 |
| `mn-preset-explanatory` | Explanatory forms | usually taught around N3 |
| `mn-preset-formal` | Formal patterns | usually taught around N2 |
| `mn-preset-literary` | Literary patterns | usually taught around N1 |

Each entry carries `order`, `nameEn`, `captionEn`, `descriptionEn`, `exampleJa`,
and `promptGuidance`. **No rule ids.** Japanese pattern strings are written
literally into the guidance prose. Approved copy is in the appendix below; it is
the deliverable for this stage, so there is no per-rule editorial work.

Extend `scripts/assets/build-grammar-catalog.mjs` to merge presets into
`grammar-catalog.json` as a top-level `presets` array and bump
`grammarCatalog.version` to `2.0.0` in `manifest.json`. Presets are **not** a
fifth versioned component; they ship and load with the grammar asset.

Build must fail on: a preset name containing `N1`–`N5`, missing or empty
guidance, guidance over 1,000 characters, a non-contiguous `order` sequence, and
the same unsafe-HTML rejection already applied to rule prose. Add a soft lint
that warns when a Japanese pattern quoted in guidance appears nowhere in the
catalog — it catches typos without coupling presets to rule ids. Update the
shipped attribution notice to mention presets.

## Stage 2 — Domain

In `src/app/domain/grammar/`:

- `presets.ts` — `GrammarPresetId`, `RegisterPreference`, `GrammarPreset`, the
  ordered id list, and a pure helper resolving guidance for a selection: preset
  or custom variant, plus the register suffix.
- `profile.ts` — replace `GrammarProfileSelection` and `GrammarProfileSnapshot`
  with the shapes in `domain-and-data-model.md`. Delete `isProfileEmpty`.
- `rules.ts` — delete `CustomGrammarRule`. Keep `CatalogGrammarRule` untouched.
- Hashing: `profileHash` covers resolved guidance, register preference, and
  structural-baseline version. It must **not** cover catalog rule content, so
  catalog copyedits do not stale every user's analyses. Follow ADR 0002 for
  canonical serialization.

Keep this layer free of Angular, Dexie, and asset-loading concerns.

## Stage 3 — Persistence and migration

`GrammarRepository` loses `setCatalogRuleSelected`, `setCatalogRulesSelected`,
`listCustomRules`, `saveCustomRule`, `removeCustomRule`, `reorderCustomRules`.
It gains `getSelection`/`setSelection` over the new selection shape, and keeps
`captureProfile`/`getProfileCapture`.

Dexie migration: drop the custom-rule and rule-selection stores, seed the
selection with `mn-preset-starter` / `either`. Existing `grammarProfileSnapshots`
rows are historical captures — migrate them forward or leave them readable in
their old shape, but do not destroy them; per the non-functional requirements a
migration must either preserve existing data or fail without destroying the
previous database. Nothing has shipped to real users, so the pragmatic choice is
a clean drop of live selection state with historical captures preserved.

## Stage 4 — Feature UI

New `src/app/features/grammar/`. Per `ux-ui-specification.md` §9:

- Preset picker: six cards, easiest first, single selection, each showing name,
  caption, one-line description, and the example sentence. The example is the
  primary affordance — learners choose by reading it. Radio-group semantics,
  keyboard operable, 44px targets, visible focus, correct `lang` attributes on
  Japanese text.
- Register control below the picker, three options, defaulting to either.
- **Use my own wording** opens a 1,000-character field prefilled with the
  selected preset's guidance, with **Reset to preset**. A custom variant behaves
  exactly as a preset does; nothing about it is approximate.
- Read-only searchable catalog reference below that, searching pattern, name, and
  description, opening the existing detail sheet. Nothing selectable. Level
  described as a catalog classification, not official truth.
- Read-only structural-baseline section, unchanged in intent.
- Changing a preset tells the user in one line that existing grammar analyses
  become stale.

Delete the chip grid, level accordions, cumulative selection, per-level counts,
virtualization, and the custom-rule editor from the plan entirely. They are not
being built.

## Stage 5 — Pipeline wiring

- `StoryGenerationRequest`: `allowedGrammar` is replaced by `grammarGuidance:
  string` and `registerPreference`. `structuralBaseline` is unchanged. Never
  serialize catalog rule objects into a request again.
- Remove the empty-profile prerequisite from generation and from the prerequisite
  panel; it becomes a read-only line naming the current preset.
- Add the non-blocking snapshot-mismatch warning when a high preset is paired
  with a small snapshot.
- Grammar review (§8): supply the captured guidance prose with the review request
  and let novelty be judged against it. No per-rule set exists. Where a returned
  pattern matches a catalog rule, link the finding to that rule's detail sheet —
  display only, no effect on the verdict.
- Implement the 60,000-token request-size guard that `ai-pipelines.md` §4 now
  documents, failing with `context-budget-exceeded` rather than truncating.

## Stage 6 — Tests

Domain unit tests: hash stability across irrelevant changes and change on
guidance/register/baseline-version change; guidance resolution for presets and
custom variants, including the register suffix; the 1,000-character bound.

Asset tests, extending `language-asset-bundle.spec.ts`: all six presets load and
validate; `order` is contiguous and starts at zero; no name contains a JLPT
level; every guidance string is non-empty and within bounds.

Integration: migration preserves historical captures and seeds the default;
selection survives reload; capture is immutable.

E2E, desktop and Android viewports: fresh install can generate without visiting
Grammar; changing a preset marks existing analyses stale; custom variant persists
and resets; keyboard-only traversal of the picker.

## Definition of done

Lint, typecheck, unit, integration, E2E, and the production build all pass. The
grammar screen has been inspected in the rendered application at both viewports
with no console errors. A generated request has been observed carrying prose
guidance and no rule objects. Working tree clean or unrelated changes reported.

## Decisions taken for you, worth confirming before you build

1. **Fresh installs default to `Starter forms` and the empty-profile gate is
   gone.** This reverses UC-03's old "nothing is selected on a fresh install"
   rule. Reasoning is in ADR 0008; if the owner disagrees, restoring the gate is
   a small change confined to Stage 5.
2. **`CustomGrammarRule` is deleted** rather than kept alongside custom guidance.
3. **Presets ship inside the catalog asset**, not as a fifth component version.
4. **The request-size guard is 60,000 tokens.** The spec previously promised a
   guard with no number; this is a defensible starting value, not a measured one.
   Revisit once real request sizes are observed.

## Appendix — approved guidance copy

Pattern strings are written literally; no rule ids are involved.

**Starter forms.** Write below JLPT N5 complexity, at the level of a learner's
first few weeks. Every sentence is a single clause of roughly 6–14 characters
expressing one idea, with no clauses joined together. Use only: the polite copula
です and ではありません; polite present 〜ます and 〜ません; the particles は, が,
を, に, で, と, も, の, か; 〜があります／〜います; and adjectives used as
predicates (おいしいです, 大きいです). Do not use past tense, the て-form, 〜たい,
〜から, 〜とき, conditionals, potential, passive, causative, volitional, relative
clauses, or any conjunction joining two clauses. Keep subject matter concrete and
physical. These patterns are examples of the level, not a list to work through.

**Basic forms.** Write at roughly JLPT N5 complexity; everything simpler remains
available. Short sentences, typically 10–20 characters, of one clause or two
joined ones. Now available in addition to the starter patterns: plain past 〜た
and polite 〜ました／〜ませんでした, plain negative 〜ない, the て-form for joining
clauses and for 〜てください／〜ています／〜てもいいです, 〜たい, 〜から (because),
〜が／〜けれど (but), 〜とき, 〜だけ, 〜より〜のほうが, 〜ことができます,
〜なければなりません, 〜になります／〜くなります. Still avoid passive, causative,
volitional, conditionals (〜ば, 〜たら, 〜なら), and relative clauses modifying a
noun. These patterns are examples of the level, not a list to work through.

**Everyday forms.** Write at roughly JLPT N4 complexity; everything simpler
remains available. Sentences of one or two clauses, typically 15–35 characters.
Natural at this level: conditionals 〜たら, 〜ば, 〜と, 〜なら; potential and
volitional forms; 〜てあげる／〜てくれる／〜てもらう; 〜ておく, 〜てしまう,
〜てみる; conjecture 〜かもしれない, 〜だろう, 〜はずだ, 〜ようだ, 〜らしい;
connectives 〜ながら, 〜ので, 〜のに, 〜し; short relative clauses;
〜たことがある, 〜ほうがいい, 〜すぎる, 〜やすい／〜にくい. Avoid formal written
connectives such as 〜において or 〜に基づいて, and any literary or idiomatic
pattern. These are examples of the level, not targets to hit.

**Explanatory forms.** Write at roughly JLPT N3 complexity; everything simpler
remains available. Sentences of up to three clauses, typically 25–50 characters,
and abstract or explanatory subject matter is fine. Natural at this level:
〜わけだ, 〜ものだ, 〜べきだ, 〜に違いない, 〜はずがない, 〜ように, 〜ために,
〜によって, 〜に対して, 〜について, 〜として, 〜おかげで, 〜せいで, 〜うちに,
〜たびに, 〜っぽい, 〜がち, 〜ざるを得ない, 〜しかない, 〜だけでなく. Avoid
heavily formal patterns such as 〜を問わず or 〜にもかかわらず, and literary forms
such as 〜ゆえに or 〜べく. These are examples of the level, not targets to hit.

**Formal patterns.** Write at roughly JLPT N2 complexity; everything simpler
remains available. Longer sentences with nested modification are appropriate.
Natural at this level: 〜において, 〜に関して, 〜に基づいて, 〜に沿って,
〜を通じて, 〜をめぐって, 〜を問わず, 〜にもかかわらず, 〜一方で, 〜反面,
〜次第, 〜だけに, 〜につれて, 〜に伴って, 〜かねない, 〜がたい,
〜わけにはいかない, 〜ものだから, 〜にしては. Avoid classical and literary forms
such as 〜ゆえに, 〜べく, 〜ごとき, 〜や否や. These are examples of the level, not
targets to hit.

**Literary patterns.** Write without a complexity ceiling, at roughly JLPT N1 and
below. Sentence length, clause nesting, register, and idiom are yours to choose
to serve the story. Literary and idiomatic patterns are available where they fit,
including 〜ゆえに, 〜べく, 〜ごとき, 〜や否や, 〜なり, 〜そばから, 〜ずくめ,
〜まみれ, 〜だらけ, 〜をものともせず, 〜をよそに, 〜に足る, 〜を禁じ得ない,
〜と相まって, 〜に即して, 〜もさることながら. Use them only where they read
naturally; do not showcase them.

The register preference appends one line: everyday spoken → "Prefer casual spoken
register, including contractions, where the scene allows."; polite written →
"Prefer polite written register throughout."; either → nothing appended.
