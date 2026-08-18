# 0008 — Grammar profile as difficulty presets

Date: 2026-08-18
Status: Accepted, with two paragraphs superseded
Supersedes: the *selection* decisions in
[0007](0007-grammar-catalog-and-structural-baseline.md). The catalog and
structural baseline datasets, their licensing, ids, and build pipeline are
unchanged.
Superseded by: [0014](0014-remove-grammar-rule-catalog.md) in two places — the
"Storage and versioning" paragraph, which shipped presets inside the grammar
catalog asset and declined to make them a separate versioned component, and the
first Consequences bullet, which kept the 256 rules as reference content and as a
display lookup for naming findings. The catalog is deleted; presets ship as their
own `grammarPresets` component and the component count is still four. Everything
else here stands.

## Context

Milestone 4 specified a grammar profile built from 256 individually selectable
catalog rules presented as searchable JLPT level accordions, with cumulative
"select through N…" semantics and free-text custom rules. The screen was not yet
built. A design investigation before building it found four problems, three of
them measured against the shipped datasets.

**Roughly a third of the catalog cannot carry information.** 41 rule patterns
are exact surface duplicates of always-allowed structural-baseline forms (22 at
N5, 15 at N4, 4 at N3, none at N2 or N1) — `〜は`, `〜が`, `〜を`, `〜です`,
`〜ます`, `〜た`, `〜て`, `〜ば`, `〜ながら`, `〜ので`. A further 38 are named by a
grammatical label while the baseline entry names the same construction in its own
English name: the baseline ships `sb-infl-reru` as "れる / られる (passive,
potential)" while the catalog ships `可能形` and `受身形` as two separate
selectable chips; `sb-aux-ageru` is "てあげる (do for someone)" and the catalog
ships `〜てあげる` again. That is **79 rules, 31% of the catalog, that state
nothing the request does not already contain.** Counting compositional cases
where every morpheme is baseline the figure is 110 of 256, 43%. The redundancy is
almost exclusively at the bottom: 66% of N5 and 64% of N4, against 0% exact
overlap at N2 and N1. After also removing nine N5 entries that are vocabulary or
part-of-speech labels rather than grammar (`これ / それ / あれ`, `い形容詞`,
`とても / あまり` — demonstratives that 0007 deliberately excluded from the
baseline as ordinary vocabulary), **only 11 of the 58 N5 rules are additive.**

**The payload was inverted against its own importance.** Serializing the full
catalog in `PromptGrammarRule` shape measures 77,921 bytes, approximately 22,000
tokens; the N5+N4 selection a target learner actually makes is approximately
10,000. The 1,800-entry vocabulary allowlist — which is validated locally,
strictly, and blocks acceptance — costs approximately 5,000–7,000. The advisory
grammar profile cost three to four times the payload of the list that does the
real work, sitting immediately below a 177-entry structural baseline block
restating the same forms. The `context-budget-exceeded` guard in
`ai-pipelines.md` §4 has no documented numeric limit anywhere in `docs/`.

**The profile could not express what beginners want.** `structuralBaseline` is
sent unconditionally alongside `allowedGrammar`, so the profile can only add
permissions. A learner selecting only N5 could still be handed 食べさせられました,
because the baseline had already licensed れる・られる and せる・させる. "Nothing
harder than this" was not expressible at all.

**Selection asked a question learners cannot answer.** Self-assessability tracks
surface uniqueness and lexicality, not JLPT level. N5 `〜なければなりません` is
trivially assessable; N1 `〜なり (as soon as, literary)` is not, because it
collides with `なり〜なり`, `なりに`, and the catalog's own `〜なりとも`, and
`searchAliases` is populated on zero of the 256 rules. Eight rules ship a bare
kanji grammatical label as their `pattern` — `可能形`, `受身形`, `使役形`,
`使役受身形`, `意向形`, `命令形`, `連体修飾節`, `数＋助数詞` — while
`ux-ui-specification.md` §9 made the chip *be* the pattern, so the N4/N5
accordions aimed at beginners contained labels a beginner cannot read.

A secondary problem: `profileHash` covers ordered rule identities and content
with no granularity, so toggling one chip invalidates every stored
`GrammarAnalysisRecord`, and a copyedit to one `descriptionEn` would invalidate
every analysis for every user.

## Decision

The grammar profile becomes **one choice from six ordered difficulty presets**,
each carrying prose prompt guidance, plus an optional register preference and an
optional user-edited variant. Per-rule selection is removed from the product.

| Preset id | Name | Caption | Approximate level |
| --- | --- | --- | --- |
| `mn-preset-starter` | Starter forms | the first patterns in any course | below N5 |
| `mn-preset-basic` | Basic forms | usually taught around N5 | N5 |
| `mn-preset-everyday` | Everyday forms | usually taught around N4 | N4 |
| `mn-preset-explanatory` | Explanatory forms | usually taught around N3 | N3 |
| `mn-preset-formal` | Formal patterns | usually taught around N2 | N2 |
| `mn-preset-literary` | Literary patterns | usually taught around N1 | N1 |

Presets are named for the grammar the learner commands, never for a JLPT level.
The level appears only as a caption using the wording 0007 already established —
"usually taught around N…" — because the Japan Foundation and JEES publish no
official exhaustive grammar list. Presets are cumulative in reading: each one
leaves everything simpler available.

Each preset carries **`promptGuidance`** — prose sent to the model in place of
`allowedGrammar`. It states a complexity ceiling, a sentence-length band, and
names characteristic patterns by their pattern strings. Every preset ends with a
sentence stating that the named patterns are examples of the level and not
targets to hit, mirroring the treatment `ai-pipelines.md` §4 already gives the
hidden vocabulary suggestion palette. Guidance runs approximately 110–170 tokens,
replacing a payload of up to approximately 22,000.

**The profile references no catalog rule IDs at any point.** An earlier draft of
this decision gave each preset a `coveredRuleIds` set as a deterministic local
novelty boundary for advisory grammar analysis (UC-08). That was rejected on
review: it bought determinism for a feature that is explicitly advisory,
non-blocking, and already disclaims exhaustive detection, and it paid for that
with roughly 137 per-rule editorial judgements across six tiers, maintained
forever. It moved the 256-rule problem from the learner to the maintainer rather
than removing it. It also could not describe a user-edited variant at all —
prose cannot be resolved to rule IDs, so a fork of *Everyday forms* saying "I
also know casual contractions" would have silently inherited the wrong set.

Grammar review instead judges novelty against the captured guidance prose, which
is supplied to the review request. Verdicts may therefore vary between runs; they
are cached by profile hash, so a given profile yields one stored answer per
sentence. ~~Where a returned pattern happens to match a catalog rule, the UI may
link to that rule's detail sheet.~~ Removed by
[0014](0014-remove-grammar-rule-catalog.md): a finding is named by the review's
own pattern and explanation, with no second description to contradict it.

### Storage and versioning

~~Presets ship **inside the existing grammar catalog asset** as a top-level
`presets` array. They are not a fifth versioned component.~~ Superseded by
[0014](0014-remove-grammar-rule-catalog.md): with the catalog deleted, presets
ship as `grammar-presets.json` under their own `grammarPresets` manifest
component, taking the slot the catalog vacated.
`LanguageAssetSettings` still records four component versions, as this decision
intended.

Source of truth is `data/language/grammar-presets.source.json`, validated and
compacted by `scripts/assets/build-grammar-presets.mjs` (named
`build-grammar-catalog.mjs` until 0014), which checks that guidance is present,
within its length bound, free of unsafe HTML, and that no preset name contains a
JLPT level. The soft lint that warned when a quoted Japanese pattern appeared
nowhere in the catalog became a structural check when 0014 removed the corpus.

### Domain model

`GrammarProfileSnapshot` captures the resolved `promptGuidance` string, not only
`presetId` — the same principle 0007 applied to rule text, so preset revisions
cannot rewrite the history of generated stories.

`CustomGrammarRule` is **removed**. Its purpose was an escape hatch for patterns
outside the catalog, and it demanded an English `descriptionEn` for a construction
the learner may only know by feel — the exact metalinguistic skill a self-taught
learner lacks. A user-edited preset variant is a better escape hatch and is one
field rather than a records table: the user forks a preset into free text
prefilled with that preset's guidance, bounded at 1,000 characters like
`specialInstructions`. Because nothing in the profile references rule ids, a
custom variant behaves exactly as a preset does.

`profileHash` covers the resolved guidance text, the register preference, and the
structural-baseline version. Because a preset changes only when the learner
deliberately moves tiers, the staleness churn that made one chip tap invalidate
every cached analysis largely disappears. Moving tiers still invalidates every
analysis, and that is correct: the novelty boundary genuinely changed.

### Fresh install

A fresh install defaults to `mn-preset-starter` rather than selecting nothing,
and the non-empty-profile generation gate is removed. **This reverses UC-03's
"nothing is selected on a fresh install" acceptance rule.** The gate's only
effect was to block a user who had a key, a tested model, a sufficient snapshot,
and a premise, routing them into a taxonomy they could not read. `Starter forms`
is also the tier whose constraints a 50–200 entry snapshot can actually satisfy,
so the first story a beginner sees is likeliest to validate rather than return as
an unsaved marked draft.

## Consequences

- ~~The 256 catalog rules survive as reader reference content and as a display
  lookup for naming findings.~~ Superseded by
  [0014](0014-remove-grammar-rule-catalog.md): nothing referenced the rules, so
  the catalog was deleted rather than kept for consumers that were never built.
  Their `mn-<level>-<slug>` ids are gone with it.
- Milestone 4 loses the chip grid, level accordions, cumulative selection,
  per-level counts, virtualization, and the custom-rule records table. Its
  "hundreds of chips remain responsive" checkpoint is replaced.
- Six preset guidance texts, descriptions, and example sentences become product
  copy requiring language review as a release gate.
- Grammar precision is knowingly reduced. A learner who wants exactly
  `〜ざるを得ない` must write it into a custom variant. No learner was making 256
  honest judgements, so the loss is smaller than the count suggests, but it is
  real and is the trade this decision accepts.
- The top two presets can outrun a small snapshot: `〜をものともせず` needs
  abstract content words. The Generate prerequisite panel gains a non-blocking
  warning when preset and snapshot size are badly mismatched.
- A pre-existing data defect remains open, now non-blocking:
  approximately 24 catalog ids do not correspond to their pattern
  (`mn-n3-kke-nai` is `〜わけがない`, `mn-n3-mono-no` is `〜つつ`, `mn-n2-dogeza`
  is `〜を抜きにして`, `mn-n1-izure` is `〜いかんによらず`), and `mn-n2-nuki`
  /`mn-n2-dogeza` are near-duplicates the build's duplicate check misses because
  the pattern strings differ.

## Alternatives considered

**Functional bundles.** Group the 256 rules into roughly fourteen cross-level
bundles ("cause and reason", "guessing and hearsay") with a *Not yet / Basics
only / All* control each. Rejected: it reduces 256 decisions to 42, which is
still 42 decisions about categories matching no learner's mental model, in
service of a signal nothing enforces. It also keeps the per-rule payload and the
hash granularity problem intact.

**Recognition calibration.** Show 8–12 probe sentences and infer a profile from
which the learner reports understanding. Rejected as the most expensive option
for the least consequential signal: probe authoring and the inference from ten
binary answers to 256 rules would be maintained forever, and comprehension of a
probe sentence is confounded by vocabulary, so a returning learner with a small
snapshot is under-profiled for lexical reasons.

**Keeping selection but hiding the 79 redundant rules.** Rejected as a partial
fix: it leaves the payload inversion, the hash churn, the unanswerable-question
problem, and the inability to express a ceiling.
