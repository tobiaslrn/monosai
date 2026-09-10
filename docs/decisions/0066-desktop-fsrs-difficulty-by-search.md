# 0066 — Desktop FSRS difficulty uses the supported search language

Date: 2026-09-10
Status: Accepted

## Context

The vocabulary browser shows, filters and sorts by FSRS difficulty, and the
Difficult selection mode weights by it ([ADR 0061](0061-anki-word-selection-signal-ladder.md)).
Packages carry it in `cards.data`, and the Android bridge reads AnkiDroid's
`fsrs_difficulty` column. The desktop AnkiConnect add-on does not: its
`cardsInfo` has no memory state, and no read action exposes it. Desktop
connections therefore never had a difficulty, however the collection was
scheduled.

Anki's search language compares difficulty through `prop:d`, on the same 0-1
scale, `(D - 1) / 9`, that the browser shows as a percent. A card without FSRS
memory state matches no `prop:d` term at all.

## Decision

The desktop adapter resolves each eligible card's difficulty to the whole
percent with a parallel binary search over `prop:d>=X` on the existing
read-only `findCards` action. Each threshold sits half a percent below its
percent, so the result is the percent the browser would show for the exact
value. Cards sharing a threshold share one `cid:` clause, and clauses share
requests under the 8,000 character limit, using the same packing as
[ADR 0065](0065-ankidroid-first-review-study-day.md). A final matching query
confirms the bound, so an SM-2 card stays without difficulty rather than
reading as 0%. The recovered percent is stored on Anki's 1-10 scale.

Only cards whose `cardsInfo` carried no difficulty are searched, and only for
the desktop adapter; the bridge already reports the exact value. A refused
`prop:d` search, as from an Anki too old for FSRS search, leaves difficulty
unsupported without a warning, because the learner has nothing to act on and
the vocabulary is unaffected. Cancellation still stops the refresh.

## Consequences

Desktop refreshes show difficulty, and the Difficult mode can use it, without
any new allowed action or add-on change. A refresh costs about eight extra
search rounds per mapping, usually one request each.

Desktop difficulty is exact to the displayed percent, not to the raw value.
Nothing in Monosai distinguishes finer than a percent, so this changes no
filter, sort or selection outcome beyond sub-percent ties.
