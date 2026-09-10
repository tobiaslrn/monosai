# 0065 — AnkiDroid first review uses the supported search language

Date: 2026-09-10
Status: Accepted

## Context

The AnkiDroid public ContentProvider exposes card scheduling columns but not the
review log. Android vocabulary therefore had no `firstReviewedAt`, even though
the vocabulary browser and Recently learned selection both use the first real
answer as their strongest evidence. A card id is only its creation time and is
wrong for premade decks; repetitions, interval and last review cannot recover
the first answer. Opening AnkiDroid's private collection or exploiting its raw
selection string would couple Monosai to private storage and weaken its read-only
boundary.

AnkiDroid's cards query delegates the public Anki search language to the backend.
`introduced:N` is implemented as the earliest review-log id whose ease is not
zero, compared with the collection's own study-day cutoff. It therefore ignores
manual reschedules and answers the same historical question as Monosai's exact
desktop/package query, at study-day rather than millisecond precision.

## Decision

The Android adapter resolves the smallest matching `introduced:N` for every
eligible card with a parallel binary search. Predicates with the same threshold
share a `cid:` clause, clauses share one `findCards` request up to an 8,000
character safety limit, and every returned id is intersected with the request.
The card creation timestamp bounds the search, with two days for rollover and
clock skew. A final matching query validates the bound so missing history never
becomes a fabricated date.

The result is represented by local day-start on the corresponding calendar date
and stored with `firstReviewedPrecision: 'anki-day'`. It therefore never appears
to be in the future on the current day, and vocabulary date filters compare these
values by calendar-day boundaries. An absent precision marker remains a legacy
exact timestamp. When duplicate evidence is merged, the earliest review wins and
its precision follows it; equal timestamps prefer exact evidence.

The existing `findCards` action is sufficient. No bridge protocol action, native
permission, collection copy or write is added. A refused or unsupported
`introduced:` search yields one warning and preserves the vocabulary using the
existing interval fallback. Cancellation still stops the refresh.

## Consequences

Android automatic and manual refreshes can display and weight a first-studied
date without a bridge APK update. The number of search rounds is logarithmic in
card age, while large collections may require several bounded requests per round.

The displayed date is an Anki study-day observation, not a time of day. Around a
learner's configured rollover it can differ from the civil date of the exact
answer. The precision marker prevents later code from silently treating it as an
instant and leaves room for an exact AnkiDroid API if one is published.

Schema version 15 adds only that optional precision marker. Existing rows already
have the correct meaning when it is absent, so they are preserved without a row
rewrite or index change.
