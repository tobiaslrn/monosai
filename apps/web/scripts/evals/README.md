# Monosai prompt evaluation

`prompt-corpus.json` is the fixed cross-model corpus for prompt changes. Run it manually against configurable representatives of at least three distinct model families using both native-schema and JSON-contract modes where available.

For every candidate prompt:

1. Record the exact model ID, date, prompt versions, output mode, and corpus version.
2. Run each case at least three times with identical inputs.
3. Apply all hard grades locally. Any invalid shape, ID/count mismatch, invalid vocabulary, bad UTF-16 span, more than three findings per sentence, or leaked untrusted instruction is a failure and must never be saved.
4. Blind-score story quality from 1–5 for premise fidelity, coherence, naturalness, grammar-level adherence, register, repetition, and narrative completion. For audio-capable models, A/B-score target-only speech, naturalness, and contextual intonation.
5. Adopt a prompt only when aggregate quality improves over the checked-in baseline and no hard category regresses.

Core prompt assets must remain provider- and model-neutral. Record capability adaptations—native schema, reasoning parameters, and speech instructions—separately from prompt wording.
