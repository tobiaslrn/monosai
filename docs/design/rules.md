# Monosai design rules

Binding for every visual, interactive and copy change. Claude Code loads this file in every
session; other agents read it before UI work. Values live in `web/src/styles/` and each
primitive's own code, so name the token or the primitive, never a number. Cite rules by number.
`npm run design:check` enforces what can be checked and prints the fix; [checks.md](checks.md)
lists those checks and the retired rule numbers. Why the app looks this way: [README](README.md).

## Words used here

- **Primitive**: a component in `web/src/app/shared-ui/`. Its doc comment is its spec.
- **Row**: `mn-settings-row`, a label, an optional secondary line and one trailing end.
- **Card**: the raised surface holding rows or content. An **inset** is the one level inside it.
- **Status line**: the one line under a card that reports its state (R29).
- **Note**: a muted line under one row. A **notice** (`mn-notice`) is a boxed warning or caveat.
- **Overlay**: anything floating over a page; one of the five kinds in R23.
- **Sheet**: a task dialog or picker as it appears on a phone, docked to the bottom edge.
- **Action** (sage): the tone of "press this". **Highlight** (lavender): reader marks only.
- **Tone**: action, success, warning, error, setup, info (R45).

## 1. Authority

- **R1.** These rules beat ADRs, existing code and the task. Code that breaks a rule is a defect,
  never an example to copy. On a conflict, stop and report it; a change that breaks a rule is not
  committed.
- **R2.** Features and core compose primitives and write no styles. A missing visual need changes
  or adds a primitive for every use, or is refused. The composition allowlist only shrinks.
- **R3.** One look per role. Every instance of a role looks and behaves the same on every screen
  and size. A difference between two places is a defect, never a variant.
- **R4.** Judge every visual change from screenshots you opened: `npm run shots` for the affected
  screens and the gallery page of every primitive you touched, in light and dark, desktop and
  phone, against the before shots ([visual review](visual-review.md)). Anything that looks worse
  blocks the change, even when the task asked for it.
- **R5.** A rule changes only when the owner says so: change this file, the checks and the code
  in the same commit.

## 2. Principles

- **R7.** Calm. A word, mark, control or motion that does no work is removed.
- **R8.** Content first. Japanese is the content; everything else appears when needed. The
  reading surface carries only its own markers.
- **R9.** One column, one measure at every width, no side panes. Only overlays change width.
- **R10.** Use the pattern an Android or iOS user already knows: a row with a summary, a switch
  that applies at once, a radio list, a confirmation before loss. Never invent a control.
- **R12.** Accessible by default: everything scales with text size, targets meet
  `--touch-target`, focus is visible, colour never carries meaning alone, both themes work, and
  200% text loses nothing.
- **R56.** One home. Each setting and action lives in exactly one place:

| What                                    | Where                                             |
| --------------------------------------- | ------------------------------------------------- |
| Reading appearance (furigana, text size) | Story options in the reader, applied at once     |
| App-wide preferences, keys, models      | Settings, one `›` sub-page per topic              |
| Known words and their sources           | Words; removing a source is on its own page       |
| A story's actions (rename, delete)      | Its menu on the library card and in the reader    |
| Creating a story                        | Generate, as steps                                |
| How to use the app                      | Help, linked from the screen that needs it        |

## 3. Rows and controls

- **R14.** A row's trailing end promises what a press does:

| End         | A press...                                   | Use for                           |
| ----------- | -------------------------------------------- | --------------------------------- |
| `›`         | opens a page or dialog                       | sub-page, key, typed value, model |
| `⌃⌄`        | opens a list in place                        | a choice row with a dropdown      |
| switch      | changes a setting now; the whole row toggles | on or off                         |
| segmented   | changes a setting now                        | a short unexplained choice        |
| nothing     | acts now, or there is nothing to do          | action, danger action, plain fact |

The row is the control: it never holds a field, button or pill (R15, checked).

- **R16.** A setting's value is its secondary line; a fact's value sits at the end. Status that
  needs attention leads the secondary line ("Not tested · Kore"), and a result replaces it.
- **R18.** A label never repeats its group or section title, and a group header never repeats
  its only row.
- **R19.** A topic with its own groups, or more than about eight settings, is a sub-page shown on
  the overview as one `›` row: its title as the label, its status and value as the summary. A row
  that needs setup first says "Needs a key" and is disabled.
- **R20.** Each kind of input has exactly one control. A kind not listed needs a rule change.

| Input                                | Control                                                    |
| ------------------------------------ | ---------------------------------------------------------- |
| On or off, applied at once           | Switch row                                                 |
| 2–4 short named options              | Segmented row; a radio list if it cannot fit               |
| 2–5 options that each need a line    | Radio list on a sub-page or form step                      |
| 3–12 known options, picked rarely    | Choice row opening the dropdown (`mn-select`)              |
| Long or searched list (models)       | `›` row opening the searchable picker                      |
| Free text or number in Settings      | `›` row opening a field dialog                             |
| Free text or number in a form        | Labelled field (`mn-field`), label above                   |
| Secret key                           | Secret field with Show, in a dialog only                   |
| Continuous value on a scale          | Slider row; a range is one two-thumb slider                |
| Action                               | Action row in a list; a button in a form or dialog         |
| Destructive action                   | Danger row or danger ghost, then a confirmation (R26)      |
| Filter above a list                  | Search field and a Filters button opening a task dialog    |
| Multi-step task                      | Task dialog, or `mn-wizard-steps` on a page                |

Named steps (Small, Medium, Large) are segmented, not a slider.

- **R21.** Lists hold only rows. Forms and dialogs hold only fields and buttons. Nothing is both.
- **R22.** Buttons commit a form, dialog or step. One filled primary per surface, at the end. A
  reset is a ghost at the far start; a footer action that deletes is a danger ghost there. A task
  dialog has no Cancel: close, Escape, the scrim and the handle are its ways out.

## 4. Overlays

- **R23.** Five kinds, chosen by what the learner does: **menu** (commands), **dropdown** (one
  value from a short list), **task dialog** (a form or task), **searchable picker** (a long list;
  choosing closes it) and **confirmation** (a question with a safe answer). A searched list is
  always the picker. A menu never holds a field.
- **R26.** A confirmation names what is lost, focuses the safe answer first, and confirms with the
  verb ("Delete"), never "OK", "Yes" or "Continue". One step only. Do not confirm what can be
  undone.
- **R28.** One mechanism per kind. Never add a second dropdown, popover, dialog or sheet.

## 5. Status, type and surfaces

- **R29.** Status lives in one place per card: one status line under it, with a tone icon, words
  and at most one link. A row's own state is its secondary line. A blocking failure shows in the
  overview row's summary; cause and fix are on the sub-page.
- **R30.** A pill never repeats a note and a note never repeats a pill. No pills in rows; a status
  pill is never pressable.
- **R31.** At most one note under a row. An option that needs a sentence carries its own muted
  line instead.
- **R34.** Type has eight roles: page title, section, group label, body, secondary, note, caption,
  and display (the Library hero only). At most three heading ranks. Sentence case.
- **R37.** One card surface, one overlay surface, one state layer. Grouping has two levels at most:
  a card and an inset; a card of rows has no inset.
- **R42.** Pages switch instantly; nothing animates between a tap and the next page.
- **R43.** Busy is `aria-busy`: the control keeps its place, label and size, and is never disabled
  or swapped. A result's line is reserved when the work starts.
- **R45.** Each tone has one meaning app-wide: action (press this), success (it worked), warning
  (it may be wrong), error (it failed), setup (set something up first), info (worth knowing).
  Highlight is not a tone: it marks reading, never status or something pressable. Never use a
  tone for decoration.
- **R57.** A result appears where it was caused. The only app-wide surface is a toast, for work
  the learner did not start (a background refresh, an update).

## 6. Copy

- **R48.** Cut first. A string the learner would not miss is deleted. If a screen needs
  explaining, change the screen. Say nothing twice on one screen.
- **R49.** The first word carries the meaning: a verb for an action, a noun for a label. Plain
  words at about grade 7, no blame, no "please", "simply", "just", "you can", "currently".
- **R50.** Word budgets (ceilings): page title and heading 1–3 · row label 1–4 · secondary line
  1–5, no sentence · button 1–3, verb first · field hint 0–8 · empty state title 2–5, body one
  sentence of 12 · error title 2–6, body one action sentence of 12 · dialog title a question of
  3–7 · toast 1–5. A sub-page title matches the row that opens it.
- **R51.** One extra sentence only for lost data, money, an irreversible step or recovery, saying
  concretely what is safe or what it costs: "Your text is still here."
- **R53.** An empty list has a plain title ("No stories yet") and its action; a body only when
  the way to fill it is not obvious.
- **R54.** Sentence case. No full stop on a title, label, button or fragment. No em dashes,
  exclamation marks, "&" or "...". British spelling. Optional fields say "(optional)". Numbers and
  dates use the shared formatters.
- **R55.** Help is the one prose surface and follows [the help writing guide](help-writing.md).
  Help changes in the same commit as the behaviour it describes.
  