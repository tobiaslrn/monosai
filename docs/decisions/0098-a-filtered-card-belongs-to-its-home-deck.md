# 0098 — A filtered card belongs to its home deck

Date: 2026-11-21
Status: Accepted. Adds one read action to the AnkiConnect allowlist. The bridge's wire contract
does not change.

## Context

A filtered deck moves cards for a while without changing where they belong. A mapping names a deck,
so a card counts by its home deck, wherever it sits today.

Anki's `deck:X` matches a card when either the deck it sits in or its home deck is X or one of X's
subdecks. A filtered deck the learner builds inside X, such as `X::Cram`, is one of X's subdecks by
name. Two things went wrong with filtered decks like that:

- A `deck-only` mapping searched `deck:X -deck:X::*`. The subtraction also matched the deck the card
  sits in, so it dropped X's own cards while they were in `X::Cram`, on both endpoints.
- The desktop add-on's `cardsInfo` names only the deck a card sits in. A `deck-and-subdecks` mapping
  read `X::Cram` as one of its subdecks and kept every card in it, including cards whose home is
  another deck entirely.

No search by name can tell these cards apart, because every name search also matches the deck a card
sits in. Anki's `did:` search matches the deck a card sits in or its home deck, by id and without
subdecks. Asked with the ids of the mapping's own decks, less the filtered decks the cards sit in, it
can only match a card through its home deck.

## Decision

**A card belongs to a mapping by its home deck, and the desktop adapter asks Anki for that home by
id.**

- The `deck-only` search keeps every filtered card under the deck:
  `deck:X note:N (-deck:X::* OR deck:filtered)`. Which of those belong is decided by home deck.
- The bridge names a filtered card's home deck as `originalDeckName`, so it needs nothing more.
- On the desktop add-on, a reviewed card reported outside the mapped deck itself is checked with
  `deck:filtered`, once per mapping. For each one sitting in a filtered deck, `did:` is asked with the
  ids of the mapping's decks less the decks those cards sit in, restricted to those cards by `cid:`.
- The ids come from `deckNamesAndIds`, which only reads and is now on the allowlist. It is asked once
  per mapping, and only when a card sits in a filtered deck. The bridge does not implement it, and the
  shared fixtures record that refusal as they do for `getReviewsOfCards`.

## Consequences

- A `deck-only` mapping keeps its own cards while the learner studies them from a filtered deck built
  inside it, and a `deck-and-subdecks` mapping keeps only the cards whose home is in its tree.
- The `deck-only` search can now return cards that sit in a filtered deck but belong elsewhere. They
  are read and then dropped, and the recent-practice searches share the same scope, so they reach no
  vocabulary.
- A desktop mapping with subdecks or filtered cards pays one `deck:filtered` search per refresh, and
  one `deckNamesAndIds` request and one `did:` search per batch only when a card sits in a filtered
  deck.
- The allowlist has ten actions. None of them writes.
