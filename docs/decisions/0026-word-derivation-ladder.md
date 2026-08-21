# 0026 — Word details read as a derivation ladder, built from the analyzer's inflection form

Date: 2026-08-21
Status: Accepted
The presentation decision in this record is superseded by
[0028](0028-word-form-summary-popup.md). The analyzer inflection-form mapping
and other local evidence improvements introduced here remain accepted.
Supersedes the presentation decided in
[0015](0015-structural-baseline-stays-curated.md), which wired the matched
baseline entry into the word inspector as a flat list of morphemes. The baseline
still supplies the naming; only how the parts are read changed.

## Context

Word details listed one row per analyzer morpheme. For 分からなかった that was:

```
分から   Verb                      Dictionary form 分かる
なかっ   ない (negation)            Negates a verb or auxiliary, inflecting to なく and なかっ.
た      た (past and completion)   Marks past tense or a completed state.
```

Four problems, and only the last is cosmetic.

1. **なかっ is not a word.** It is the stem ない takes before た, and it exists
   for no other reason. A learner shown なかっ has been shown a string they can
   never look up, say on its own, or find in a dictionary.
2. **It never said what the word was.** Nothing on the card stated that
   分からなかった is the plain past negative of 分かる, which is the question a
   learner stops on an inflected word to ask.
3. **Inflections that add no ending were unexplainable.** 行けば, 行け and 行こう
   carry their inflection in the head's own shape. The ば of 行けば is a separate
   word, and 行け as an order has no second token at all. The head row said
   "Verb" and stopped.
4. **The rows were not comparable.** The head row gave a word class, the ending
   rows gave baseline names, and each carried dataset prose restating what the
   row above it had already shown.

## Decision

Word details show a **derivation ladder**: the dictionary form, then one step per
ending, each step naming the ending in *its own* dictionary form and the form the
word takes once it is applied — plus a one-line summary of the whole form.

```
Plain · negative · past

  分かる                       dictionary form
  + ない   negation        →   分からない
  + た     past and completion →  分からなかった
```

Every step is a button. Pressing it opens the baseline's fuller description and
names the stem as written (`Written here as なかっ.`); hovering or focusing it
tints that stem in the headword above, so ない and なかっ are visibly one thing.
Descriptions are folded away by default, which is what makes the section shorter
than the list it replaces despite saying more.

The section is absent entirely for a word with no endings and no inflection of
its own, exactly as before: a one-row ladder explains nothing.

### The analyzer's inflection form is now exposed

The evidence for point 3 was already being computed and thrown away. Lindera's
IPADIC output carries 活用形 for every token, and `RawToken` already held it
under the name `conjugationType` — populated by the wrapper and read by nothing.

The library names its two fields the other way round from their content: what it
calls `conjugationType` is 活用形 (the inflected shape, 未然形), and what it calls
`conjugationForm` is 活用型 (the paradigm, 五段・ラ行). Both are now read under
accurate names and mapped onto a bounded `InflectionForm` enum in
`ipadic-inflection.ts`, under the same contract `ipadic-mapping.ts` keeps for
part of speech: raw IPADIC tags never leave infrastructure.

`ANALYZER_VERSION` is bumped to `analyzer/2` because token output changed.

### Derivation is generic; curation is limited to naming

The ladder is built from the analysis, not from a rule table. Endings are the
tokens the analyzer already tagged as auxiliary, suffix, or counter; the order
they stack in is the order they appear; the running form of a step is the
surfaces before it plus that ending standing alone. Nothing is guessed and
nothing costs a request.

Curation enters in two bounded places, both naming rather than analysis:

- The shipped structural baseline says what each ending does. Its entries are
  written as `ない (negation)`, so the ladder takes the two halves rather than
  duplicating them in a second table that could drift.
- `ending-combinations.ts` lists runs the analyzer splits finer than they are
  ever taught. IPADIC analyses ませんでした as ます + ん + です + た, and walking
  those in order offers 行きませんです as a step along the way — a form nobody
  writes. Two entries (ません, ませんでした) collapse those runs into the ending a
  learner is actually taught. A run matching nothing still gets its generic
  ladder.

This is the same split ADR 0015 settled for the baseline itself: derive what can
be derived, curate only where curation earns its place.

## Consequences

The ladder is total over what the analyzer segments, so it covers regular verb,
i-adjective, copula, and helper-verb inflection — negative, past, polite,
causative, passive, desiderative, te-form, progressive, volitional, conditional,
and imperative — without a rule per form. What it cannot do follows from the
analysis under it:

- **Lexicalized potentials.** IPADIC lists 書ける, 読める and 泳げる as their own
  dictionary entries rather than potentials of 書く, 読む and 泳ぐ. The ladder
  shows one word and no step, which is honest about what is known rather than
  inventing a derivation the analysis does not support.
- **な-adjective negatives.** 静かじゃなかった is analyzed as 静か / じゃ
  (particle) / なかっ / た, and word grouping starts a new word at じゃ, so the
  ladder covers じゃなかった rather than the phrase. This is pre-existing grouping
  behaviour and is not addressed here.
- **Analyzer errors propagate.** A mis-segmented word yields a wrong ladder. The
  golden corpus, which runs against the tokenizer and baseline that actually
  ship, is the guard.
- **Analyses stored before this** carry `analyzer/1` and no inflection form, so
  they lose only the stem-only steps until the text is imported again. Every
  other step still reads correctly, because the rest was already in the data.
