# 0014 — Remove the grammar rule catalog

Date: 2026-08-18
Status: Accepted
Supersedes: the *catalog* decisions in
[0007](0007-grammar-catalog-and-structural-baseline.md) — the dataset, its ids,
its licensing, and its build pipeline — and the "the 256 catalog rules survive as
reader reference content and as a display lookup" consequence in
[0008](0008-grammar-profile-presets.md). The structural baseline half of 0007 is
untouched and is now the only enumerated grammar dataset Monosai ships.

## Context

[0008](0008-grammar-profile-presets.md) replaced per-rule selection with six
ordered difficulty presets carrying prose guidance. It left the 256-rule catalog
in the shipped bundle — 86 KB of the asset — for three jobs, none of which had
been built:

1. a searchable read-only grammar reference screen;
2. a display lookup for naming Milestone 8 grammar findings;
3. a build-time lint checking that Japanese patterns quoted in preset guidance
   exist somewhere in the catalog.

At the point of this decision **no rule content reached the running application
at all**. `LanguageRuntimeInfo` exposed `grammarRuleCount`, `grammarPresets`, and
`registerGuidance`; the rules array was parsed, counted, and discarded. Every
consumer was hypothetical.

### The three jobs do not pay for the dataset

**The reference screen would be poor.** `searchAliases` is empty on all 256
rules, so the promised search would match only the literal pattern string. Eight
rules ship a bare kanji grammatical label as their pattern — `可能形`, `受身形`,
`使役形`, `使役受身形`, `意向形`, `命令形`, `連体修飾節`, `数＋助数詞` — where the
UX specification expects a readable pattern, and those sit at exactly the N4/N5
end a beginner would browse. 0008 measured that 79 rules (31%) restate a
structural-baseline form the learner is already told is always readable, rising
to 66% of N5 and 64% of N4, so the screen would be at its least informative
precisely where a beginner would open it.

**The findings lookup risks contradicting the model.** Milestone 8's grammar
review returns its own pattern and explanation, and 0008 already established that
novelty is judged against the captured guidance prose rather than a rule set. A
catalog lookup would sit under a model-authored explanation and offer a second,
independently written description of the same construction — with roughly 24 ids
that do not correspond to their pattern, and confirmed cases where the `pattern`
field and the Japanese quoted in `nameEn` name two different expressions
(`mn-n2-dogeza` is `〜ぬきに` against `〜を抜きにして`; `mn-n1-mo-nannmo` is
`〜もなんともない` against `〜もなにもない`). The most likely outcome is a learner
shown two accounts that disagree.

**The lint is replaceable without a corpus.** It caught typos in quoted patterns.
The same regex can check the quoted strings structurally — non-empty, no trailing
punctuation carried in from the surrounding prose, no pattern named twice in one
guidance string — which catches the same class of authoring slip without a
256-entry corpus behind it.

### The measured defects

The catalog is Monosai-authored content, so its defects are ours to fix, and a
**full manual 256-entry language review** was recorded as a release gate. Confirmed before this decision, in addition to the
id/pattern disagreements above:

- `mn-n2-you-de-wa` ships an ungrammatical example, `こんな成績ようでは困る。`,
  missing the attributive connector between the noun and `ようでは`;
- `mn-n1-ni-shite-hajimete` ships `経験してにして初めて分かる。`, which writes the
  verb-attaching and noun-attaching forms of the pattern into one sentence;
- `mn-n2-nuki` and `mn-n2-dogeza` are near-duplicates that the build's uniqueness
  check misses because their pattern strings differ.

An attempt to extend the id audit mechanically was abandoned: kanji in a pattern
defeats romanization comparison at a rate that makes the output unreliable. The
remaining cases need the same manual pass that found the named ones.

## Decision

**Delete the grammar rule catalog.** `data/language/grammar-catalog.source.json`,
the shipped `grammar-catalog.json`, `CatalogGrammarRule`, `JlptLevel`,
`JLPT_LEVELS_EASIEST_FIRST`, `GrammarRuleId`, and `grammarRuleCount` are removed.
There is no in-app grammar reference and none is deferred: the scope is dropped,
not postponed.

JLPT level language survives only in preset captions — "usually taught around
N4" — which remain the learner's only anchor, in the wording 0007 established.

The presets become the fourth versioned language component in their own right,
shipping as `grammar-presets.json` with a `grammarPresets` manifest entry
carrying `presetCount`. **This supersedes 0008's "presets are not a fifth
component" reasoning without changing the count**: 0008 declined a fifth
component, and removing the catalog means presets simply take the slot it
vacated. `LanguageAssetSettings` still records four component versions.

The build script becomes `web/scripts/assets/build-grammar-presets.mjs`, keeping
0008's preset and register-guidance validation verbatim and replacing the corpus
cross-check with the structural check described above.

`profileHash` is also implemented here, in `domain/grammar/profile-hash.ts`. It
covers exactly the resolved guidance text, the register preference, and the
structural-baseline version, per 0008 and [0002](0002-hashing-and-canonical-serialization.md).
Captures are content addressed — the snapshot's id is its hash — so an unchanged
profile resolves to the capture that already exists rather than accumulating
duplicate rows.

## Consequences

- The shipped bundle loses approximately 80 KB. `grammar-presets.json` is 6.8 KB
  against the catalog's 86 KB.
- **There is no in-app grammar reference.** A learner who wants to look a pattern
  up uses an external resource. This is the cost the decision accepts, and it is
  smaller than it sounds: the catalog was never rendered, so nothing a user could
  see is lost.
- **Milestone 8 findings are named by the model's own explanation.** There is no
  local display lookup and no rule detail sheet to link to. A finding carries the
  pattern and explanation the review returned, and nothing contradicts it.
- The 256-entry manual language review is removed from the release gates. The
  review burden falls to six preset guidance texts, which 0008 already made a
  release gate, plus the untouched 177-entry structural baseline.
- `docs/grammar-catalog-defects.md` is deleted; its findings are recorded above.
- Preset guidance can now quote a pattern that no dataset in the repository
  defines. That is intended — guidance is prose sent to a model, not a key into a
  table — and is why the structural lint deliberately checks shape rather than
  membership.
- Restoring a reference screen later means authoring a new dataset with search
  aliases and reviewed content. The deleted one is recoverable from git history,
  but it is not a starting point worth returning to.

## Alternatives considered

**Keep the catalog, fix the defects.** Rejected on cost against value: the fix is
a 256-entry review by a fluent reader, and it buys three features that this
decision finds do not justify a dataset even in good repair.

**Keep the catalog only as the lint corpus.** Rejected: shipping 86 KB to users
to validate a build-time property is the wrong place for the check, and it would
have to be excluded from the bundle to avoid that — at which point it is a build
fixture, and a defective one, maintained for a check that has a structural
equivalent.

**Trim the catalog to the additive rules.** 0008 measured only 11 of 58 N5 rules
as additive. A trimmed catalog is a new dataset requiring the same language
review, and it would still be unrendered. Rejected as the full cost of authoring
with none of the benefit of deleting.
