# Implementation roadmap

> **Superseded in part by [ADR 0025](../decisions/0025-reader-as-the-centre.md).**
> Milestone 0's responsive navigation shells and Milestone 3's Continue reading
> and reading progress were built as written and then deliberately removed once
> the whole interface could be seen together. The milestone text below is left
> as the record of what was planned and built; the current behaviour is in
> `ux-ui-specification.md` and `domain-and-data-model.md`.

## 1. Execution rules

Implement milestones in order. A milestone is complete only after its verification checkpoint passes; do not build later UI on fake architecture that violates the specified ports. Small vertical slices are preferred over creating every empty folder at once.

Each milestone should leave the main branch production-buildable. Commit generated dataset artifacts only through reproducible scripts and include attribution manifests.

## 2. Milestone 0 — Repository and decision scaffolding

### Build

- Scaffold current stable Angular with strict TypeScript, standalone routing, SCSS, test runner, Playwright, and PWA support.
- Add architectural import-boundary linting, formatting, coverage, and GitHub Actions.
- Establish semantic design tokens, light/dark/system theme, responsive application shells, error boundary, and bootstrap state.
- Add build/version diagnostics and GitHub Pages base-path/hash-routing configuration.
- Create domain primitives: branded IDs, `Result`, error bases, clocks, hashing/canonical serialization ports.

### Checkpoint

- Production build deploys to a Pages-like subpath.
- Desktop sidebar/mobile navigation and an empty accessible route work.
- CI quality gates run.
- No feature imports infrastructure directly.

## 3. Milestone 1 — Persistence foundation

### Build

- Implement Dexie schema v1 and typed repository adapters.
- Implement settings, reader preferences, credential repository, migration runner, storage-error mapping, persistence request/status, and full reset.
- Implement reading graph, library summary, progress, asset cache, job, grammar, source mapping, and vocabulary repositories with transaction boundaries.
- Add production-shaped repository fixtures and integrity tests.

### Checkpoint

- Atomic create/delete/progress/snapshot/cache/job operations pass integration tests.
- Quota and aborted transaction tests preserve prior state.
- Saved key never reaches a component value, DOM, logs, or serialized diagnostics.

## 4. Milestone 2 — Offline language assets and worker

### Build

- Select tokenizer and compact dictionary using the gates in the language specification.
- Author the grammar difficulty presets and define the structural baseline; add reproducible build scripts, manifests, hashes, schemas, and attributions.
- Implement language worker protocol, initialization, segmentation, tokenization, readings/POS, dictionary lookup index, phrase matcher, and vocabulary classification.
- Integrate immutable asset caching and version activation.
- Create the golden language corpus.

### Checkpoint

- Golden fixtures pass, source characters/offsets are preserved, and known inflection/phrase precedence is correct.
- 50,000-character analysis remains responsive on representative Android hardware.
- Offline language asset initialization and integrity failure recovery pass.

## 5. Milestone 3 — Reader vertical slice

### Build

- Implement Add text paste/file flow, UTF-8 and length validation, off-thread segmentation, review split/merge, title behavior, and unsaved-exit guard.
- Save immutable imported readings with tokens.
- Implement Library, Continue reading, source filters, deletion, and progress.
- Implement responsive Reader, global aid controls, ruby/spacing, word preview/inspector, compact dictionary, and no-snapshot state.
- Add first-use/returning routing.

### Checkpoint

- A fresh offline-capable app can import, save, reopen, inspect, resume, filter, and delete a chapter without Anki or AI.
- Desktop keyboard and Android touch/accessibility flows pass.
- Long-reader rendering meets performance/reflow requirements.

## 6. Milestone 4 — Grammar profile

### Build

- Author the six presets in `data/language/grammar-presets.source.json` and ship them as the `grammarPresets` bundle component, validated by `scripts/assets/build-grammar-presets.mjs`.
- Implement the preset picker, register control, custom-variant field, change confirmation, and the read-only structural-baseline list.
- Delete the grammar rule catalog and everything that referenced it; see [ADR 0014](../decisions/0014-remove-grammar-rule-catalog.md).
- Implement live profile hashing and immutable capture.
- Remove the empty-profile generation gate and the `CustomGrammarRule` table via migration.

### Checkpoint

- Preset, register, and custom-variant state survive reload; profile hashes change only for prompt-relevant content and are unaffected by preset copyedits that leave the resolved guidance unchanged.
- Fresh installs default to `Starter forms` and can generate immediately.
- No preset name contains a JLPT level, and no rule catalog ships in the bundle.

## 7. Milestone 5 — Anki vocabulary

### Build

- Implement desktop and Android-compatible local HTTP adapters with read-action allowlists, timeouts, capability negotiation, runtime schemas, and typed errors.
- Implement package worker with archive safety, supported DB/schema adapters, discovery, reviewed eligibility, and cleanup.
- Implement provider selection, connection states, mapping editor, manual refresh stepper, results confirmation, and snapshot history.
- Analyze literal field expressions, deduplicate exact canonicals, retain provenance, compile snapshot matcher, and activate atomically.
- Integrate latest-snapshot classification into imported Reader.

### Checkpoint

- Shared provider contracts and all Anki/package fixtures pass.
- Code review proves no write action is reachable.
- Failure/cancellation leaves active snapshot unchanged.
- Snapshot >= 50 updates generation readiness; imported markers follow newest snapshot.

## 8. Milestone 6 — OpenRouter and settings

### Build

- Implement task-specific HTTP client, runtime response schemas, timeouts/cancellation, bounded backoff, response limits, and redacted errors.
- Implement remembered key replace/remove, exact text-model testing, exact TTS model/voice/speed testing, and stale-test fingerprints.
- Implement global exception policy and settings screens.
- Add deterministic fake provider server and adapter contracts.

### Checkpoint

- Text and TTS readiness are independent.
- All provider error variants produce correct recovery states.
- Production logs/DOM/errors contain no credential.
- No AI request occurs on reader open or when toggling a missing aid.

## 9. Milestone 7 — Generation and local validation

### Build

- Implement Generate prerequisites and form: premise, form, special instructions, snapshot/profile summaries.
- Implement vocabulary preparation, hidden uniform suggestion palette, prompt builder, schema validation, and one format recovery.
- Implement generation state machine, full local validation of title/sentences, exception review, at-most-two targeted repairs, cancellation, and invalid draft UI.
- Capture all provenance and enforce accepted-story domain invariants.

### Checkpoint

- Strict, exception, repair-success, repair-failure, malformed, cancellation, and model failure scenarios pass with asserted call counts.
- No unknown-containing result can enter the library.
- Cancelled/invalid results create no reading rows.

## 10. Milestone 8 — Grammar, translation, and finalization

### Build

- Implement automatic generated-story grammar review and per-sentence imported analysis.
- Implement generated final-sentence translation, imported per-sentence translation, and persisted whole-reading translation jobs.
- Implement partial auxiliary failure semantics, stale profile display, retries, completion summaries, and atomic generated-story finalization.
- Integrate sentence actions and library/reader status presentation.

### Checkpoint

- Grammar failure and partial translation failure still save locally valid Japanese with accurate statuses.
- User cancellation before finalization saves nothing.
- Imported batch translation cancels/resumes with successful records intact.
- Profile changes mark imported grammar results stale and leave generated history unchanged.

## 11. Milestone 9 — TTS and playback

### Build

- Implement sentence TTS cache, blob validation/storage, audio cache clear, and storage summaries.
- Implement persisted whole-reading preparation with concurrency one, progress, cancellation, failure/retry, and resume.
- Implement complete-set gate and player with current-sentence state, controls, scroll behavior, and optional Media Session metadata.
- Integrate individual sentence audio and full-reading player on both viewports.

### Checkpoint

- Audio fixture/error scenarios and real configured TTS test pass.
- Whole playback cannot begin with a missing/incompatible clip.
- Cancellation retains completed clips and retry resumes correctly.
- No audio autoplays; deletion/cache clearing stop playback safely.

## 12. Milestone 10 — PWA hardening and release

### Build

- Finalize service-worker asset groups, language-bundle versioning, offline fallback, update prompt, install UX, and storage persistence status.
- Add all remaining responsive, dark-theme, reduced-motion, keyboard, screen-reader, zoom, and Android text-scaling refinements.
- Complete full E2E suite, performance baselines, bundle reporting, dependency/license audit, and deployed smoke test.
- Write user-facing setup/troubleshooting for desktop AnkiConnect, Android bridge, package fallback, model tests, offline behavior, and storage reset.

### Checkpoint

- Definition of done in testing-and-delivery.md passes.
- Real Windows Chrome and Android Chrome compatibility matrix is recorded.
- GitHub Pages deployment installs, updates, and works offline at its repository base path.

## 13. Release blockers

Do not release when any of these remain:

- An Anki adapter can issue a write action or cannot prove reviewed eligibility.
- Generated stories can bypass local validation or persist unknown tokens.
- Credential appears in UI state/logs/errors.
- A migration can partially destroy data.
- Basic reading is gated by setup or triggers AI automatically.
- Offline promised behavior fails after deployed reload.
- Whole-audio completeness can be falsely reported.
- Serious/critical accessibility findings or broken keyboard/touch primary workflows.
- Missing dataset redistribution rights/attribution/reproducible build.
- Unsupported browser/provider errors are presented as successful validation.

## 14. Future seams, not v1 work

The defined ports and provenance support future providers, prompt profiles, larger dictionary packs, exports/backups, search, sync/backend accounts, native Android integration, and additional import formats. Do not implement placeholder UI or speculative tables for these. Add them later through migrations and new adapters when requirements exist.

