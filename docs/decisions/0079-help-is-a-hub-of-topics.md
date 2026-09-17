# 0079 — Help is a hub of topics

Date: 2026-09-17
Status: Accepted; amends [ADR 0051](0051-non-reader-utilities-and-first-use-help.md)

## Context

[ADR 0051](0051-non-reader-utilities-and-first-use-help.md) made Help one static
prose page covering starting paths, reader controls, AI cost, audio limits, and
practical generation advice. Five headings on one column was the right size while
Help answered "where do I click".

It is no longer the size of the questions. A stranger opening the public address
asks what the application is for before asking how it works, and the answers that
decide whether they get anything out of it are long ones: why a story written from
their own words beats a story off the internet, which model to point at OpenRouter
and what a bad one produces, what a voice costs per story, why live Anki access on
Android needs a second installed application. Written onto one page, each of those
either shrinks to a sentence that does not answer the question or pushes the next
question below three screens of scrolling. Neither is a guide.

The model and voice guidance also has a second problem. It names specific models
and what they cost, which is true for a while and then is not, and it is exactly
what a learner wants before they spend anything.

## Decision

Help is a hub and a set of topic pages under it.

`/help` carries the lead: what Monosai is for, the one idea the application is
built on, and the limit of that idea. Below it is one shelf of topic rows, each
naming a topic and what it answers, composed from the same `mn-list-group` and
`mn-list-row` primitives the Library uses.

Each topic is its own route under `/help/`, is lazily loaded, and is prose. Every
topic page uses the shared page frame with Back to Help, and ends with links to
the adjacent topics so the guide can be read straight through. One declaration in
`features/help/help-topics.ts` gives every topic its path, title, summary, and
icon; the hub shelf and the footer of every topic page read it, and a unit test
holds the route table to the same list, so a topic cannot exist in one place and
be missing from another.

The topics are the questions in the order a first-time learner asks them: first
steps, the words Monosai reads from, reading a story, choosing a text model,
voice and audio, installing and offline, then common questions.

**The application is where the guidance lives.** Model names, what a weak model
gets wrong, and what a story costs are on the model and voice pages, with the date
they were last checked. The repository README says what Monosai is and links here
rather than keeping its own copy of advice that would drift out of step.

Help stays local English prose. Opening it, or any topic under it, still calls no
provider and needs no key, so the page that explains what AI costs is itself free.

## Consequences

Help gains routes, and a topic page is a file rather than a heading. The shelf on
the hub is the price of that: one more tap to reach a topic than scrolling to a
heading, in exchange for a page that a learner can read to the end.

Content that names a model, a price, or a provider behaviour now carries a date
and is expected to be revised. A stale name on a page that says when it was
checked is a weaker failure than a stale name presented as current.

The first-use banner, its `helpIntroSeen` preference, and **Read the guide**
landing on `/help` are unchanged, and the hub is what the banner opens.
[ADR 0068](0068-one-non-reader-frame-and-page-header.md) and
[ADR 0069](0069-one-top-bar-per-screen.md) continue to hold: a topic page is an
ordinary non-reader page with one bar, and Help remains a shell utility rather
than a page-header exception.
