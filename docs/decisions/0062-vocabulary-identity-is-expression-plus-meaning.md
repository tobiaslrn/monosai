# 0062 — Vocabulary identity is expression plus meaning

Date: 2026-09-09
Status: Accepted

## Context

An Anki collection can contain two cards with the same Japanese expression and
different meanings. The vocabulary snapshot previously keyed those cards only
by the canonical expression, so one card silently erased the distinction
provided by the learner's notes. The browser also needs to show that meaning.

## Decision

When an Anki meaning field is mapped, vocabulary item identity is the pair of
the expression hash and the visible meaning after markup extraction, trimming,
whitespace collapsing, and case folding. An unmapped meaning has an empty
identity key. Exact pairs still merge across sources; different meanings stay
as different items. Provenance remains attached to the item created by its
pair.

The expression projection remains deliberately broader than item identity:

- The vocabulary matcher still buckets all item ids for a normalized
  expression, so either meaning can prove that an expression is known.
- Practice selection and story generation still use one
  `VocabularyExpression` per canonical expression. That projection carries
  the distinct meanings behind it.
- `uniqueEntryCount` and `SnapshotStats.uniqueExpressions` continue to count
  distinct expression hashes. They are the learner-facing count of words;
  the browser may show more item rows when one expression has several
  meanings.

## Consequences

Meaning is optional for backward compatibility and for sources without a
mapping. Existing Anki rows remain valid, and refreshes without a meaning
field retain the previous expression-only identity behaviour. The repository
schema gains the optional fields in version 14 without an upgrade function:
there is no index change, and absence on an existing row already means that no
meaning was mapped.

The matcher does not need a new meaning-aware rule, because knowing an
expression is still the domain question used by reading classification. The
browser and provenance can distinguish the learner's entries without changing
practice or generation semantics.
