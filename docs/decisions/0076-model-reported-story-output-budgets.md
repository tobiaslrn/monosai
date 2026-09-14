# 0076 — Model-reported story output budgets

Date: 2026-09-14
Status: Accepted

## Context

Story generation used one fixed upper bound of 32,768 completion tokens in the
settings field. That value was lower than the output capacity of some models,
while a model without catalogue metadata still needed a manually configurable
budget. OpenRouter's model listing exposes the selected top provider's
`max_completion_tokens`, separately from the context length.

## Decision

The model catalogue maps `top_provider.max_completion_tokens` to the
provider-independent `ModelCapabilities.maxCompletionTokens` field. The story
and routed-task budget fields use that value as their HTML and validation
maximum when it is present.

When the provider does not report a completion maximum, Settings uses the
manual safety ceiling of 1,048,576 tokens. The stored default remains 16,384
tokens, so raising the available ceiling does not silently increase request
size or cost. The persisted settings schema uses the same broad ceiling for
manual values and existing settings remain valid without a database migration.

The request adapters continue to send the learner's captured budget. The
catalogue value controls configuration input; it is not copied into story
provenance or used as a prompt rule.

## Consequences

Learners can raise the story budget above 32,768 for models that advertise a
larger completion allowance, and models without that metadata remain manually
configurable. The picker also shows the reported output allowance beside the
context length. A provider's reported value is treated as metadata rather than
a guarantee for every routed endpoint, so the existing typed provider errors
and retry boundary still apply.
