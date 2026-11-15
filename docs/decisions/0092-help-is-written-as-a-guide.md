# 0092 — Help is written as a guide

Date: 2026-11-14
Status: Accepted. Amends [0079](0079-help-is-a-hub-of-topics.md) (the topics and the error
codes topic) and [0091](0091-the-interface-is-minimal-by-default.md) (Help no longer opens on
its topic shelf), and narrows 0091's copy rules to interface strings.

## Context

The copy rules in [0091](0091-the-interface-is-minimal-by-default.md) were written for strings
a learner scans: a button, a row, an error. Help followed them too, and read like a telegram.
"Orange wavy underline: a word not in your lists." "Choosing tests it." "No account or key."
The bans on "you can" and "will" pushed sentences into odd shapes ("Settings, under Storage,
can ask the browser to keep it"), headings came in four grammatical forms, and controls were
named in running text with nothing to set them apart. Professional help, from Apple's user
guides to the Google and Microsoft style guides, does the opposite: whole sentences addressed
to the reader, contractions, task titles, controls in bold, menu paths with ">".

A review of the guide as a first-time learner would read it also found gaps and drift:

- No page explained OpenRouter from scratch, the reading levels, or the story options on
  Write with AI. iPhone was mentioned once, inside the paragraph about package files.
- Several claims had stopped being true: live Anki sources refresh themselves, new stories
  are translated and annotated by default, audio is generated from the player rather than
  Story options, and the voice test is **Play sample**, not Preview.
- The error codes topic was organised by code, but a failure screen shows a heading and an
  action, not a code (0091). A learner who read "Out of OpenRouter credit" could not find it.

## Decision

- **Help has its own writing guide**, [`docs/design/help-writing.md`](../design/help-writing.md),
  and R55 points to it. The owner asked for this change to the rules, as R5 requires. Help is written in whole sentences addressed to "you", with
  contractions, a short lead on every topic, task or noun-phrase titles, controls in bold
  exactly as the screen spells them, paths with ">", one term per idea, and numbered steps.
  R48 to R54 and their budgets govern interface strings only, unchanged; the form rules of
  R54 apply to Help too.
- **The guide has eleven topics**, in the order a first-time learner needs them: Get started,
  Add your words, Reading level, Write a story, Read a story, Choose a text model,
  Set up audio, Install and use offline, Privacy and your data, Common questions, and Fix a
  problem. Privacy gets a topic of its own because "is my key safe?" is not an installation
  question.
- **Fix a problem is looked up by what the screen says.** Each entry is the heading the
  failure shows, its cause and what to do, with the code beside it for a bug report. The
  headings are read from the same tables the failure screens use (`ai-error-copy.ts`,
  `anki-error-copy.ts`), so the two cannot drift apart. Failure screens stay a title and one
  action, as 0091 says; the codes still reach a report through Copy diagnostics. A model
  test that fails in Settings shows the same shared heading after "Test failed", rather than
  the provider's own wording, so it can be looked up too.
- **The hub opens with a short lead**: what Monosai does and where a newcomer starts, in one
  or two sentences, with the topic shelf straight below. Someone who opens Help for the first
  time wants to know what Monosai is before choosing a topic, and on a phone the shelf stays
  in view. Who Monosai is for moves to Common questions.
- **A fact lives on one page.** Common questions answers in a sentence or two and links to
  the topic; it no longer keeps its own list of error codes.
- **Retired addresses redirect**: `/help/first-steps` to `/help/get-started` and
  `/help/error-codes` to `/help/troubleshooting`.

## Consequences

- Help is longer, and each page is still meant to be read in about three minutes; a page
  that grows past that splits.
- A change to a screen's labels or behaviour is a change to Help in the same commit. The
  guide's checklist and the specs that compare failure headings with the copy tables make
  that drift visible.
- The interface stays minimal: nothing on a failure screen, a row or a dialog grows.
