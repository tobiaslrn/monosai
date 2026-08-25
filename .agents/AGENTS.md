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

## Database schema changes

- Treat every committed schema version as immutable.
- Add a monotonically increasing Dexie version for every table, primary-key, or index change.
- Add a transactional upgrade function when stored records need to change shape or meaning.
- Preserve existing local data whenever possible; migration failures must offer an explicit recovery path and must never silently reset the database.

## Quality

- Preserve accessibility, offline behavior, data integrity, and read-only Anki access.
- Handle loading, empty, error, cancellation, retry, and offline states explicitly.
- Do not introduce dependencies without a clear benefit.
- Do not leave placeholders, dead code, skipped tests, or unexplained TODOs.
- Update documentation when behavior or architecture changes.

## UI design

- Make every screen feel intentional, quiet, and task-focused. Remove explanatory or technical copy when the control, state, or action already communicates it clearly.
- Keep implementation details out of the normal user journey. Put genuinely useful troubleshooting information behind a compact, clearly labelled advanced disclosure.
- Use the shared Monosai tokens and control classes for buttons, inputs, selects, textareas, choice controls, cards, menus, and dialogs. Do not leave browser-default controls where they clash with the app.
- Keep controls comfortably rounded, but reserve pill shapes for chips and status badges. Use consistent spacing, borders, typography, hover, focus, disabled, and error states.
- Place actions beside the field or content they affect. Keep related actions together, use compact intrinsic-width buttons, and avoid stretching buttons or separating a button group across a wide panel.
- Prefer clear state in the control itself over redundant status text. For example, a masked credential plus a Remove action communicates that a key exists; do not repeat “Saved” in several nearby places.
- Treat sensitive fields as password inputs. Never render a stored secret into the DOM, and use a masked placeholder when a credential is configured.
- Lay out related fields in balanced responsive groups. Prevent awkward stretching on desktop and switch to deliberate, consistent stacking on narrow screens rather than cramped wrapping.
- Style radio and checkbox groups as coherent accessible choices when they are a prominent decision. Keep the native input semantics, keyboard behavior, and visible focus indicator.
- Keep labels concise and user-oriented. Avoid provider protocols, prompt versions, asset versions, schema numbers, build metadata, and similar implementation language unless it helps resolve a problem.
- Scope component styles narrowly. Avoid broad element selectors such as `div { ... }` that can leak into nested components or overlays.
- Preserve standard overlay behavior: keyboard access, visible focus, Escape dismissal, outside-click dismissal, focus return, correct ARIA state, and closing after an action when appropriate.
- Check light and dark themes at desktop and Android-sized viewports. Do not accept horizontal overflow, clipped controls, excessive whitespace, or touch targets smaller than the shared minimum.

## Testing

- Add or update tests with every behavior change.
- Test domain logic thoroughly with focused unit tests.
- Use integration tests for repositories, workers, migrations, and external adapters.
- Use end-to-end tests for critical user workflows.
- Include failure paths, boundary cases, cancellation, and accessibility.
- Run relevant tests, linting, type checks, and the production build before considering work complete.

## Subagents

- Use subagents when you want to get an overview of the repo or find specific files/places where something is specified.
- Only use subagents for simple well isolated research tasks unless otherwise specified.
- For research agents always use the cheapest models.

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

## File Writing

- Never write long or multi-line content through shell heredocs, `echo`, or similar string literals; quoting and escaping break them.
- Use the Write and Edit tools for file content. Shell string literals are only acceptable for short single-line values.

## UI Verification

- Use the Browser tool for visual QA, responsive inspection, console errors, and interaction checks.
- Use committed Playwright tests for repeatable end-to-end behavior.
- Test desktop and Android-sized viewports.
- Use Playwright—not manual browser interaction—for file uploads, offline behavior, IndexedDB, and regression coverage.
- Do not consider UI work complete until it has been inspected in the rendered application.
