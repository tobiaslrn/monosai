# 0067 — Recently learned sends the newest words as an ordered focus list

Date: 2026-09-10
Status: Accepted. Supersedes the Recently learned half of
[ADR 0061](0061-anki-word-selection-signal-ladder.md).

## Context

ADR 0061 made Recently learned weight the hidden suggestion palette by the
first review, halving every 120 days. On a collection several hundred words
large the words from the last week still shared the palette with a long tail of
older ones. The model received no signal saying which words were new, so the
learner could not tell stories written with this mode from Uniform ones.

## Decision

Recently learned chooses the N expressions with the latest first review, where
N is a setting of 25, 50 or 100 (default 50). A same-day tie, which is normal
for AnkiDroid's study-day precision (ADR 0065), is broken by the latest answer
and then by the expression, so the order is stable.

The prompt carries them as `recentFocusVocabulary`, newest first, each with a
coarse age: today, yesterday, days up to six, weeks up to eight, then months.
The story policy asks the model to strongly prefer the top of the list, with
priority falling towards the bottom, and to work the words in without listing
or explaining them. The story, blueprint, segment and repair prompts share one
inventory and therefore one focus; `story` and `repair` moved to version 4.

The palette remains, drawn uniformly from the words outside the focus, so
stories still vary and no expression appears in two arrays. The whole snapshot
remains the allowlist and the validation authority.

A word without a first-review date is never in the focus. Nothing is guessed
from the interval, because a lapsed old word has a short interval too.

Provenance records the focus words with their ages and the chosen size.

## Consequences

**The mode is visible.** The newest words are named to the model directly
rather than nudged by a weight it never sees.

**A snapshot without first reviews has no focus.** Generation proceeds as
Uniform, and provenance records an empty focus, so the reason is traceable.
Re-syncing the Anki source fixes it.

**Coverage is preferred, not enforced.** Nothing checks that focus words appear
in the story; that would be a separate validation.

**A break in study keeps old words on the list.** Ordering by first review
means a learner returning after months sees words from before the break until
new cards push them down. A re-entry date could later filter them.

**The age labels change at most once a day,** so repeated generations on one
day send the same focus block.
