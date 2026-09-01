# Monosai architecture

This directory describes the architecture of Monosai as it is today. It follows the
[arc42](https://arc42.org/) template: twelve chapters, one file each. Each chapter is short, so
that it stays true when the code changes.

These chapters describe the system. They do not plan it. There is no roadmap here and no status
report.

## How to keep this true

These chapters are written above the code, so that ordinary work does not have to touch them. Three
rules keep them at that altitude:

1. **Name folders and roles, not files.** A layer, an area, or a building block is stable. A file
   name is not. The exception is a handful of repository-root files that own a rule, such as
   `eslint.config.js`; those are linked because they are the authority.
2. **Do not copy a number that lives somewhere else.** Versions, coverage thresholds, bundle
   budgets, schema versions, and counts belong to the file that declares them. Point at that file
   instead of repeating it.
3. **Describe intent and constraint, not implementation.** If a sentence would have to change
   because a function was renamed or a store was split, it is written too low.

Update a chapter when the architecture changes — a layer, a port, a boundary, an external system, a
decision — not when the code inside a building block changes.

## Chapters

| # | Chapter | Content |
| --- | --- | --- |
| 1 | [Introduction and goals](01-introduction-and-goals.md) | What Monosai does, for whom, and the three quality goals |
| 2 | [Architecture constraints](02-constraints.md) | Delivery, platform, technology, and organizational limits the design must accept |
| 3 | [Context and scope](03-context-and-scope.md) | The learner, the external systems, and the adapter for each one |
| 4 | [Solution strategy](04-solution-strategy.md) | The five decisions that shape everything else |
| 5 | [Building block view](05-building-block-view.md) | The layers, the areas inside them, and the two seams worth expanding |
| 6 | [Runtime view](06-runtime-view.md) | Startup, text import, story generation, and reading |
| 7 | [Deployment view](07-deployment-view.md) | What runs in the browser, and how CI builds and ships it |
| 8 | [Cross-cutting concepts](08-crosscutting-concepts.md) | Domain model, result types, validation, ports, persistence, caching, offline, security |
| 9 | [Architecture decisions](09-architecture-decisions.md) | Index of every architecture decision record, grouped by area |
| 10 | [Quality requirements](10-quality-requirements.md) | Quality goals and the gates that enforce them |
| 11 | [Risks and technical debt](11-risks-and-technical-debt.md) | What is not yet verified against real external systems |
| 12 | [Glossary](12-glossary.md) | The domain terms used in the code and in these chapters |

## Related documents

- **[Architecture decision records](../decisions/)** — the records that give the reason for each
  decision. These chapters link to them. They never repeat them.
- **[Design system](../design-system.md)** — the authority for structure, controls, colour, units,
  motion, voice, and state. Read it before you change anything visual.
- **[Setup guide](../setup.md)** and **[Troubleshooting](../troubleshooting.md)** — for users, not
  for architects.
