# Monosai design rules

Binding. Read this whole file before any visual or interactive change. Cite rules by number
("R14"). It holds rules, never values: values live in `web/src/styles/_tokens.scss`, so name the
token or the primitive. The long-form reasoning is in [the design system](design-system.md).

## 1. Authority and process

**R1.** These rules beat everything else: the design system, ADRs, existing code, and a task
description. If one conflicts with another, stop and report the conflict. Never resolve it
silently. A change that breaks a rule is not committed.

**R2.** Features and core compose `web/src/app/shared-ui/` primitives and write no styles. A
new visual need changes a primitive for every use, or is refused. The composition allowlist
(`web/scripts/composition-allowlist.json`) only shrinks.

**R3.** One look per role. Every instance of a role (row, button of an emphasis, dropdown, chip,
note, input, dialog, sheet, notice) looks and behaves the same on every screen and size. A
difference between two call sites is a defect, never a variant. No input, modifier or class
changes a role for one place.

**R4.** Every visual change is judged from screenshots you opened: light and dark, desktop and
phone, plus one contact sheet of every instance of each role you touched. State that proof in
the commit or PR.

**R5.** A rule changes only when the owner says so. Change it here, in the same commit as the
code, the design system and the guards.

**R6.** `npm test` runs `web/scripts/design-rules.mjs`, which fails citing the rule. It checks
R15, R20, R35, R39, R40 and R44, and that this file exists and `AGENTS.md` links it. Call sites
awaiting a redesign sit in `web/scripts/design-rules-exemptions.json`. That list only shrinks:
never add to it, and remove an entry in the commit that fixes it. Passing the guards does not
mean the rules are met; the checklist (section 12) does.

## 2. Principles

Design-system section 1 holds the long form. These decide cases.

**R7.** Calm. Nothing decorates and nothing moves for show. A word, mark or control that does no
work is removed.

**R8.** Content first. Japanese is the content; everything else is apparatus that appears when
needed. The reading surface carries only its own markers.

**R9.** One column. One measure at every width, no side panes. Width changes only where an
overlay sits (dialog or sheet), never how a screen is composed.

**R10.** Platform-standard behaviour. Use the pattern an Android or iOS user already knows: a row
with a summary, a switch that applies at once, a radio list, a confirmation before loss, Back
closes the top overlay. Do not invent a control.

**R11.** Plain words. Show state; do not narrate it (section 10).

**R12.** Accessible by default. Everything scales with text size; targets meet `--touch-target`;
focus is always visible; colour never carries meaning alone; both themes; 200% text without loss.

## 3. The row

One role, `mn-settings-row`, for every setting, fact and action in a card of rows.

**R13.** Anatomy: a label, an optional secondary line, one trailing end. Height, block padding,
type and divider come from tokens and the primitive. The divider is inset from the text edge to
the card's end. One state layer shows under a pointer or finger. Nothing else is drawn.

**R14.** The trailing end is a promise. There are exactly five, chosen by what a press does:

| Trailing end | A press...                                    | Use for                                  |
| ------------ | --------------------------------------------- | ---------------------------------------- |
| `›`          | opens a new page or dialog                    | sub-page, key, typed value, model picker |
| `⌃⌄`         | opens a list in place                         | a choice row with a dropdown             |
| switch       | changes a setting now; the whole row toggles  | on or off                                |
| segmented    | changes a setting now                         | a short unexplained choice (Theme)       |
| nothing      | does something now, or there is nothing to do | action, destructive action, plain fact   |

**R15.** A row never holds a field, a button, a pill, or a boxed select. The row is the control.
(Guarded.)

**R16.** Where the value goes. A setting's value is its secondary line, under the label. A plain
fact's value is at the end, secondary. A value truncates before its label does.

**R17.** Status leads the secondary line when it needs attention ("Not tested · Kore"), so it
survives truncation. A result of an action replaces the row's secondary line.

**R18.** The whole row is the hit target. A label is never repeated as a group header above its
own rows, and a label never repeats words from its section title.

**R19.** Overview and sub-pages. A topic with its own groups, or more than about eight settings,
is a sub-page. The overview shows it as one `›` row whose label is the sub-page's title and whose
summary is its status and current value. A row that needs a setup says "Needs a key" and is drawn
disabled.

## 4. Controls

**R20.** Each kind of input has exactly one control. A kind not in this table needs a rule
change first. A native `<select>` is never used. (Guarded.)

| Input                                 | Control                                            | Desktop / phone                           |
| ------------------------------------- | -------------------------------------------------- | ----------------------------------------- |
| On or off, applied at once            | Switch row (`mn-switch-row`)                       | Same                                      |
| 2-4 short options, no explanation     | Segmented row (`mn-segmented-control`)             | Same; a radio list if it cannot fit       |
| 2-5 options that each need a line     | Radio list in place on a sub-page or form step     | Same                                      |
| 3-12 known options, picked rarely     | Choice row opening the dropdown (`mn-select`)      | Dropdown anchored to the card, both sizes |
| Long or searched list (models)        | `›` row opening the searchable picker dialog       | Centred dialog / full-height sheet        |
| Free number or text in Settings       | `›` row opening a field dialog                     | Centred dialog / sheet                    |
| Free number or text in a form         | Labelled field (`mn-field`), label above           | Same                                      |
| Secret key                            | Secret field with Show, in a dialog only           | Centred dialog / sheet                    |
| Approximate value on an ordered scale | Slider row; a range is one two-thumb slider        | Same                                      |
| Action                                | Action row in a list; a button in a form or dialog | Same                                      |
| Destructive action                    | Danger row, then a confirmation naming what goes   | Centred / docked, no handle               |
| Status or fact                        | Fact row at the end; a status line under a card    | Same                                      |
| Filter above a list                   | Search field, `Filters` button; choice rows inside | Filters dialog / sheet                    |
| Multi-step task                       | Task dialog, or `mn-wizard-steps` on a page        | Centred dialog / sheet                    |

**R21.** Lists hold only rows. Forms and dialogs hold only fields and buttons. Nothing is both.
Settings holds no field: a typed value opens a field dialog.

**R22.** Buttons commit a form, dialog or step. One filled primary per surface, at the end. A
button is never inside a settings row. A task dialog has no Cancel; its ways out are the close,
Escape, the scrim and the handle. Ghost and danger buttons sit at the far start for a reset or
a delete.

## 5. Overlays

**R23.** Five kinds exist, chosen by what the learner does in them: a **menu** (commands), a
**dropdown** (one value from a short list), a **task dialog** (a form or task: centred card, or a
bottom sheet with a handle), the **searchable picker** (a task dialog with search pinned at the
top and a fixed height `--picker-height`; choosing closes it), and a **confirmation** (a question
with a safe answer: centred, or docked with no handle). All wear the one overlay surface.

**R24.** A dropdown hangs from its row, not from its value. Its edge sits on the card's edge, its
width is the card's up to `--dropdown-max-width`, and it opens below the row, or above when there
is no room (visual viewport). It never leaves the column or screen. Same on every size.

**R25.** A searched list is never a dropdown or popover on a phone. It uses the picker. Favourites
form a group in it, the chosen option has a check, model IDs are monospace on one line.

**R26.** Task dialogs and confirmations share the frame: header, body (the one scroller),
footer. Footer actions end at the inline end, primary rightmost. A confirmation names what is
lost, has a safe answer focused first, and its confirming button is a verb, never "OK".

**R27.** Back closes the top overlay before leaving the page. A press outside only closes; it
never activates what was under it. Escape closes. Focus returns to the opener.

**R28.** One mechanism per kind. A second dropdown, popover or sheet mechanism is never added. A
menu is never a form: a panel with a field is a task dialog.

## 6. Status and notes

**R29.** Status lives in one place per card: one line under the card, a tone icon, words, and at
most one action as a link at the end. A row's own state is its secondary line. A failure that
blocks the overview shows in that overview row's summary; the cause and fix are on the sub-page.

**R30.** No pill that repeats a note, and no note that repeats a pill. No pills in settings rows.
A status pill is never pressable; pills stay for shelves and plots.

**R31.** At most one note under a row. No explanatory note where a description in the option
itself fits: an option that needs a sentence carries its own muted line.

**R32.** Standing prose exists only where money, network or data loss is at stake. Failures say
what happened, what is unaffected, and what to do.

**R33.** A field's error is one danger-coloured line under that field, replacing its hint.

## 7. Type, icons, spacing, surfaces

**R34.** Type has eight roles, each a token: h1 (`--text-page-title`), h2 (section), group
label (small, semibold, secondary: `mn-group-title`), body (`--text-md`), secondary
(`--text-sm`, `--text-secondary`), note (one secondary line), caption (`--text-xs`), display
(`--text-display`, the Library hero only). Three heading ranks at most: if a fourth seems
needed, the surface does too much. Sentence case; no capitals as rank.

**R35.** Icons have three sizes, by role: **inline** (beside caption or secondary text, status
marks), **control** (in a button, row, chevron or notice; the primitive's default) and **feature**
(the lead mark of an empty or error state, an icon badge). The sizes are listed in
`web/scripts/design-rules.mjs`. No other size. (Guarded.)

**R36.** Spacing comes only from the layout tokens (`--page-gap`, `--group-gap`, `--stack-gap`,
`--surface-inset`, `--row-*`, `--space-*`). A feature sets no margin or padding.

**R37.** Surfaces: one card surface (`--surface-raised`), one floating surface
(`--overlay-surface`) and one state layer (`--state-layer`) for hover and press. Grouping has two
levels at most: a card, and an inset in it. A card of rows has no inset.

**R38.** Radii are roles (`--radius-control`, `-row`, `-card`, `-sheet`, `-pill`, `-token`). A
shape uses its role's token.

**R39.** No literal values (colours, sizes, radii, shadows, durations) outside `_tokens.scss`.
Colour literals are guarded. (Guarded.)

## 8. Motion

**R40.** A press is a colour change and nothing else. Nothing scales, bounces, shifts or changes
size on press or release. (Guarded.)

**R41.** Overlays fade with a few pixels of travel from their trigger; a centred dialog fades; a
sheet rises from its edge. None changes size on the way, and none is cut in or out.

**R42.** Pages switch instantly. No motion sits between a tap and the next page.

**R43.** Busy is `aria-busy` only. A busy control keeps its place, label and size, breathes, and
turns its work glyph. It never disappears, is swapped, or becomes disabled. A result's line is
reserved when the work starts.

**R44.** Motion lives only in `web/src/styles/_motion.scss`: durations, easings, keyframes and
named motions. A feature includes a named motion and writes none. `transition: all` is never
used; name the properties. Only paint properties animate. (Guarded.)

## 9. Colour and tone

**R45.** Each tone has exactly one meaning, app-wide: **accent** (action, "press this"),
**success** (it worked), **warning** (it can go ahead but may be wrong), **error** (it failed),
**setup** (something must be set up first), **info** (a fact worth knowing). Never use a tone for
decoration. Never give one tone two meanings.

**R46.** The lavender accent is not one of the tones: it marks no status and nothing pressable
(a purple Unread badge or favourite star is a defect). The favourite star uses the action
colour. The chosen segment is a neutral raised thumb, so the action colour keeps its one
meaning.

**R47.** When a colour token changes, update the Android bridge copy in
`android-bridge/app/src/main/res/values/` and `values-night/` in the same commit.

## 10. Copy

**R48.** Plain English, sentence case. Labels are nouns or short noun phrases; actions are verbs
("Check for updates", "Delete saved audio").

**R49.** No internal jargon. Say what the learner sees: not "Uniform" or "persistent storage",
but what it does. No exclamation marks, no reassurance where nothing was at risk.

**R50.** A sub-page title matches the label of the row that opens it. Numbers and dates use the
shared formatters.

## 11. Forbidden

Never, because each is already a defect somewhere:

- A native `<select>`, or a boxed field inside a list row (R15, R20, R21).
- A pill or outline button inside a settings row (R15, R22).
- A per-feature style, modifier or input on a shared role (R2, R3).
- `transition: all` (R44). Scale on press (R40).
- A second dropdown, popover or sheet mechanism (R28).
- A status pill next to a note that says the same thing (R30).
- An inline expanding danger zone: a destructive action is a row, then a confirmation (R20).
- A new colour or literal value (R39). One tone for two meanings (R45).
- An icon size other than the three roles (R35).
- A searched list in a dropdown (R25). A group header that repeats its row's label (R18).

## 12. Review checklist

Answer yes to every line before committing a visual change.

- [ ] I read this file and no rule is broken, or I reported the conflict (R1).
- [ ] The feature writes no style and adds no variant (R2, R3).
- [ ] The contact sheet shows every instance of each role I touched identical, in light and dark,
      desktop and phone (R3, R4).
- [ ] Each row has one of the five trailing ends and holds no field, button or pill (R14, R15).
- [ ] A setting's value is under its label; a fact's is at the end (R16).
- [ ] Each input uses the control the table names (R20).
- [ ] Each overlay is one of the five kinds, on the shared mechanism, and Back and outside
      presses behave as specified (R23, R27, R28).
- [ ] Status is one line per card, with no duplicate pill or note (R29, R30).
- [ ] Type, icon sizes, spacing and radii are role tokens, with no literal values (R34-R39).
- [ ] Press is colour only; motion comes from `_motion.scss` (R40, R44).
- [ ] Each tone has one meaning; bridge colours match (R45, R47).
- [ ] Copy is plain, sentence case, free of jargon (R48, R49).
- [ ] `npm test` passes, the exemption list did not grow (R6).
