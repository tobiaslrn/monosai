# Grammar catalog content defects

Tracked separately from the implementation status because these are content
defects in the shipped dataset (`data/language/grammar-catalog.source.json`),
not application behavior. They never blocked Milestone 3 — the reader does not
read rule content, only Milestone 4's grammar profile and later prompt/review
features will — so they were left unfixed rather than edited without the
Japanese-language review a content change deserves. This is a report, not a
fix.

## Confirmed: ungrammatical example sentences

**`mn-n2-you-de-wa`** (`〜ようでは`, "if things are like this")

- `exampleJa`: `こんな成績ようでは困る。`
- Problem: `成績ようでは` omits the attributive connector the pattern needs
  between a noun and `ようでは` (either `な` or `の`). As written it reads as
  ungrammatical, not merely informal.
- A grammatical example would be closer to `こんな成績ではこの先困る。` or
  `こんな成績のようでは困る。`.

**`mn-n1-ni-shite-hajimete`** (`〜にして初めて`, "only when")

- `exampleJa`: `経験してにして初めて分かる。`
- Problem: `経験して` (te-form of `経験する`) is immediately followed by
  `にして初めて` again, duplicating the connective. The verb-based and
  noun-based attachment points for this pattern were both written into one
  sentence.
- A grammatical example would be `経験して初めて分かる。` (te-form + `初めて`,
  dropping the noun-attaching `にして`) or `その経験にして初めて分かる。`
  (noun + `にして初めて`, dropping the verb te-form).

## Confirmed: pattern field disagrees with the English name

**`mn-n2-dogeza`**

- `pattern`: `〜ぬきに`
- `nameEn`: `〜を抜きにして (setting aside)`
- The `pattern` field and the Japanese quoted inside `nameEn` are different
  strings for the same rule. `を抜きにして` (setting aside) is also unrelated in
  meaning to what the id slug "dogeza" (土下座, a prostration bow) would
  suggest — the id, the pattern field, and the name disagree with each other in
  three different ways on this one rule.

**`mn-n1-mo-nannmo`**

- `pattern`: `〜もなんともない`
- `nameEn`: `〜もなにもない (nothing of the sort)`
- Same defect shape: `なんとも` in the pattern field versus `なにも` in the name.
  These are both real, distinct Japanese expressions, so this is not a
  transliteration inconsistency — one field or the other names the wrong
  expression.

## Previously documented: id slugs naming a different rule

[0008](decisions/0008-grammar-profile-presets.md)'s Consequences section
already recorded that **approximately 24 catalog ids do not correspond to
their pattern**, naming four explicitly: `mn-n3-kke-nai` is `〜わけがない`,
`mn-n3-mono-no` is `〜つつ`, `mn-n2-dogeza` is `〜を抜きにして` (also captured
above under its own defect), and `mn-n1-izure` is `〜いかんによらず`.

An attempt to extend this list mechanically — romanizing each rule's kana
pattern and comparing it against its id's slug — was tried while investigating
this milestone's open items and abandoned: kanji in a pattern (which the
romanizer cannot read, e.g. `一番`, `一緒に`) produces false positives at a rate
that makes the output unreliable without a fluent reviewer checking every
candidate by hand. Distinguishing the real slug/pattern mismatches from
romanization artifacts needs the same manual pass 0008 already used to find
the four named above, which is why `docs/IMPLEMENTATION_STATUS.md` records — for
both the Milestone 2 dictionary/catalog content and here — that **a full
manual language review of the catalog is a release gate, not a milestone
gate**.

## Disposition

Left open, to be resolved as part of that release-gate language review rather
than patched individually here. Fixing `mn-n2-you-de-wa` and
`mn-n1-ni-shite-hajimete`'s example sentences, and reconciling
`mn-n2-dogeza`/`mn-n1-mo-nannmo`'s pattern and name fields, are small,
well-scoped edits once a reviewer is available; the id-audit for the
remaining ~22 unconfirmed cases in the "approximately 24" figure is the part
that needs the full pass.
