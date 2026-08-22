# 0029 — Ambiguous kana dictionary lookup uses morphological ranking

Date: 2026-08-22
Status: Accepted

## Context

The analyzer correctly reads `いなかった` as the negative past of the ichidan
verb `いる`, but the compact dictionary indexed written forms and readings in
JMdict ID order. Every `いる` homophone passed the coarse `verb` check, and the
four-result bound removed `居る` before the UI received it.

English translations cannot safely repair this: they are optional, generated,
may paraphrase the verb, and are not authoritative analysis.

## Decision

Keep lookup local and deterministic. Map IPADIC and JMdict verb classes to the
shared bounded families `ichidan`, `godan`, and `irregular`. Preserve JMdict's
usually-written-in-kana marker as a compact boolean on each applicable sense.

Within the existing surface, lemma, reading, and POS lookup order, prefer a
compatible verb family and then a usually-kana sense for kana queries. Apply the
result limit only after ranking, preserve asset order for ties, and fall back to
POS-only candidates when finer metadata is absent or disagrees.

The token and worker request shapes change, so the analyzer and language
protocol versions advance to 3. The pre-release asset schema is edited in place.

## Consequences

`いなかった` ranks `居る` before `射る` and excludes godan homophones such as
`炒る`, `入る`, and `要る`. Other ambiguous inflected kana verbs benefit from
the same source-backed signals without increasing dictionary size materially or
introducing AI/network dependence.
