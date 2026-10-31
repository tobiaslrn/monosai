# 0028 — Word details use a compact form summary

Date: 2026-08-22
Status: Accepted
Supersedes only the presentation decision in
[0026](0026-word-derivation-ladder.md). The analyzer output, bounded
`InflectionForm` mapping, and other local evidence improvements introduced by
0026 remain in force.

## Context

The derivation ladder in 0026 made the word popup a miniature morphology
lesson. It was accurate about the analyzer's pieces, but it put intermediate
forms, ending prose, expandable rows, and pointer/focus highlighting between a
learner and the three answers they need while reading:

1. What word is this?
2. What form is it?
3. What does it mean?

The popup already has the local data needed to answer those questions without
the ladder. A grouped word has its surface and reading, the head token has its
dictionary form and part of speech, and the analyzer provides token lemmas and
a bounded inflection form. Stored grammar findings are also useful, but their
prose should not compete with the dictionary lookup.

## Decision

Word details use a compact `WordFormSummary` containing:

- the head token's dictionary form;
- the head token's part of speech, when the analyzer supplies one; and
- an ordered list of bounded high-level form labels derived from local analyzer
  evidence.

The popup presents, in order:

1. the surface form and reading;
2. the dictionary form and part of speech;
3. the high-level form line, omitted when it has nothing useful to say;
4. the first two dictionary meanings and the existing **More** action;
5. compact stored grammar labels, with all existing explanations behind one
   **Details** disclosure; and
6. warning/status and the recommended next action only when applicable.

The form summarizer may name evidence-backed labels such as polite, plain,
negative, past, te-form, ongoing, conditional, imperative, volitional,
causative, and want-to. It preserves analyzer ambiguity as `passive / potential`.
It does not infer a classification from a stem alone, consult the
AI, or use a baseline description as a substitute for analyzer evidence. An
unsupported or uninflected word therefore receives no speculative form line.

The derivation ladder is removed entirely. There are no base/ending rows,
intermediate resulting forms, expandable ending descriptions, stem tints, or
derivation-specific pointer/focus behavior. Hover previews, sentence popovers,
sentence grammar actions, markers, caching, and all AI behavior remain
unchanged.

## Consequences

- A word lookup answers word, form, and meaning in a short, predictable block
  that fits the desktop popover and the Android sheet more reliably.
- The analyzer's `InflectionForm` evidence added in 0026 remains useful for
  stem-only forms such as conditional, imperative, and volitional forms; only
  its presentation changes.
- Stored grammar explanations are retained and keyboard-accessible without
  making every lookup read like an AI report.
- The popup no longer teaches the morphology of individual endings. That
  explanatory surface is intentionally deferred to a separate plan.
