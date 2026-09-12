# 0071 — Markdown input wire and cache-friendly text requests

Date: 2026-09-12
Status: Accepted

## Context

The OpenRouter text prompts carried large learner-controlled lists and reading
windows as embedded JSON. Every ordinary vocabulary expression therefore paid
for quotes, commas, property names, and repeated array syntax. The same
requests also sent domain identifiers and redundant metadata that the provider
did not need in order to write, review, or translate text.

The provider still needs a strict machine-readable answer. Story generation and
story segments need only ordered Japanese strings, while a long-story blueprint
already has its segment indexes and sentence counts. Grammar and translation
need sparse attribution, so they retain explicit response ids, but those ids
can be short ordinals instead of domain identifiers. Translation opening, tail,
and glossary repair also have different response contracts; one permissive
envelope made the latter carry an empty translations array for no reason.

Long stories make several related requests. OpenRouter documents `session_id` as
a way to keep related requests on sticky routing, while usage accounting makes
cache reads and writes observable. Neither feature should expose prompt or
response content in local diagnostics.

## Decision

Text prompts sent to OpenRouter use small provider-facing Markdown renderers in
`infrastructure/openrouter/prompts`. Markdown supplies headings and one value
per physical line; it is never parsed back into a domain object. Values escape
backslashes, CR, LF, and leading Markdown control characters deterministically.
The existing `MONOSAI_CONFIG` and `MONOSAI_DATA` delimiters remain, and their
neutralization runs after line escaping. Ordinary vocabulary has no bullet
prefix. Empty optional sections are omitted, while the vocabulary root and its
minimum `Other allowed vocabulary` heading remain.

The vocabulary renderer consumes the existing deduplicated and partitioned
inventory. Focus values are grouped by their existing `firstSeen` label in
first-occurrence order; no difficulty or sampling rule changes. Supporting is
exactly the suggested vocabulary after focus removal. Domain ports and
persisted types remain unchanged.

JSON remains the only provider response format and continues to use native
strict JSON Schemas or the existing JSON-contract fallback:

- Stories and full repairs return `titleJa` plus `sentences: string[]`.
- Blueprints return `titleJa` plus `beatsEn: string[]`; the adapter joins beats
  positionally to the deterministic segment plan.
- Segments return `sentences: string[]` plus the continuity summary; the adapter
  creates local indexes.
- Grammar findings and translation entries use short ordinal ids on the wire;
  adapters restore domain ids, reject untrusted attribution, and retain the
  existing task-specific duplicate and partial-salvage rules.
- Translation opening, tail, and glossary repair have separate native and
  fallback contracts. Glossary repair returns only `glossary`.
- Scoped repair remains explicitly indexed because its sparse patch must be
  applied only to named targets. Full repair no longer sends attempt,
  disallowed-reason, title-index, or target-index metadata.

Long-story generation and long-story repair create one random, content-free
session id at the start of the run. The same id is sent as top-level
`session_id` for the blueprint, segments, and format recoveries. Short story,
independent repair, grammar, exception, and translation requests do not invent
a session. No `cache_control` is enabled globally. See OpenRouter's
[prompt caching guidance](https://openrouter.ai/docs/guides/best-practices/prompt-caching).

The client accepts an optional OpenRouter usage object without making it part of
the response contract. It logs only numeric `promptTokens`,
`completionTokens`, `totalTokens`, `cachedTokens`, and `cacheWriteTokens`,
together with task and model. Missing, malformed, or unknown usage fields are
ignored; prompt and response content never enter diagnostics. TTS is outside
this decision.

Prompt versions increase to `story/6`, `repair/6`, `exception-review/4`,
`grammar/5`, and `translation/5`. No Dexie schema version changes, migrations,
or data deletion are required: existing fingerprints make old cached results
stale without removing them.

## Consequences

Large text inputs use less wire and estimated prompt budget because ordinary
entries carry only their text and a line separator. Stable context is assembled
before changing windows for long-story segments and translation batches, which
improves the chance of provider-side prefix reuse. The prompt renderer remains
task-specific rather than becoming a general template or Markdown AST.

Adapters contain the compatibility work: compact arrays and ordinals are
validated and immediately reconstructed into the unchanged domain contracts.
Malformed optional usage cannot turn a valid completion into an error, while
the token diagnostics make cache effectiveness measurable without storing
learner content. New prompt versions invalidate affected result fingerprints;
stored readings, aids, and audio remain available.

Difficulty selection, Recently learned selection, sampling, Anki access, and
speech inputs are unchanged.
