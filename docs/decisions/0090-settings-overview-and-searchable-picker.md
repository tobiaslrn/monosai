# 0090 — Settings is an overview, and a searched list is a picker dialog

Date: 2026-11-10
Status: Accepted. Amends [0089](0089-one-dropdown-on-every-screen.md) for the searched
list and for where a dropdown hangs.

## Context

Settings was one long page of about thirty controls. The AI card alone held sixteen,
in four nested groups, with five status pills, and mixed boxed selects, a boxed
number field, outline pill buttons, ghost buttons, a segmented control and a fold.
Values sat at the far end of a fixed column, where they were cut first, and the
dropdown hung from that value over the next group. The model catalogue, searched
by name, was a dropdown too, which on a phone with the keyboard up showed two or
three rows. Three-option choices whose options each need a sentence hid those
sentences in a dropdown. Reference apps (Android settings, AnkiDroid, iOS Settings,
Obsidian, Linear) all use an overview of short rows with sub-pages instead.

## Decision

- **Settings is an overview.** A topic with its own groups, or more than about
  eight settings, is a sub-page. The overview carries it as one navigation row whose
  label is the sub-page's title and whose summary leads with status, then value.
  The AI models become two sub-pages, Text models and Voice.
- **One row, five trailing ends** (`›`, `⌃⌄`, switch, segmented, nothing). A row
  never holds a field, a button or a pill. A typed value opens a field dialog.
- **Values sit under the label.** Status is one line under its card, not a pill
  in a header. A destructive action is a row and a confirmation, never a fold.
- **The searchable picker** is a fifth overlay kind: a task dialog of fixed height
  with the search pinned (a centred card, or a full-height sheet on a phone).
  Models are chosen in it, not in a dropdown. This amends 0089's "never a
  centred dialog", for the searched list only.
- **A dropdown hangs from its row,** at the card's edge and width up to
  `--dropdown-max-width`, not from the value.
- Two to five options that each need a line are a radio list in place.

The rules are `docs/design/rules.md` (R13 to R31); the redesign is built against
them in later changes.

## Consequences

- 0089's "the list hangs from the value" no longer holds; every other part of the
  dropdown stands.
- The pill, the group header, `--control-width` and the settings note leave Settings
  as the redesign lands.
- New tokens name the row's divider inset and the picker's fixed height.
