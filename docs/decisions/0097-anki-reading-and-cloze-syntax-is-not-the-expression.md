# 0097 — Anki reading and cloze syntax is not part of the expression

Date: 2026-11-21
Status: Accepted. Narrows the literal reading of an expression field. Field markup still becomes
text on the main thread, as [ADR 0016](0016-anki-package-parsing.md) describes.

## Context

An expression field is read literally. The markup is parsed inertly, the visible text is kept, the
line endings are normalized and the outside is trimmed. Nothing else changes, because the learner
chose the field and Monosai does not decide which part of it is the word.

Three common ways of writing a Japanese card put text in that field that the learner never reads as
part of the word:

- **HTML ruby.** `<ruby>食<rt>た</rt></ruby>べる` is what Anki's `furigana:` filter renders and
  what many shared decks store. The reading in `rt`, and the fallback parentheses in `rp`, were
  read as visible text, so the expression became `食たべる`.
- **Anki's bracket readings.** `食[た]べる` and `私[わたし]の 名前[なまえ]` are Anki's own syntax.
  On a card the reading sits above the text before it, and the space marks only where a reading
  starts. Read literally, the expression kept the brackets.
- **Cloze deletions.** `{{c1::漢字::hint}}` shows the learner `漢字` once it is revealed. Read
  literally, the expression kept the braces and the hint.

None of these forms can ever match a word in a reading. The vocabulary matcher compares the
expression's tokens with the reading's tokens, and a mapping names only an expression field and a
meaning field. No separate reading field depends on the brackets being kept. Leaving the syntax in
did not keep the learner's choice. It made a reviewed word silently count for nothing.

## Decision

**An expression keeps only the text the word is made of.**

- `rt` and `rp` contribute no visible text, the same as media elements. This applies wherever field
  markup becomes text, so the samples shown while mapping lose the ruby reading too.
- `extractExpression` reads the visible text, then unwraps each cloze to its answer, innermost
  first, and drops its hint. It then removes bracket readings with the pattern Anki's `kanji:`
  filter uses, ` ?([^ >]+?)\[(.+?)\]`, keeping a `[sound:…]` tag as Anki does. Like that filter,
  which first turns every `&nbsp;` into a space, it reads a non-breaking space as a plain one, so a
  reading after `&nbsp;` is dropped with its separator. A value that becomes empty is rejected as
  `empty`.
- Meanings are still read with `extractVisibleText` and keep their brackets, because English
  glosses use brackets for their own notes. A pasted text list is still read without any markup
  handling.

The canonical form is still NFKC of the extracted text. Removing this syntax belongs to
extraction, because it was never part of the expression. Canonicalization still does not change
lexical content.

`NORMALIZATION_VERSION` becomes `normalization/2`, so a snapshot records which extraction built it.

## Consequences

- No stored record changes shape. Every source cache stores raw field values, and every prepared
  snapshot, whether from a refresh, a package import, a text list or a change of sources, extracts
  every cache again. The next of these replaces the old expressions, and no migration or re-import
  is needed.
- An entry that was stored with the syntax in it gets a new canonical expression, so a manual
  practice choice made for that entry is reported as no longer in the vocabulary. Such an entry
  could never match a word, so nothing it proved is lost.
- A value whose text really contains `x[y]` outside Anki's reading syntax now loses the bracket.
  Anki shows such a value as written unless the card uses its `kanji:` or `furigana:` filter. An
  expression field rarely holds one, and a lost bracket costs less than a word that can never
  match.
