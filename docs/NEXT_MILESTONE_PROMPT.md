# Handoff prompt — Milestone 2

Copy everything below the line into the next agent's `/goal` (or first message).

---

Create and pursue a durable goal to implement Monosai Milestone 2 — Offline
language assets and worker.

Authoritative instructions:

- Read `.claude/CLAUDE.md` completely.
- Read every Markdown document in `docs/spec/`, especially
  `docs/spec/anki-and-language-processing.md` (sections 9–13),
  `docs/spec/system-architecture.md` (sections 8–9), and
  `docs/spec/testing-and-delivery.md` (sections 3 and 7).
- Read `docs/IMPLEMENTATION_STATUS.md` and `docs/decisions/` first: Milestones 0
  and 1 are complete and committed, and their decisions constrain this work.
- Follow `docs/spec/implementation-roadmap.md` section 4 in order.
- Treat the specification as authoritative. Do not silently reduce scope.

Scope of this milestone (do not start Milestone 3):

- Select the concrete tokenizer and a compact common-word Japanese–English
  dictionary using the selection gates in the language specification. Record the
  choice, the gates it passes, and the rejected alternatives in
  `docs/decisions/`.
- Select or build the N5–N1 grammar catalog and define the Monosai-versioned
  structural baseline dataset. Both need reproducible build scripts, manifests
  with hashes, runtime schemas, and attribution metadata under
  `public/assets/language/<version>/`.
- Implement the language worker: versioned discriminated-union protocol with
  request IDs and cooperative cancellation, initialization, Japanese-aware
  sentence segmentation, tokenization with UTF-16 offsets, readings and
  part-of-speech mapping to the bounded domain enum, dictionary lookup index,
  snapshot phrase matcher, and vocabulary classification with the specified
  precedence order.
- Implement immutable language-asset caching with version activation and
  integrity verification, wired to `LanguageAssetSettings`.
- Create the golden language corpus described in testing-and-delivery.md
  section 3, with reviewed expectations versioned by analyzer/validator version.

Working rules:

- Production-quality strict TypeScript, small single-purpose files, clean
  feature boundaries. Components must not access Dexie, workers, or providers
  directly; ESLint `import/no-restricted-paths` enforces the layers.
- Domain gets the `Tokenizer` and `Dictionary` ports; infrastructure gets the
  worker client and the worker implementation under `src/workers/`.
- Wrap the tokenizer library so no feature or domain file imports its types.
- Validate all asset and worker payloads at runtime; use typed errors and
  exhaustive state handling; no `any`.
- Add tests alongside implementation: unit tests for segmentation, offsets,
  reading conversion, POS mapping, precedence, and phrase matching; worker tests
  for protocol-version mismatch, concurrent request IDs, late responses after
  cancellation, chunked 50,000-character analysis, initialization failure, and
  asset hash mismatch.
- Keep the main thread responsive: no long task while analysing the
  50,000-character fixture. Record the measured baseline.
- Maintain `docs/IMPLEMENTATION_STATUS.md` with completed requirements,
  verification results, assumptions, and remaining work.
- Record significant unspecified technical decisions in `docs/decisions/`
  (continue the numbering; 0004 is the latest).
- Use deterministic fakes for OpenRouter and Anki; neither is needed here.
- Use the Browser tool for any rendered verification and Playwright for
  repeatable journeys.
- Commit the completed milestone on the current branch with a descriptive
  message. Do not create branches and do not push.

Definition of done for this milestone:

1. `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
   `npm run build`, and `npm run e2e` all pass.
2. Golden fixtures pass; source characters and offsets are preserved exactly;
   known inflection and phrase precedence behave as specified.
3. A 50,000-character analysis stays responsive, with the measured baseline
   written into `docs/IMPLEMENTATION_STATUS.md`.
4. Offline language-asset initialization works, and an integrity failure
   recovers with a typed error rather than a crash or silent fallback.
5. Dataset licences, attribution, and reproducible build scripts are committed.
6. Report completed commits, commands run, test results, architectural
   decisions, measured performance, and remaining risks.

Continue autonomously. Only stop for:

- a product decision genuinely absent from the specification,
- credentials or permissions that cannot be replaced with a test double,
- a destructive operation outside the repository,
- or a repeated blocker that cannot be resolved safely.

Otherwise make the smallest reasonable standards-based decision, document it,
and continue.
