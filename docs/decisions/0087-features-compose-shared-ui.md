# 0087 — Features compose shared-ui and write no styles

Date: 2026-11-08
Status: Accepted

## Context

The design system was a set of shared classes (`mn-card`, `mn-inset`, `mn-stack`,
`mn-button--ghost`) in `web/src/styles/components/`, described in prose in the design
system document. A feature put the classes on its markup and then wrote its own `styles`
for everything the classes did not cover: a gap here, a centred panel there, a heading
row with an action, a slider with its value above it. Each was small and each was
reasonable, and together they meant the same visual role was drawn several slightly
different ways. The document said what a screen should do, but nothing stopped a screen
from doing something else, and a review could not tell a deliberate exception from drift.

## Decision

A screen is built only from the Angular primitives in `web/src/app/shared-ui/`.

- A component under `features/` or `core/` writes no styles: no `styles` block, no
  `styleUrl`, and no `.scss` file. It also uses no native `[popover]` (it takes
  `mnPopup` or a dialog), no raw `<details>` (it takes `mn-disclosure`), and no
  `PopoverService` outside the reader.
- When a screen needs something no primitive draws, the primitive changes first, or a new
  primitive is added, and the screen then uses it. The need is then met once, for every
  screen, and documented beside the primitive.
- A primitive owns its look completely. Its inputs name roles (`variant`, `tone`, `gap`,
  `flush`), never values. A primitive that styles projected content uses
  `ViewEncapsulation.None` with every selector rooted at its own element, so its styles
  cannot leak.
- `web/scripts/composition-freeze.mjs`, run with the style lint, enforces this against
  `web/scripts/composition-allowlist.json`. The allowlist may only shrink: a new use
  fails, an allowlisted use that has gone fails until its entry is removed, and an entry
  added since the base revision fails.
- The global classes that remain (`mn-hint`, `mn-status-pill`, `mn-visually-hidden`,
  `mn-lead`) may still be placed in a feature's template, because placing a class writes
  no style.

The reader keeps its own styles for now. Its surfaces — the text measure, the token
marks, the docked player, the gesture-owning sheets — are not shared by any other screen.

Storybook was considered for showing the primitives in isolation and was left out: the
primitives document themselves in code, and the Playwright journeys already render every
screen built from them.

## Consequences

- Help, Settings, Add words, Library, Vocabulary, and Generate are composed from
  primitives and own no styles. The allowlist names what is left.
- The design system document describes roles and rules and lists the primitives; it no
  longer describes class names a feature combines.
- Adding a primitive is a larger step than adding a few lines of feature CSS. That is the
  point: the step is where a reviewer sees that the app has gained a new visual element.
- A test that reached into a feature's own markup now reaches through the primitive
  (`mn-chip-group button`, `.axis details`), so a primitive's internal structure is part
  of what those tests rely on.
