# 0061 — Anki word selection weights a ladder of scheduling evidence

Date: 2026-09-09
Status: Accepted. The Recently learned weighting is superseded by
[ADR 0067](0067-recently-learned-is-a-focus-list.md); Difficult is unchanged.

## Context

The "Anki word selection" setting offers Uniform, Recently learned, and
Difficult. It weights the hidden suggestion palette — the 40 to 180 word sample
sent to the model as inspiration, distinct from the full snapshot that remains
the allowlist. Neither non-uniform mode did what it said.

**Recently learned scored `1000 + 3000/√reps`.** Measured against a real
collection of 611 eligible cards, the average weight by the month a word was
first reviewed was 2174, 2128, 2079 and 2264 across eleven months — the oldest
cohort outscoring a cohort seven months younger. Review count is not a proxy for
recency under modern scheduling: a settled word accrues few repetitions across
years of long intervals, while a word still being learned accrues many in a
week. The mode was measuring difficulty, badly, and calling it recency.

**Difficult scored `0.75 × lapses/reps + 0.25 × ease penalty`.** It ordered
words correctly but spanned 1000 to 1607 out of a possible 4000 — a 1.6-fold
tilt across 611 words, which shifts the expected palette by a fraction of a
word. Its evidence was also half absent: 271 of 611 cards had no lapses, zeroing
the dominant term, and 268 sat at exactly the default ease, because FSRS does
not maintain `factor` and it freezes at whatever SM-2 last wrote.

Both modes were, in effect, Uniform with extra steps.

## Decision

Each mode reduces its evidence to a score from 0 to 1; one shared curve maps
that onto a weight between the baseline and sixteen times it. All shaping lives
in the score, next to the evidence that justifies it.

**Recently learned** prefers the first review — `min(revlog.id)` over entries
with a non-zero ease — decaying by half every 120 days. Where no review log
exists it falls back to the card's interval, log-scaled to a 180-day ceiling. It
never falls back to the review count.

**Difficult** prefers FSRS difficulty, mapped across its 1-to-10 scale. Where
the collection has none it falls back to the previous lapse-and-ease estimate,
centred on neutral with half the swing.

A word about which a mode has no evidence scores exactly the midpoint.

## Consequences

**A mode with no evidence degrades to Uniform, not to noise.** When every
candidate scores the midpoint, every weight is equal, and sampling without
replacement over equal weights is a uniform sample. That is what a snapshot
taken before these signals existed does, and it is a property tests assert
rather than an accident.

**The coarse difficulty estimate is confined to a band around neutral.** It
cannot distinguish "easy" from "unknown": zero lapses and a default ease produce
the same zero either way. Given the full range, such a word would rank _below_
one carrying no signals at all — less information outranking more. Halving its
swing keeps it monotone and useful while making that inversion impossible. The
interval fallback for recency is deliberately not compressed the same way: its
log-with-ceiling shape already encodes its coarseness, and unlike the SM-2 blend
it is monotone in real signal.

**Half-life, not age against a maximum.** Any maximum age is either arbitrary or
drawn from the collection, and a collection-derived one would let a single
ancient card rescale every other word. Decay is local to each word and stable as
the snapshot changes.

**Sixteen-fold, not larger.** On the measured collection this yields roughly a
4.5-fold realised tilt for recency and 5.4-fold for difficulty — unmistakable,
where 1.09-fold was invisible. A floor-weight word stays rare but reachable,
which matters because the palette is only inspiration: the complete snapshot
remains the allowlist and the local validation authority, so a thin tail costs
variety between runs, never correctness. Making the modes near-deterministic
would buy obviousness at the price of two stories from one snapshot reading
alike.

**What each source can prove differs, and the ladder is how that is expressed.**
A package and the desktop add-on produce an exact first-review instant. AnkiDroid
does not expose the review log, but its supported `introduced:N` search proves
the first-review study day ([ADR 0065](0065-ankidroid-first-review-study-day.md)).
FSRS difficulty comes exactly from a package or the Android bridge, and to the
whole percent from desktop search ([ADR 0066](0066-desktop-fsrs-difficulty-by-search.md)).
Rather than gate the feature on the
weakest source, each mode uses the best evidence available and says so in one
place.

**Existing snapshots carry none of this until refreshed.** They score neutrally
and behave as Uniform, so nothing is misordered, but the setting also does
nothing until the learner re-syncs their Anki source.
