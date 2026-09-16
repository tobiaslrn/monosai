# 0077 — The first-run screen, the Help offer's home, and one mark for cost

Date: 2026-09-16
Status: Accepted; amends ADR 0051 and ADR 0050

## Context

A first run was reviewed end to end against a fresh database and the production
build. It presented three competing entry points under five names for two
underlying actions, and the most prominent of them — a full-width **Create a new
story** — could not succeed for anybody on a first run. Nothing on the screen
distinguished the half of Monosai that works immediately and for nothing from
the half that needs an account, a key, and money.

Three defects sat on top of that. The first-use Help banner rendered as two
buttons and no sentence — "Got it" about nothing — because its explanatory
paragraph had been dropped while its stylesheet rule stayed; it also sat above
the shell's outlet, pushing every page's top bar off the viewport edge, and
reappeared on every non-reader route until dismissed. The welcome's illustration
was positioned across the hero, and at 393 px it covered the sentence beside it.
Generate computed everything a checklist needs and used it only to disable a
button, so a learner filled in a story form and then found it dead.

## Decision

**The welcome owns the first screen whole.** While the Library holds nothing,
the standing line and the shelf's New story action are not rendered: a line that
states a count has none to state, and a page's primary action is withheld while
it cannot succeed. The welcome offers exactly two doors — **Paste Japanese
text** ("Works now. No account.") and **Write with AI** ("Needs an OpenRouter
key.") — each naming its cost in four words. Adding words is a step behind the
second door, not a third door. The illustration shares a row with the words
rather than being laid over them, at every width.

**Two names for two actions, everywhere.** *Paste Japanese text* and *Write with
AI* are used on the welcome, in the New story popover, as the Generate screen's
title, and in the guide. This retires "Add text", "Bring your own text", "Paste
text", and "Generate a story".

**One mark for spending a key.** The `generate` sparkle marks a control, or a
group whose every member qualifies, that spends OpenRouter credit, and marks
nothing else. The design system holds the rule and the closed list of places it
appears.

**Setup is a path, not a warning.** Until its word list and text model are
ready, `/generate` shows **Set up AI stories** — every prerequisite as a row
with its live state, the always-satisfied reading level shown as done, and each
row leading to the screen that settles it — in place of the story form. Being
offline is not setup: it never hides the form, so a draft can still be written
while the connection is away. The model picker leads with a curated **Suggested**
group, intersected with OpenRouter's live catalogue and its advertised
structured-output support, because an unguided choice from the whole catalogue
was the sharpest failure cliff in the flow.

**The Help offer belongs to the Library.** It is rendered inside the Library's
page column beneath that page's own top bar, carries a sentence saying what it
offers, and is made once per run of the application by the act of rendering it.
Deep links to any other route defer the offer until the Library is reached.
`HelpIntroService` becomes root-provided so leaving and returning does not offer
it twice. Help itself opens with a three-step first five minutes and folds its
reference sections.

## Consequences

ADR 0051's shell-owned banner on every non-reader route is replaced by a
Library-owned one; its Help surface, its `helpIntroSeen` schema, and its reader
deferral are unchanged, and a learner who deep-links elsewhere sees the offer
when they first reach the Library rather than on that screen. ADR 0050's empty
Library behavior is amended: the empty Library no longer keeps the standing line
or the New story action. ADR 0025's chrome-free reader is untouched.

The design system now holds the cost mark and the first-run rules, and the
README, the setup guide, and Help each state the free/paid boundary as a list
rather than in passing. The suggested-model list is a claim about what works and
has to be revisited as OpenRouter's catalogue moves; it is checked against the
live catalogue at render time, so a retired entry disappears rather than leading
to a request that fails.
