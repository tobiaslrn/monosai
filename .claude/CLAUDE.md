# Monosai

Monosai is a local-first Japanese reading application for learners, especially absolute beginners with approximately 50–1,800 reviewed vocabulary entries.

## Project

Build Monosai according to the repository specifications. Read the relevant specifications before implementing or changing behavior. Prefer simple, maintainable solutions over speculative abstractions.

## Architecture

- Use strict TypeScript and established Angular patterns.
- Organize code by feature and responsibility.
- Keep domain logic independent from Angular, storage, APIs, and UI.
- Access persistence and external services through explicit interfaces.
- Components should focus on presentation and orchestration.
- Keep files small and cohesive. Split files when they contain multiple responsibilities.
- Never create god services, oversized components, catch-all utility files, or deeply coupled modules.
- Reuse abstractions only when they represent a real shared concept.
- Validate all external, stored, imported, and AI-generated data at runtime.
- Use explicit typed errors and exhaustive state handling. Avoid `any`.

## Schema changes before the first stable release

- There is no released version yet, so backward compatibility is not a concern.
- Edit the existing schema version in place. Do not add a new schema version and do not write a migration.
- Breaking local development databases is acceptable; recreating them is the expected cost.
- Revisit this once the first stable release ships, after which migrations become mandatory.

## Quality

- Preserve accessibility, offline behavior, data integrity, and read-only Anki access.
- Handle loading, empty, error, cancellation, retry, and offline states explicitly.
- Do not introduce dependencies without a clear benefit.
- Do not leave placeholders, dead code, skipped tests, or unexplained TODOs.
- Update documentation when behavior or architecture changes.

## Testing

- Add or update tests with every behavior change.
- Test domain logic thoroughly with focused unit tests.
- Use integration tests for repositories, workers, migrations, and external adapters.
- Use end-to-end tests for critical user workflows.
- Include failure paths, boundary cases, cancellation, and accessibility.
- Run relevant tests, linting, type checks, and the production build before considering work complete.

## Subagents

- Always set `model` explicitly on every Agent call. Never rely on the default.
- `haiku`: repository research, file and symbol search, reading docs, gathering context, mechanical edits.
- `sonnet`: routine implementation, tests, refactors, and reviews with a clear specification.
- `opus`: only for architecture, subtle debugging, or design decisions that genuinely need expert reasoning.
- Default to the cheaper model when unsure. Escalate only after a cheaper model fails.
- Match effort level to the task: low for lookups, medium for normal work, high only for genuinely hard problems.
- Do not spawn a subagent for work that is faster done inline.

## Git

- Work directly on the current branch. Never create, switch, or delete branches.
- You may commit without asking after a coherent, verified unit of work.
- Keep commits focused and use clear imperative messages.
- Commit only changes belonging to the current task.
- Never rewrite history, amend existing commits, force-push, or use destructive Git commands.
- Do not push unless explicitly requested.

## Working Method

1. Inspect existing code and specifications before changing anything.
2. Make the smallest complete change that fits the architecture.
3. Verify behavior proportionally to risk.
4. Refactor immediately if a change creates poor structure or oversized files.
5. Finish with a clean working tree or clearly report unrelated existing changes.

## UI Verification

- Use the Browser tool for visual QA, responsive inspection, console errors, and interaction checks.
- Use committed Playwright tests for repeatable end-to-end behavior.
- Test desktop and Android-sized viewports.
- Use Playwright—not manual browser interaction—for file uploads, offline behavior, IndexedDB, and regression coverage.
- Do not consider UI work complete until it has been inspected in the rendered application.
