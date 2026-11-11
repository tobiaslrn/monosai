# 0089 — One dropdown on every screen size

Date: 2026-11-10
Status: Accepted. Supersedes the picker kind of
[0088](0088-four-overlay-kinds-on-one-surface.md). Amended by
[0090](0090-settings-overview-and-searchable-picker.md): a searched list is a picker
dialog, and a dropdown hangs from its row.

## Context

0088 made a choice from a list a "picker": anchored and at least as wide as its
field on a wide viewport, a bottom sheet with a handle and a title on a phone.
In practice that was three looks for one control. On a wide screen the list
took the panel width and hung from whichever edge it happened to, an inline
filter's list hung out past the start of the column, and on a phone the same
select became a titled sheet. The model picker drew its rows its own way again,
with a coloured bar for the chosen model where the select used a check. A
learner met a different dropdown on nearly every screen.

## Decision

A choice of one value from a list is always the **dropdown** (`mn-dropdown`),
and both the select (`mn-select`) and the model picker (`mn-model-picker`) are
built on it. It has one look on every screen size:

- **Placement**: directly below its row (below the field when it is not in a row), above it only when the content does
  not fit below and there is more room above, measured in the visual viewport
  so an on-screen keyboard counts. It never leaves the column or the screen. One script
  (`AnchoredPlacement`) does this, never a bottom sheet and never a centred
  dialog.
- **Width**: in a settings row, its edge sits on the card's edge and its width is
  the card's, up to `--dropdown-max-width` (rule R24 of the design rules
  supersedes the earlier value-anchored placement). Outside a row it is at least
  as wide as its field and `--dropdown-min-width`, starting at the field's start
  edge. Never wider than the column.
- **Anatomy**: the floating overlay surface, one padding the same on every side
  (`--dropdown-inset`), and one row inset in the panel with its own radius and
  no lines between rows: a label in normal weight, an optional muted line, and a
  check in the accent colour at the end for the chosen option. No title, no
  handle. The model picker adds a borderless search row as its first row, with
  one hairline under it, and a quiet favourite star before the check.
- **Trigger**: the current value as plain text and the up-down chevron, with
  no field box; in a settings row the whole row is the button and the list
  hangs from the value. Back closes an open list instead of leaving the page,
  and a press outside never activates what was under it.
- **Motion**: the shared `drop` motion, a fade with a few pixels of travel from
  the field's side.

A menu (`mn-menu`) stays a separate kind, because its rows are commands, but it
is drawn and placed by the same rules; only its width differs, fitting its
commands between `--menu-min-width` and `--menu-max-width`.

`mn-sheet-popover` keeps the task dialogs that must outlive a file chooser and
Story options; it no longer holds any choice from a list.

## Consequences

- The picker's sheet presentation, its title, and the select's `inline` input
  are gone; there is no input that changes the dropdown for one place.
- The menu's rows are the dropdown's inset rounded rows, with no hairlines; a
  menu has a separator only before a destructive command.
- On a phone the dropdown is anchored like a native select's list, so a long
  list scrolls inside it rather than rising as a sheet.
