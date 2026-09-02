# 0046 — Story length is a guideline, not a contract

Date: 2026-09-02
Status: Accepted

## Context

Story generation treated the length selected by the learner as an exact local invariant. The
provider schema required that exact number, structural validation reported any drift, and the
generation loop spent content repairs trying to restore it. A well-formed 27-sentence story for a
30-sentence request could therefore consume paid repair calls and ultimately be discarded even
though its Japanese was usable.

The same rule was enforced in four places: provider schemas, reply readers, long-story segment
assembly, and domain structural validation. Long-story repair also sliced received Japanese by the
planned segment sizes, so an early short segment could misalign every later vocabulary repair.

## Decision

The selected sentence count is a generation target. It is not a condition for accepting or saving
a story.

- Provider schemas require at least one sentence and retain the requested count as the upper bound.
- Story and segment readers validate only format: a title, non-empty sentences, and unique indexes
  contiguous from zero.
- Long-story generation concatenates whatever each valid segment returned and never repairs a
  segment merely for undershooting its plan.
- Long-story vocabulary repair plans over the number of sentences actually received and advances
  by each actual slice length.
- `StoryGenerationRequest` carries `requestedSentenceCount`, which remains available to prompts,
  token budgeting, and segment planning without presenting a false range invariant.
- Generation provenance records the requested count next to the reading's actual `sentenceCount`.
  Older provenance rows may omit it because no database rewrite is needed to adopt this decision.

Because sentence count was the only repairable structural issue, structural severity now has only
the `format` case. Format failures are rejected at the provider reply boundary and spend the one
format-recovery request there. They cannot reach the generation loop. The `invalid-draft` terminal
state and its UI are therefore unreachable and are removed.

## Consequences

- A coherent undersized story reaches the library without a count repair.
- The configured token budget and the maximum requested sentence count remain unchanged; providers
  still cannot return more sentences than the request permits through the native schema.
- Vocabulary repairs remain bounded and revalidate the complete Japanese after every pass.
- A format failure still produces a provider error after the existing single recovery attempt.
- The library shows the actual sentence count. The Generate control says "about" to describe the
  stochastic result honestly.

This decision supersedes the exact-count and surviving-`invalid-draft` parts of
[ADR 0019](0019-generated-story-structure.md) and
[ADR 0033](0033-unresolved-unknown-words-are-marked-not-rejected.md).
