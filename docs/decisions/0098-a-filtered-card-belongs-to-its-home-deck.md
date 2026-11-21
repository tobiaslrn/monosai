# 0098 — A filtered card belongs to its home deck

Date: 2026-11-21
Status: Accepted. Adds one read action, sent only to the desktop add-on, to the AnkiConnect
allowlist. The bridge's wire contract under `protocol/` does not change.

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
sits in. Only `did:` can, and what it matches depends on the Anki release:

| Anki          | `did:` takes | matches                                                 |
| ------------- | ------------ | ------------------------------------------------------- |
| 2.1.41–2.1.66 | one deck id  | the deck a card sits in                                 |
| 23.10–24.06   | a list       | the deck a card sits in                                 |
| 24.11 on      | a list       | the deck a card sits in, or a filtered card's home deck |

From 24.11, asked with the ids of the mapping's own decks less the filtered decks the cards sit in, it
can only match a card through its home deck. Before that it cannot see home decks at all, and Anki
before 23.10 rejects a list outright. AnkiConnect reports only its request-format version, which says
nothing about the Anki release behind it. No minimum Anki release is documented, and AnkiConnect
still serves the 2.1 line.

## Decision

**A card belongs to a mapping by its home deck. The desktop adapter asks Anki whether `did:` sees
home decks, and decides by id where it does and by name where it does not.**

- The `deck-only` search keeps every filtered card under the deck:
  `deck:X note:N (-deck:X::* OR deck:filtered)`. Which of those belong is decided by home deck.
- The bridge names a filtered card's home deck as `originalDeckName`, so it needs nothing more.
- On the desktop add-on, a reviewed card reported outside the mapped deck itself is checked with
  `deck:filtered`, once per mapping.
- For the first card sitting in a filtered deck, Anki is asked once per mapping whether
  `cid:C deck:filtered did:…` with the id of every deck except the one the card sits in matches it.
  Only a `did:` that sees home decks can.
- Where it does, each filtered card is asked with `did:` over the ids of the mapping's decks less the
  decks those cards sit in, restricted to those cards by `cid:`.
- Where it does not, or Anki cannot run the search, the cards are decided by name as before this
  decision: a `deck-only` mapping keeps the filtered cards under `deck:X -deck:X::*`, a
  `deck-and-subdecks` mapping every filtered card under `deck:X`. A cancelled refresh or an Anki that
  went away still ends the read.
- The ids come from `deckNamesAndIds`, which only reads and is on the allowlist. It is asked once per
  mapping, and only when a card sits in a filtered deck. Only the desktop add-on is asked, so it is
  not part of the bridge contract under `protocol/`: adding it there would change what the published
  bridge is checked against without a bridge release. The bridge answers it as an unknown action, and
  the web tests treat it as desktop-only.

## Consequences

- From Anki 24.11, and on the bridge, a `deck-only` mapping keeps its own cards while the learner
  studies them from a filtered deck built inside it, and a `deck-and-subdecks` mapping keeps only the
  cards whose home is in its tree.
- On older Anki, a card in a filtered deck outside the mapped tree is still decided exactly. One in a
  filtered deck inside the tree is not: a `deck-only` mapping leaves its own such cards out, and a
  `deck-and-subdecks` mapping keeps every card sitting there, whatever its home.
- The `deck-only` search can now return cards that sit in a filtered deck but belong elsewhere. They
  are read and then dropped, and the recent-practice searches share the same scope, so they reach no
  vocabulary.
- A desktop mapping with subdecks or filtered cards pays one `deck:filtered` search per refresh. Only
  when a card sits in a filtered deck does it also pay one `deckNamesAndIds` request and one probe
  per refresh, then one `did:` search per batch, or one name search per refresh on older Anki.
- The allowlist has ten actions. None of them writes.
