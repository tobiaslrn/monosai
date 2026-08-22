# 0030 — Unified model selection and scoped overrides

## Decision

Monosai presents configured OpenRouter models in one list. Capability-specific options and compatibility evidence remain separate inside each model because structured text and audio tests prove different contracts.

Defaults are explicit identifiers for text and audio. Grammar judgement has an optional dedicated text-model identifier and otherwise resolves to the text default. Removing any referenced model clears the affected default instead of choosing a replacement.

Story and reader-audio selectors resolve a tested configured model into an immutable request configuration. The selection is captured before network work begins, affects only that request, and does not write a new default. Existing model, voice, speed, and options fields continue to define generation provenance and audio cache identity.

## Persistence

Database version 5 copies legacy active text/audio test evidence into the matching configured preset and adds the optional grammar-default field. Existing readings, enrichment, audio, credentials, and model presets are preserved.
