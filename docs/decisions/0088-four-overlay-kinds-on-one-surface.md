# 0088 — Four overlay kinds on one overlay surface

Date: 2026-11-09
Status: Accepted. Its picker kind is superseded by [0089](0089-one-dropdown-on-every-screen.md).

## Context

Overlays had grown one at a time, each from whatever mechanism its first screen
needed. Add words was a sheet-styled panel hanging from its button at the edge
of the page, with a full-width Cancel; the OpenRouter key was a form inside an
anchored menu, floating over unrelated settings rows; a model picker was an
anchored dropdown squeezed against the edges of a phone; Filters was a centred
dialog with its primary on the left; Story options was an anchored panel of
grey cards nested in a card; the confirmations were three more copies of a card
with their own padding, radius, and shadow. A learner met a different overlay
behaviour on nearly every screen, and the same surface was defined five times.

## Decision

Every overlay is one of four kinds, chosen by what the learner does in it, and
all four are drawn from one overlay surface defined once in the tokens
(`--overlay-*`, `--dialog-width`, `--panel-width`, `--picker-max-height`,
`--menu-min-width`) and `styles/components/_overlay.scss`:

- **Menu** (`mn-menu`): a short list of commands, anchored to its trigger at
  every width.
- **Picker** (`mn-sheet-popover` with `fitAnchor`): one value from a list;
  anchored and at least as wide as its trigger on a wide viewport, a bottom sheet
  on a small one. Its trigger is a field with the select's chevron.
- **Task dialog**: a form or a task in steps; a centred card over a scrim on a
  wide viewport, a bottom sheet with a handle on a small one, with a header
  (back arrow, title, close), a body, and a footer whose primary ends the row.
- **Confirmation** (`mn-dialog kind="confirm"`): a centred card, docked without
  a handle on a phone, with the same footer.

The kind is independent of the mechanism. A task dialog is a CDK dialog
(`mn-dialog` opened with `openDialog`) unless it has to outlive a file chooser
or wants a popover's light dismissal, in which case it is a centred
`mn-sheet-popover` (Add words, the OpenRouter key). Both render the same header
component (`mn-overlay-header`), the same body and footer, and the same surface.

The reader keeps two anchored exceptions on the same surface: word and sentence
details, and Story options, whose switches preview live on the text behind it.

## Consequences

- `mn-sheet-panel` is gone; `mn-dialog` is the one CDK frame and owns the docked
  sheet's departure, so no feature takes over backdrop and Escape dismissal.
- `mn-menu` no longer holds forms; a panel with a field is a task dialog.
- A task dialog has no Cancel button: the close, Escape, the scrim, and the
  handle put it away.
- Add words is centred on a wide screen rather than hanging from Add source.
