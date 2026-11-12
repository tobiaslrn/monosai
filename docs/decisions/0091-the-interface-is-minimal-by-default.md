# 0091 — The interface is minimal by default

Date: 2026-11-12
Status: Accepted. Supersedes the copy parts of [0051](0051-non-reader-utilities-and-first-use-help.md)
and [0079](0079-help-is-a-hub-of-topics.md): the first-run subline, the privacy foot, the
setup-free way round as a required element, and the hub's lead sentence.

## Context

The interface explained everything: a subline under every headline, a reassurance under every
action, three sentences on every failure. Learners read the explanations once and then had to
read past them every time.

## Decision

- Every string must earn its place: if nothing changes for the learner when it is gone, it goes
  (R48). One extra sentence is kept only for real risk (R51).
- The first run keeps its headline and the first-steps card, with no subline, no privacy
  foot and no foot band at all. Pasting text is a plain secondary action. Help opens on its topic shelf.
- Errors are a title and one action. Length budgets and form rules are R50 to R55 in
  `docs/design/rules.md`; spelling is British.

## Consequences

- The earlier records stay as history; where they describe a subline, a privacy foot or a
  hub lead sentence as required, this record wins.
- Tests assert the shorter text.
