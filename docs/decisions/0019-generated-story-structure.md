# 0019 — Generated story structure and where prompts live

Date: 2026-08-19
Status: Accepted; exact-count handling superseded by ADR 0046

## Context

Milestone 7 turns a model's reply into a saved reading. Three things had to be
settled before writing it: what text hierarchy a generated story has, where the
assembled prompt is built, and how the structural baseline reaches the model now
that the enumerated rule catalog is gone.

## Decision

### A generated story is one paragraph

`GeneratedStory` reuses the same paragraph/sentence hierarchy as an imported
reading, and every generated story has exactly one paragraph holding its ordered
sentences.

A paragraph in Monosai means one thing: the learner's own blank-line structure
in text they supplied. A model returns an ordered array of sentences and no
structure above them, so any paragraph split would be invented by Monosai and
then presented as if it came from the source. One paragraph is the honest
representation of what was returned.

The hierarchy is kept rather than special-cased because the reader, the
paragraph window, progress, and the deletion cascade are all written against it.
A second shape for generated text would fork every one of those.

If a later prompt version asks the model for paragraph structure, this becomes a
real decision again; until then there is nothing to represent.

### Prompt assembly lives in the OpenRouter adapter

`StoryGenerationRequest`, the structural checks, the exception-decision rules,
the palette, and the context budget are all in `domain/ai`. The assembled
prompt strings are in `infrastructure/openrouter/prompts/`.

A prompt is how one provider is addressed. It carries that provider's
structured-output conventions, its JSON-schema payloads, and its tolerance for
packaging; none of that is part of what a story is. Putting the strings in the
domain would make the domain describe OpenRouter, and would mean a second
provider could not be added without editing rules that have nothing to do with
it.

The contract in the other direction is what stays in the domain: what a request
must contain, what a valid candidate looks like, which structural problems are
malformed and which are repairable, and what makes an exception decision
acceptable. The adapter cannot loosen any of those, because it does not own
them.

One consequence is deliberate: `story-generation.adapter.ts` runs the domain's
structural check inside its reply reader, so the single format-recovery request
covers everything a differently phrased request could fix — a missing title, an
empty sentence, a duplicate or missing index. A story of the wrong length is
excluded from that on purpose: it is well formed and merely says the wrong
thing, so it travels back as a candidate and spends a content repair instead.
That keeps the two limits — one format recovery, two content repairs —
independent rather than multiplying.

### The structural baseline reaches the model as plain forms

The AI specification writes `structuralBaseline: readonly PromptGrammarRule[]`.
That type no longer exists: the rule catalog, `CatalogGrammarRule`, and every
enumerated grammar rule were removed in
[ADR 0014](0014-remove-grammar-rule-catalog.md).

`StoryGenerationRequest.structuralBaseline` is therefore `readonly string[]`:
the surface forms of the shipped structural baseline, flattened. The model needs
exactly one fact about them — these function words stay available even though
the allowlist forbids everything else — and a form list says it in about 400
tokens where serialized rule objects would cost thousands.

The baseline's descriptions, categories, and examples stay local. They exist for
the read-only in-app list and for classification, and neither is something the
model is asked to reason about.

## Consequences

- The reader, progress, deletion, and the paragraph window need no generated
  special case; `GeneratedStoryDraft` differs from `ImportedReadingDraft` only
  by the two tables that hold the evidence a generated story has to carry.
- Adding a second text provider means a second prompts directory and a second
  adapter, with no domain change.
- The assembled prompt is never stored. Provenance keeps the prompt versions,
  the captured profile, the captured policy, and the snapshot id, which is what
  reproducing or explaining a story actually needs.
- If the structural baseline grows substantially, the flattened form list grows
  with it; the 60,000-token request guard measures it along with everything else
  and fails before spending rather than truncating.
