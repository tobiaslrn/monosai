# 0093 — Words and Grammar are two pages

Date: 2026-11-15
Status: Accepted. Supersedes the single page of
[0049](0049-one-page-for-what-you-can-read.md); amends the routes and composition of
[0063](0063-what-you-can-read-is-composed-like-the-library.md).

## Context

[ADR 0049](0049-one-page-for-what-you-can-read.md) put vocabulary and grammar on one page,
named after what they decide together: **What you can read**. The page held two unrelated
groups. The words half is a list of sources that grows with each one added; the grammar half
is one reading level and a fold of always-known forms. A learner looking for either had to
know that a page named after an outcome held it, and the name had to be explained wherever
it appeared. Renaming it **Words and grammar** made the name honest, but it still described
two pages under one title.

## Decision

### Two routes, each named after what it holds

- `/words`, titled **Words**: the vocabulary card, the word sources with **Add source**,
  each source's page at `/words/source/:sourceId`, and the word list at `/words/vocabulary`.
  It owns the refresh, import and Anki connection stores, and takes a shared package.
- `/grammar`, titled **Grammar**: the reading level with its example, and the always-known
  forms fold. The ladder is `/grammar/level`, still a draft until **Save level**.

Each goes back to where it was reached from: the story form, Settings, or the Library.

### Each way in leads to the page it names

- The Library standing line leads to **Words**: the count it leads with is the fact a
  learner acts on, and a sentence can only be one link.
- Settings, under **Reading**, has a **Words** row and a **Grammar** row, each with its value.
- The story form's **Vocabulary** and **Grammar** rows lead to their own pages.
- Help paths read "[Words]" and "[Settings > Grammar]".

### Old links still land

`/reading-level` sends `#grammar` and `#forms` to `/grammar` (keeping `#forms`) and anything
else to `/words`, with its query parameters. `/vocabulary` goes to `/words`, and the old
sub-routes go to their new ones. The service worker now hands a shared file to `/words`;
an older worker's hand-off to `/reading-level` is redirected the same way.

## Consequences

- The Words page writes no styles of its own. The Grammar page and the ladder stay at their
  old paths in `features/reading-level/`, because the composition allowlist is keyed by path
  and may only shrink.
- Grammar has no way in from the Library. Settings and the story form both lead there, and
  it is set rarely.
- The two facts are no longer seen side by side outside the Library line and Settings.
