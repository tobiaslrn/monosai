# 0080 — The plot is chosen before the story is written

Date: 2026-10-25
Status: Accepted; amends [ADR 0044](0044-backgrounded-story-generation.md) and
[ADR 0071](0071-markdown-input-wire-and-cache-friendly-text-requests.md)

## Context

Generated stories kept converging on the same few scenes, most of all with an
empty premise under Uniform word selection. Three things combined:

- The hidden supporting palette is forty to a hundred and eighty random words with
  no direction, so the model fell back on its most likely beginner topics.
- An empty premise asked the model to "pick a different situation each time", but
  every request starts from nothing and has no earlier time to differ from.
- Temperature 0.9 varies the wording of a story, not its topic.

The topic decision was left to the one component that could not remember what it
had decided before.

## Decision

The story form has three steps — **Words**, **Direction**, **Plot** — and the
plot a learner picks becomes the story's premise. Everything after Generate is the
existing backgrounded generation.

**Words** holds the word controls the form already had: Anki word selection and
its focus size, length, vocabulary strictness, vocabulary exceptions, and the
facts naming the vocabulary and grammar level. Grammar stays global. No focus-word
list is shown.

**Direction** offers seven axes — genre, mood, setting, cast, format, ending, time
— as one card of disclosures, one open at a time. Every axis starts on Any. Genre
takes up to two choices, a third replacing the oldest; every other axis takes one.
A learner may add a custom option of up to forty characters, which stays in its
row. Surprise me fills all seven from the built-in lists. Special instructions stay
at the foot. The option lists and the turning points are reviewable data in
`domain/ai/story-direction-options.ts`, held to a beginner rule: every option has
to be tellable with everyday words.

**Plot** shows three plots. Code decides what each is built on before any request:

- An axis the learner pinned is the same on all three cards.
- Genre, mood, setting, and cast left on Any are rolled **per card**, distinct
  across the cards where the lists allow. With everything on Any, the three plots
  have three different frames. Format, ending, and time left on Any stay unsaid.
- A **turning point** is rolled per card, always distinct, from its own list. The
  learner cannot pin it, so three cards differ even with every axis pinned.

Rolling uses the injected `RandomSource`, so it is reproducible in tests and varied
in use.

**One request writes every plot.** Three requests with the same prompt converge on
the same story three times; one request sees the plots it is writing beside each
other and is told that each needs its own central problem, goal, and turning point.
The request also carries the focus words, a sample of about thirty allowed words,
and the title and premise of the last ten generated stories as things already
written. Each plot is two or three plain English sentences of setup and conflict,
never the resolution. The reply is refused at the provider boundary when it has the
wrong number of plots, an empty or overlong one, or two that are the same once case
and punctuation are folded; that refusal spends the one format recovery
[ADR 0020](0020-persisted-structured-output-mode.md) allows.

The plot request is its own task, `story-plots`, with its own prompt version
(`plots/1`), the story model, temperature 1, and minimal reasoning. Its user layers
run from the slowest-changing to the fastest, as ADR 0071 orders them: stories
already written, learner notes, the vocabulary sample, then the frames. Every
learner-supplied value, custom options included, travels inside a data block.

A learner may edit the picked plot. An edited plot is the learner's own text and is
never discarded: Regenerate and a changed direction rewrite only the other cards,
roll their frames clear of the kept one, and send the kept text as a plot to differ
from. A started story spends its plot; a run that is cancelled or fails hands the
plots back, edits included.

The picked plot's text is the premise, so `StoryGenerationRequest.premise`,
`Reading.premise`, and the library row need no change. The card's frame travels
with it as the request's optional `direction` and is rendered as a **Story
direction** section inside the existing premise data block of the story, blueprint,
and segment prompts. A plot deliberately leaves the ending unsaid, so the direction
is how a chosen mood, format, and ending reach the writer; where an edited plot and
its direction disagree, the prompt says the plot wins. The story prompt version
increases to `story/7`. Repair prompts are unchanged.

Provenance records the learner's choices, which of them were custom, the picked
card's values with whether each was rolled, its turning point, the plot as sent,
and the drafted plot when it was edited. The field is optional and the
`generationProvenance` indexes are unchanged, so no Dexie version is needed; the
row schema validates the new shape.

## Consequences

- Variety is decided in code and by the learner, not hoped for from sampling. An
  empty premise is no longer reachable from the form; the story prompt keeps its
  wording for one for compatibility.
- Every story costs one more, small request, and the learner waits for it on the
  Plot step. The step names the wait rather than drawing placeholders.
- Leaving the Direction step needs the same prerequisites a story does, because it
  sends a request. Leaving the Words step needs none.
- The draft, including the direction and custom options, lives for the session. A
  repeat story is Next, Next, Generate. Nothing about the draft is persisted.
- Levelling the option lists by deck size and a separate model for plots are open,
  not decided here.
