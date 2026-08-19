# 0020 — Persisting the tested structured-output mode

Date: 2026-08-19
Status: Accepted

## Context

The text-model compatibility test already discovers how a model can be held to
an exact output shape: provider-native `json_schema`, or a strict JSON contract
with schema validation and one format-recovery request. Milestone 6 returned
that as `ModelTest.structuredOutput` and kept it in a signal on
`TextModelStore`, where it survived only until the page was left.

Milestone 7 makes real requests in that mode. Without a stored answer,
generation would have to open every run in the native mode and discover the
fallback again — one wasted request per run, per task, for every learner whose
model does not support provider-native schemas.

## Decision

`TextModelSettings` gains `structuredOutput: StructuredOutputMode | null`,
written in the same settings update that records a successful test's fingerprint
and timestamp. Generation reads it and opens in that mode on its first attempt.

The field is cleared to `null` whenever the model id changes, alongside the
existing staleness rules: a mode proved for one model says nothing about
another. Readiness is unchanged — it is still a fingerprint comparison — but the
Generate screen requires both `ready` and a recorded mode, because generation
has nothing to open in without one.

The schema is edited in place rather than migrated, per the repository's
pre-release rule: there is no released version, and a development database that
predates the field simply fails its row validation and is recreated.

### Why not derive it each run

Discovery is not free. It costs a full request against the real prompt, and the
failure it recovers from is a schema-parameter rejection or a wrong-shaped
reply, both of which are billed. Doing that once at configuration time, where
the learner is already waiting for a test result, is the same information at a
fraction of the cost.

### Why not treat the absence of a mode as "use native"

A learner who tested a model before this field existed, or whose test failed
after their key changed, would get a native attempt that may not be supported.
Requiring a recorded mode makes the Generate screen say "run the model test once
more" rather than spending a request to rediscover something the test is for.

## Consequences

- A generation run against a JSON-contract model costs the same number of
  requests as one against a native-schema model.
- The stored mode is provenance-adjacent but is deliberately not in
  `GenerationProvenance`: it describes how the request was phrased, not what the
  story was judged against, and the prompt versions already identify the
  request shape.
- `OpenRouterTextModelTester` and `OpenRouterStoryGenerator` share the same two
  modes and the same one-recovery rule, so a model that passes its test can
  always be driven by the generator.
- The Generate prerequisite for the text model is "a current test, and it
  recorded a mode", which is one check with two halves rather than two checks.
