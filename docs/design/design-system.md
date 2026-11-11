# Monosai design system

**Binding rules are in [rules.md](rules.md). Where this document and rules.md
disagree, rules.md wins and this document is wrong.** This document is the long
form: the reasoning behind those rules, and the detail they do not repeat.

This document holds the design language: what Monosai's surfaces mean, which
choice applies when, and what each rule rules out. It is the authority for
_why_ an interface looks and behaves the way it does.

It deliberately carries **no values**. There are no hex codes, no pixel counts,
no type scale, and no component API here, because a document that repeats them
goes stale the first time one is tuned. Values live in `web/src/styles/_tokens.scss`,
the named thresholds in `web/src/styles/_breakpoints.scss`, the form fields in
`web/src/styles/_controls.scss`, and everything else in the shared primitives in
`web/src/app/shared-ui/`, each of which documents its own use; this document
names the _roles_ those tokens fill and the rules that govern their use. When
these disagree, this document describes the intent and the tokens describe the
current state — reconcile by changing the tokens.

This document describes what any screen may do. What a particular screen does is
described by the screen's own code, and the structure it sits in is described by
[the architecture documentation](../arc42/README.md).

It governs Monosai's native Android bridge as well as the PWA. The bridge cannot
read the PWA's custom properties, so `android-bridge/app/src/main/res/values/`
transcribes the same roles under the same names, with `values-night/` carrying the
dark palette. That transcription is a copy and drifts like any copy: a token
changed here is changed in both places, in the same commit. What the bridge does
not copy is behaviour — its controls are framework widgets, so Android's text
scaling, focus and touch semantics stay whatever the device says they are.

## 1. Principles

1. **The text is the application.** Japanese is the only content Monosai has.
   Everything else is apparatus, and apparatus earns its place by being needed
   at the moment it appears. The reading surface stays still and stays
   uncoloured except where it is marking the Japanese itself.
2. **Repetition earns silence.** A control pressed fifty times a session may
   drop its label; a control pressed once a week may not. Familiarity is the
   only thing that buys an icon its silence, and it has to be earned per
   control rather than granted to the whole interface.
3. **A word on screen is doing work or it is not there.** Explanatory prose is
   a cost paid by every future reader of the screen. It is worth paying where
   money, network, or the learner's own text is at stake, and rarely elsewhere.
4. **State is shown, not narrated.** A control that is disabled, filled, or
   part-way through says what a sentence would have said. Prefer changing the
   thing over describing it.
5. **Everything scales from the reader's own settings.** The browser's font
   size, the OS text scale, and the learner's reader scale are inputs the
   layout obeys. Nothing is pinned to a size the user cannot influence.
6. **One look per role** (R3). Every instance of a role — a dropdown, a button of
   one emphasis, a row, a chip, a note, a dialog — looks and behaves the same
   everywhere and on every screen size. A difference between two places is a
   defect, not a variant. A role changes for everyone or not at all.

## 2. Structure

### The column

Every page is **one centred column** at every width, with a bounded measure. A
wide window gives a page more margin, never more columns. This is a deliberate
refusal of the adaptive multi-pane layouts that desktop patterns encourage: the
reader is a single measure of Japanese, and a shell that reflows around it would
make the desktop and the phone two different applications to learn.

There is **one measure**. Every non-reader page — its bar's title, its section
headings, its prose, its cards, its error screens and its blockers — fills the
same column, so they all share one left and one right edge. The measure is a
comfortable line of English rather than a share of the window: on a wide screen
a page gains canvas around the column, never a wider column, and no page keeps
a narrower or wider variant of its own. Prose inside the column fills it, so a
paragraph and the card under it end on the same edge. A table of real columns
may ask for more only when the common measure cannot hold it.

The page's spacing is steered from **one set of layout tokens** in
`web/src/styles/_tokens.scss`: the measure, the gutter beside it, the gap between
a page's blocks, the gap inside a group, the gap between a card's items, a
card's and a row's inset, and the height of a heading's row. Primitives consume
those roles and restate no literal of their own for them; a feature never sets
one at all. Changing how roomy Monosai feels is a change to those tokens and
nothing else.

There is one exception. **A form may carry one narrow settings aside** beside
its fields on wide screens, where the settings frame a decision the fields
express. The aside stacks below the fields when the width no longer supports it.
It is available to forms only; reading surfaces, lists, and prose never take
one. Generate no longer uses it: its decisions are made one after another, as
steps (see Forms in steps).

### One top bar per screen, and the page frame

Every screen has **exactly one bar**, and it is the first thing on the screen.
There is no application bar above a page's own header: two stacked bars put the
way back second and spent a phone's first hundred pixels on chrome
([ADR 0069](../decisions/0069-one-top-bar-per-screen.md)).

Every non-reader screen's bar is its `mn-page-header`: Back where the page has a
parent destination, the page title in the page-title token, and an optional
trailing element for controls that belong to that page. The bar sticks to the
top of the viewport on an opaque canvas ground that spans the full width, so
the way back never scrolls away. Its lower edge is a hairline that fades in once
content has begun to pass beneath it. The bar's title column shares the page's
bounded `--page-measure`, and Back and the last trailing control are pulled out
by their own inset so their glyphs, not their hit areas, align with the column.
The title tucks into Back's inset as well, so the arrow and the title read as
one unit rather than two separate items. Where the window leaves canvas beside
the column, Back hangs in it, so the title's first letter sits on the column
edge with the headings and cards below it.

What the application has to say about itself — a new version, a word source
that needs attention — is a **banner** above the bar. Its ground spans the
window, but its words start on the column's edge and its actions end on the
other, as one row on a wide screen and two short lines on a phone; it never
stacks a sentence over a column of buttons. What the application offers about a
page — the first-use pointer to the guide — is the page's own first block,
under its bar, in its column; nothing floats above the bar as unexplained
buttons.

The Library is the home destination and therefore has no Back: its bar leads
with the Monosai mark, then the Monosai wordmark in place of a visible title,
then the application's utilities in a labelled navigation landmark — Help and
Settings. The wordmark is decoration; the bar's heading still names the page
"Library" for assistive technology. Every other page is reached
from the Library and leads back to it, so the utilities live there and nowhere
else. The shelf's own two ways in — Write with AI and Paste, side by side — are
the one way to start a story; the bar does not repeat them once they have
scrolled away. Help carries a
labelled GitHub link at the end of its own bar, because Help is where a learner
looks for where the application comes from, and no icon reads as GitHub rather
than as a branch.

A control that does nothing is not shown. There is no search on the shelf until
the shelf can search.

The Reader keeps its own sticky bar with the same shape: Back, title, and its
own controls, the same height, the same fading lower edge.

Monosai does not use a bottom navigation bar. A bottom bar is for three to five
peers a learner moves between constantly; Monosai has one home, a reader under
it, and a handful of pages visited rarely. A bar that is always there would
permanently cost the reader its bottom edge, which belongs to the docked audio
player and the word and sentence sheets.

These utilities are an explicit exception to the repetition rule: they are
icon-only on both mobile and desktop, with accessible names and tooltips. They
are bare shared icon controls with unchanged touch targets and visible keyboard
focus.

The Library mark may carry a small, non-interactive `alpha` label at its upper
right while the application is in alpha. It is text, not colour alone, and it
does not add another bar or action. On the first completed navigation of a new
local installation, the application may show one blocking release-stage
disclosure using the app-level CDK dialog pattern. The learner acknowledges it
with one explicit Continue action; direct links are included so the status is
not hidden by the route used to open the application.

The home illustration blends into the canvas through an organic crop; the hero
is not a card and therefore has no panel boundary or elevation. The headline
and the illustration are two columns on one axis, so the hero is exactly as
tall as the taller of them and the page's gap is the only space around it.
The crop follows the illustration's arch and low foreground, preserving the
whole reading character and books. The asset is cropped to the drawing itself,
so the hero's frame is the picture rather than the empty space around it and
the distance to the bar above is the page rail and nothing else. Its
proportions stay fixed as the column changes width. Once the shelf holds a story, or a story could be written, the hero steps down to
a standing line: the illustration at three quarters of its display size and the
headline at the page-title size (the section size on a phone), so it takes two
lines beside it where it fits, never three on a phone, and never dominates the
shelf; the picture keeps three quarters of its size and only the headline gets
smaller; the crop never changes.
The display headline belongs to a shelf still waiting on its setup. The standing
line holds its two lines of room while its facts are read, so nothing below moves.
The home headline is tightly set beside it, centred on the
illustration's own axis so the two read as one composition rather than a
sentence hanging from the top edge. It is stated whole, once every fact in it
has been read; it never states one clause and appends the next. The two ways in
share one row across the column — writing with AI is the main way: the filled
primary, three parts of the row to the paste action's one, the plain secondary — and
stack, writing first, only where two no longer fit side by side without cutting a
label; there is no menu behind a button. Filter pills share the available
width on phones and stay compact on desktop.
Home's primary action uses the shared primary action colour; each palette shows
its own illustration unfiltered, as drawn.

Below the bar the Library states **where the learner stands** — how many words
Monosai can write from, and at what level. On a first visit, with no words and
no stories, it says what Monosai is for instead, as plain words with no page
behind them. That line is the screen's lead and
also the way to the page that explains it. In the image-led home hero it remains
plain copy without a trailing navigation glyph; hover, focus, and link semantics
identify the interaction without interrupting the headline. It states current
facts and never becomes a control that changes them.

**A destination is named once per screen.** The Library's bar supplies the
common destinations, and every other page's bar names the current one. Where a prominent line
already leads somewhere, that is the door; a second link to the same place in
nearly the same words makes both harder to see.

### Vertical composition

Pages are **top-aligned and grow downward**, like a document. Content is never
centred vertically and never stretched to fill the viewport. A short page leaves
the space below it empty, which is the honest result of having little to say.

The rhythm has two steps: the **page gap** between distinct blocks — a hero, its
action, a section, a form's commit — and the tighter **group gap** inside one
block, such as a heading and its card or a heading and the sentence under it.
A form's one action sits below the form's card, one page gap away, whatever
form it commits; it is never inside the card on one screen and outside it on
another.

**One column edge.** Section headings, the sentences under them, prose, page
titles and the outer edge of every card start on the same edge; a heading is
never inset from the card it names, except the small section label over a card
of rows (see List section labels). Inside a card, every row's words — a shelf
row, a settings row, a fold's summary, a blocker — sit one card inset from the
card's edge, the same inset a padded card gives its content, so text in a card
of rows lines up with text in the padded card above it. An inset group inside a
card of rows starts on that same inset.

A section heading may carry one action opposite it, and that action opens work
rather than holding it. What the learner is drafting — a pasted word list, an
Anki mapping waiting to be confirmed — is a card at the head of the section it
will change, on the section's full width, above the facts it has not changed
yet. An editor rendered in the action slot instead gets the width a button asks
for and grows the heading row around itself, which centres the heading beside a
column of squeezed fields.

Settings uses the same page frame as every other non-reader screen, and it is an
**overview**: short rows, each showing its label and its current value or
status, in a few quiet raised cards, each under a small section label. A topic
with its own groups, or with more than about eight settings (the AI models), is
a **sub-page**. The overview carries it as one navigation row whose label is the
sub-page's title and whose summary leads with its status and then its current
value. A setting that needs the OpenRouter key is drawn disabled and says "Needs
a key" until one is saved. The connection row opens the key dialog; it is pressed
once, so it is a row and never the page's filled primary. A card with one
self-evident choice, such as the theme, carries no second title. About stays on
the overview, as short rows, because a PWA has no system app-info screen where a
version and an update check could live. The rows, their five kinds and their
status are in
[rules.md](rules.md) (R13 to R19, R29) and described below
([ADR 0090](../decisions/0090-settings-overview-and-searchable-picker.md)).

Speaking style (Natural, Clear, Very clear, only when the selected model accepts
instructions) and Pace (Natural, Slow, Very slow, every model) are radio lists on
the Voice sub-page, each option with its own line, because each choice needs a
sentence. Both are model request preferences, so they sit beside the voice and
the sample's Play row. The player's local reading speed remains its own
fine-tuning control.

### Surfaces and groups

A page groups its content with two surfaces and no others. The **card** is the
one raised surface: a quiet edge, the card radius, and one inner padding. Inside
a card, a related set of controls may sit in an **inset** — a sunken group with
no border of its own, because the card already draws the boundary. Nesting stops
there: an inset holds neither a card nor another inset, so a page never has more
than two levels of grouping.

Content inside a surface runs in a **stack** with one gap, and buttons that act
together sit in one **actions** row. The row moves as a block: when it no longer
fits beside the copy it belongs to it drops beneath that copy whole, and a button
label never breaks across two lines.

A card's title is the section rank. A group inside it takes a **group title** —
sentence case, small, semibold, secondary — or no title at all when its contents
are self-evident.

A **card of rows** — settings, most of all — never sinks a group of its rows into
an inset, and has no header row of its own: its rows stay on the card's inset
with a hairline between each, inset from the text edge to the card's end, so the
card keeps one content edge. What belongs to a setting, such as the reasoning and
limit of a task's own model, follows it as rows on the same edge, never
indented. A setting that inherits shows the value that will actually apply,
muted, never a label for the inheritance alone.

**One row, five kinds** (R14). A setting is a row: it shows its label and its
current value, and the whole row is the control, a native button or a switch. The
kinds differ only in their trailing end, which says what a press does:

- A **navigation row** (`›`) opens a page or a dialog: a sub-page, the key, a
  single typed value, the model picker.
- A **choice row** (`⌃⌄`) opens the shared dropdown in place.
- A **switch row** changes a setting now, and the whole row toggles. It is the same
  row, with an optional line under its label (why it cannot be turned on).
- A **segmented row** changes a setting now (the theme).
- A **plain row**, with nothing at its end, acts or informs: an action row in the
  accent colour (the danger colour when it destroys something and asks to
  confirm), a fact row, a destructive row.

A row never holds a field, a button, a pill or a boxed select. One state layer — a
translucent layer of the text colour — is what every row (settings, choice,
action, shelf, dropdown and menu rows) shows under a pointer or a finger, so it
lightens a dark surface and darkens a light one. A filter above a list is the
same value-and-chevron button on its own.

**Values sit under the label.** The value of a navigation or choice row is its
secondary line, so a long model name is never squeezed to nothing; the label never
wraps under a value. A fact's value is at the row's end. Status leads the
secondary line when it needs attention, so it survives truncation.

**Status is a line, not a chip.** A row's own state is its secondary line. A
group's state is one line under its card, a tone icon, words, and at most one
action as a link at its end. A result of an action replaces that row's secondary
line, and a failure that blocks the overview shows in the overview row's summary,
with the cause on the sub-page. Group headers with a pill and a Test button are
retired, and settings rows carry no pill.

**Typed values open a field dialog.** A number, a name or a key in Settings is a
navigation row that shows the value and opens a dialog holding the field. Fields
live only in forms and dialogs. The field dialog (`openFieldDialog`) is built
once: the row's label titles it, one labelled field (`mn-field`) holds the value
with its hint under it, a problem is the field's one danger line in the hint's
place (R33), and the primary Save sits at the end (R22). A token limit and a
voice name with no list are both this, and a row's summary shows the value in
the shared number formatter (R50).

**The key is a field dialog with a secret field.** The OpenRouter key row opens a
task dialog: one sentence about billing and where the key lives with the link to
get one, a secret field (`mn-secret-field`: masked, Show inside it, no autofill,
monospace once shown), Delete key (the danger button, at the start, only while a
key is saved, leading to its confirmation) and the primary Save key or Connect at
the end. An empty entry and a saved key OpenRouter refused are each the field's
one danger line (R33); the overview row then reads "Key refused" (R17).

**One destructive pattern.** A destructive action is a row in the danger colour
whose secondary line says what goes, then a confirmation that names it. It is
never an inline fold or a button inside the row.

**List section labels.** Over a card of rows, the section label is small,
secondary and inset to the row text, as in Android and iOS settings. This is the
one exception to the column edge below, and it holds for cards of rows only; a
page section heading with an action (Word sources and Add source) keeps the
column edge.

A sample sentence — what a level reads like — is a quiet block set in from the
words around it by a rule (`mn-example`), not a sunken box: the card it sits in
stays the only surface.

A read-only list of **facts** is a definition list: the labels form one column
as wide as the longest of them, and each value starts right beside its label,
left-aligned, so the eye crosses a short gap rather than the width of a card.
Where the list's own container is too narrow for both, each label sits above
its value on the same start edge; a value is never set ragged against the right
edge. Diagnostic versions are separate label/value pairs rather than a
compressed prose line, so they remain easy to scan.

### Shared primitives

A screen is built only from the primitives in `web/src/app/shared-ui/`
([ADR 0087](../decisions/0087-features-compose-shared-ui.md)). A feature
component composes them and writes no styles of its own: no `styles` block, no
stylesheet, no native `[popover]`, and no raw `<details>`. When a screen needs
something no primitive draws, the primitive changes first, or a new one is
added, and the screen then uses it. The build holds this to an allowlist that
may only shrink (`web/scripts/composition-allowlist.json`); what is still on it
is the reader, whose surfaces are its own, and the screens not yet moved.

Each primitive documents its own inputs and slots beside its code. What each is
the way to build:

| Role             | Primitives                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Page frame       | `mn-page`, and `mn-page-header` for the one bar                                                                                                                                                                                                                                                                                                                                                        |
| Layout           | `mn-stack` (one vertical rhythm), `mn-cluster` (one wrapping row), `mn-split` (a label and its end), `mn-grid`; `mn-divider` between blocks                                                                                                                                                                                                                                                            |
| Surfaces         | `mn-section` (a group label on the canvas, one card, and an optional status line under it), `mn-card` (one raised surface with an optional heading action); `mn-settings-section` and `mn-settings-row` for settings (one row with five trailing ends)                                                                                                                                                 |
| Rows and lists   | `mn-list-row` and `mn-row` for a shelf, `mn-entry-list` with `mn-entry` for a table-like list, `mnVirtualList` for a long one, `mn-shelf-heading`, `mn-paging-status`                                                                                                                                                                                                                                  |
| Actions          | `mnButton` on a native button or link (`primary`, `ghost`, `danger`, icon-only), `mn-action-bar` for a form's commit at the foot, `mn-menu` with `mnMenuTrigger` for an action menu                                                                                                                                                                                                                    |
| Choices          | `mn-select` (one value from a short list, on `mn-dropdown`), `mn-segmented-control`, `mn-radio-list` (a radio list of settings rows), `mn-dialog-group` (a label over a group of rows in a dialog), `mn-radio-card-group` with `mn-radio-card`, `mn-switch-row`, `mn-checkbox`, `mn-chip-group` of pressed-toggle chips                                                                                                                                              |
| Fields           | `mn-field` (label, hint, and error around a control), `openFieldDialog` (one typed value in Settings, in a task dialog), `mn-secret-field` (a masked field with Show, in a dialog only), `mn-range-field` (the one slider row, or a range with two thumbs), `mn-search-field`, `mn-count` for a character count                                                                                                                                         |
| Detail and facts | `mn-disclosure` (a closed fold that states its value), `mn-facts` (label and value pairs), `mn-example` (a sample sentence and its gloss)                                                                                                                                                                                                                                                              |
| Status           | `mn-status-line` (a group's one line under its card), `mn-checklist` with `mn-checklist-step` for first steps, `mn-notice` beside what it describes, `mn-banner` for the application's own news, `mn-blocker-list` with `mn-blocker` for what stops an action, `mn-stepper` for a long workflow's stages, `mn-wizard-steps` and `mn-wizard-step` for a form in steps, `mn-working` for a wait in words |
| Whole screens    | `mn-outcome` (where a long task stands: running, done, or stopped), `mn-error-screen`, `mn-not-found-panel` and `mn-empty-state` on the one whole-page state                                                                                                                                                                                                                                                             |
| Overlays         | `mn-menu` (a menu), `mn-dropdown` (the list a select drops), the searchable model picker (`openModelPicker`, on the task-dialog frame), `mn-sheet-popover` with `mnOverlayTrigger` (a popover-held task dialog: Add words, Story options), `mn-dialog` with `openDialog` (a task dialog, a confirmation), `mn-confirm-dialog`, `mn-rename-dialog`                                                                 |
| Home and prose   | `mn-hero`, `mn-standing`, `mn-wordmark`, `mn-prose` for Help                                                                                                                                                                                                                                                                                                                                           |
| Glyphs           | `mn-icon`                                                                                                                                                                                                                                                                                                                                                                                              |

A menu is a native popover (`mn-menu`), so the browser dismisses it on a press
outside or Escape and returns focus, the top layer keeps it above any card that
clips, and no instance listens to anything while it is closed, which is what lets
one sit in every row of a virtualised shelf. A dropdown is a native popover too (`mn-dropdown`),
and so is a task dialog that must outlive a file chooser (`mn-sheet-popover`);
the other task dialogs and
the confirmations are CDK dialogs (`mn-dialog`). Which of the five kinds an
overlay is, and what it looks like, is described under App-level overlays and
sheets. The reader's floating surfaces and sheets stay on `PopoverService`,
because they own gestures and docking a menu does not have
([ADR 0083](../decisions/0083-floating-panels-are-native-popovers.md)).

The reader remains outside this set where its text measure and sticky chrome
are intentionally separate, but its bar follows the same shape.

### Density

Interactive targets are **one size at every width and every pointer**. There is
no denser desktop variant, and no compact variant of a control inside a dropdown:
a row in an open list is a target like any other. A pointer-conditional target size requires knowing
the current pointer, and a hit area that changes during a gesture breaks that
gesture's own click (ADR 0032) — the cost of getting it wrong is larger than the
space it would save.

What may tighten on a wide viewport is the **vertical rhythm between sections**,
so a long settings page scrolls less. Targets, control heights, and the padding
inside a control do not change.

### Rows on a shelf

A shelf is for choosing what to open, so a row answers that and nothing else. It
carries a leading icon when the thing has a meaningful origin, a name, one
secondary line saying what is inside, and — opposite the name — its status,
value, or way forward. `mn-list-row` is the shared implementation: its title is
`text-md` semibold, its metadata is `text-sm` secondary text, and every row uses
one shared minimum height (`--row-min-height`), which a vocabulary row and a
fold's summary also take. A long title wraps once inside the content column and
then ends in an ellipsis; the full title stays the link's accessible name. The
trailing column stays separate, so the two never collide. The metadata is one
line of facts separated by a middle dot, and it breaks between facts, never
inside a word. Hover tints a row only under a mouse: a phone reports hover after
a tap and would leave the row it opened tinted.

The navigable row is one native link, because a row is not a place to configure
anything. Where a row has a handful of things to do to it, the overflow menu is
projected into the primitive's separate menu slot and remains a native button
outside the link. Where what it opens is a surface of its own, it lives there
and the row carries none
([ADR 0057](../decisions/0057-one-anki-entry-and-a-page-per-source.md)).

The line saying what is inside prefers **what the content already says about
itself** over anything counted about it: a generated story states the premise
the learner wrote, and only something with no such sentence falls back to its
size and its origin. On a shelf the useful date is when you last picked
something up, not when it was filed, and something never opened says so rather
than substituting the other date.

Rows on one shelf are the same height, and a row standing in for work still
running is the same row it will become: the same surface and anatomy, its status
leading its one line of facts so the title keeps the full width.

The vocabulary sources are one card of such rows, where the count joins the
line saying what is inside rather than sitting opposite the name, because a
source's name is long and the card is narrow. The card's last line reports how
current the sources are as a whole — when they were last read, or what is
stopping them — and holds the one control that can change that.

### Lists with filters

A list that helps the learner find a known item keeps one quiet column and a
compact toolbar: the search field, then one labelled Filters action (with a quiet
round count after its label, `mn-button__badge`, when filters are on). **A filter is never in both the toolbar and the Filters
dialog**: every less frequent choice lives in the dialog, as choice rows, and a
range (a difficulty band) is one two-thumb slider. Under the toolbar, one line
holds the result count (visible, and announced through a polite live region) and,
at its end, the current sort as a text button with the up-down chevron that opens
a menu. **Sort is a menu on that line, never a field in the Filters dialog.** The
dialog's footer is Reset at the start and the primary "Show N" at the end.

Rows show the value that makes them recognisable, the meaning or secondary
line beneath it, and only the metadata needed to choose between rows. Where
every row carries the same few figures they are columns under a quiet header
row; the header is presentation, so each figure also names itself to
assistive technology. The columns are sized in `rem`, and a list too narrow
for them (a phone) collapses to list rows — the word, its reading and meaning,
and a chevron — with the figures stated in the opened row; a container query on
the list, not a breakpoint. A figure is plain text: a difficulty is a fact, and
the warning colour is for what may go wrong. A missing meaning draws nothing,
never a dash per row. A row
that has more to say uses native `details`/`summary`; its closed summary still
states the current value. Expanded detail may include provenance links, but it
does not create a second row action hierarchy. Long lists may mount a measured
window of variable-height rows as long as the document keeps native list
semantics and the expanded row remains fully usable.

Search and filters have explicit empty-results states. Search text and the
active filters remain visible when there are no matches, with a Reset action
near the result. A list that has never been filled and a list whose current
snapshot is empty are separate states, and both offer the one action that can
change that fact.

The home Library is a compact shelf exception: each date group is one
`mn-list-group`, one pair of card edges with a hairline between its rows. A
generated or imported story uses its origin icon inside `.mn-icon-badge`; an
empty decorative circle is not used. The row carries a system-sans title, one
quiet line holding the opening of the text (Japanese, cut with an ellipsis, on the
title's edge) and one visible line of metadata — the character count and, for a
generated story, its length, with an audio glyph when audio exists — and, opposite,
a neutral Unread pill on a story never opened, then the overflow. Only what is
still new is marked: a Read badge on every opened row was the same word down the
whole shelf. The origin is already the icon and opened-or-not is already the
pill's presence, so neither is repeated in the visible line; both, with the
last-opened day, remain accessible metadata. Opened is not completed. Premises and
filenames do not replace the opening line here.

A shelf with nothing on it uses the shared empty surface: a short title, one
sentence on what would fill it, and the two ways in inside it, split the same
way, so they are not offered twice.

## 3. Controls

### The line between an icon and a label

An icon may stand alone when the control is **pressed repeatedly within a
session** and its meaning is fixed by that repetition — the reader header, the
audio transport, close, back, and overflow. Everything else carries a visible
label beside its icon: anything rare, anything destructive, and anything that
spends money or sends a request.

There are exactly two deliberate exceptions: the Library's utilities,
described above; and the control that reads Anki again at the end of the vocabulary sources card. That
last one sits on the line that already says what it acts on — "Synced today" —
exists only where a source Monosai keeps up to date is listed, and turns while
it works. None of them grants other infrequent controls icon-only status.

This is narrower than it sounds, and deliberately so. Research on icon usability
is consistent that only a small set of symbols is read reliably without a label,
and that most icons carry different meanings across applications. Repetition is
what closes that gap: a learner who has pressed the same three reader controls
across four readings knows them, and a learner reaching Settings for the second
time this month does not.

Every icon-only control carries an accessible name and a tooltip. **Neither is
the mechanism** — they are the recovery path for a control whose meaning was
supposed to be obvious. A control that genuinely needs its tooltip read before
it can be pressed has failed the repetition test and should carry a label.

One concept gets one icon, and one icon means one concept across the whole
application. Icons come in three sizes, by role: inline, control and feature
(R35).

### Appearance

Icon buttons are **bare at rest**: no border, no filled background, only the
glyph. Fill and border are reserved for hover, for press, and for the single
primary action of a surface — the play control in the transport, the primary
button of a form.

Text buttons share one pill silhouette, one touch-target height, one text size,
and one weight. A borderless button at the edge of a column — the end of a
heading, a row, a banner, a bar — gives up its padding outward, so its label,
the only thing drawn, lines up with the edge the column's text and cards keep,
while its hit area keeps its size. Every primitive's trailing slot does this
for the ghost button that ends it; nothing is nudged per screen. A bare `mnButton` is the secondary outline for an
ordinary reversible action. `mnButton="primary"` is the one filled action that
starts or commits the main work on a surface. `mnButton="ghost"` is action-colour
text without a border for quiet verbs such as adding a source, testing, or
previewing. `mnButton="ghost" tone="danger"` is the danger ghost: text only, in the danger tone, at the start of a footer for an action that deletes and leads to a confirmation. `mnButton="danger"` keeps a destructive action outlined in the
danger colour and is the confirming button of a confirmation. A surface has at most one
filled primary control; selected toggles use a soft selection tint instead.

A choice of one out of a few short, unexplained options — the theme — is a
**segmented** control (`mn-segmented-control`): native radios drawn at the
button's height, size, and weight. The chosen segment is a **neutral raised
thumb**, one shape that slides to the chosen option, so changing the choice reads
as one movement and the action colour keeps its one meaning, "press this". When
each choice needs a sentence to be understood before it is picked — how strict a
story is about vocabulary — it is a radio list instead, with every sentence
visible. A segmented control that cannot fit its row becomes a radio list, by a
container query on the control and not a breakpoint.

The filled primary icon control is `.mn-icon-button--primary`: a large circle in
the action colour, as the play control of the transport. It has its own hover and
press (the fill deepens and the circle keeps its size; it never turns grey) and is drawn
disabled like any other button. While the work it started is going on it is
**busy**, not disabled, and stays the filled circle (see below). `--icon-button-primary-size` sets its diameter
(4rem by default); a labelled one that says a word widens through layout rules
alone. A feature never recolours a shared control.

Disabled controls are drawn with the sunken surface, secondary text, and a
distinct boundary. Opacity alone is not a disabled state: disabled must be
recognisable in both themes and must not resemble either an active secondary
outline or a selected control. A ghost button has no pill to draw, so disabled it
stays without one: its label in the secondary colour is the whole state, and it
never draws a sunken pill against the edge of the card it ends. A chosen toggle that is disabled keeps its
selection tint behind the dashed boundary, so a choice that cannot be changed
still reads as chosen.

A control that started work is **busy** while the work runs, which is not
unavailable. Busy is `aria-busy='true'` and nothing else: no class, and never
`aria-disabled`, which would draw the disabled boundary. A busy control keeps
its variant's fill and text colour, so a filled primary stays the filled
primary, and breathes gently (still, under `prefers-reduced-motion`) with a
`progress` cursor; a glyph in it that draws work going round — sync, retry —
turns until the work ends. It does not answer the pointer — no hover change, no press —
and the component ignores a press until the work ends. It stays **where it is**:
a control that is working is never removed from its row, swapped for another
element, or replaced by a hint line, because that reflows what is under the
learner's thumb and destroys the focus the press left on it. One element is
bound to the changing state, and its label says what it is doing now
(`Generating audio`, `Translating…`). Because a label that changes in place is
not announced for a control that is not focused, the surface keeps a hidden
`role="status"` line that says what started. Disabled stays for what cannot be
done and has nothing working to make it possible; a control that is both is
disabled.

#### State order

Every shared control draws its states in one fixed order: **rest, variant,
hover, active, pressed, pressed and hover, busy, disabled, pressed and
disabled** ([ADR 0082](../decisions/0082-interaction-states-have-equal-specificity-and-a-fixed-order.md)).
A later state wins over an earlier one, so a pressed chip under the mouse shows
a deeper selection tint rather than the grey hover surface, and a variant's
hover beats the base hover. The order is decided by source, not by weight:
every qualifier of a state rule — the mouse guard, `:hover`, `:active`,
`[aria-pressed]`, and the enabled test — sits inside `:where()`, so each rule
weighs only the control's own class. A rule that resets a resting background
(a grouped row's transparent surface) belongs with the resting rules, before
hover. `aria-pressed` is the only state a toggle has; a feature does not mirror
it in a class or paint it a second time. Busy takes its place after pressed and
hover, before disabled; the hover, active, and pressed-and-hover rules exclude
`[aria-busy='true']` in their enabled test, so a busy control gives no pointer
feedback while it keeps its fill.

Hover is a mouse state everywhere, not only in the shared controls: a phone
reports hover after a tap and never takes it back, so every `:hover` in the
app is written behind the pointer guard that `data-pointer` on `<html>`
provides, and the static style audit rejects one that is not. Global partials
write the guard as `:where(html[data-pointer='mouse'])`. A component's own
styles write it as `:host-context(html[data-pointer='mouse'])`, which adds
weight, so a component keeps the exclusions that decide its states
(`:not(.is-selected)`, `:not(:disabled)`) in the selector, or restates a
selected state's tint under the same guard, rather than relying on order.
Hover selectors are written flat: the audit cannot see a guard on the parent
of a nested `&:hover`.

A bare icon button still meets the 3:1 non-text contrast requirement, because
the glyph itself is the visual indicator; a boundary is not required to satisfy
it. Text inputs are the opposite case and keep their visible boundary, because
an empty input with no border is not perceivable as a control at all.

### Switch groups

A compact switch group declares a small, stable set of independent outcomes,
such as which reading aids a reading should eventually have. Each row carries a
visible noun and a native checkbox with `role="switch"`, and the group has a
fieldset and a legend. Switches are never hidden behind a disclosure, because
the outcomes they select are part of the action being configured rather than
advanced detail.

A group sits on the form that starts the work. Saved stories instead expose
content status and explicit actions in Story options. It does not go into a list
row's action menu. That menu is a short list of things to do to a row, and a
shelf is for choosing what to open rather than for configuring each entry.

A switch is also the control for a **single standing decision** that changes
something the moment it is flipped — whether a vocabulary source counts. That is
not a group and carries no fieldset, but it is the same control: one appearance,
`mn-switch` in [`_controls.scss`](../../web/src/styles/_controls.scss), wherever an
independent outcome is turned on or off.

The track uses the sunken surface at rest and the action colour when selected.
A disabled switch stays visible and names, below the group, the exact state
that prevents it; generic setup advice is never substituted for an untested,
stale, or failed configuration. The whole labelled row meets the touch-target
floor while the switch itself stays compact.

**A surface never shows a control the thing in front of it cannot answer.** A
file has no freshness to configure, so its source row offers no refresh control.
A disabled control invites a learner to work out why; a fixed import instead
states its mapping and lets the learner replace it with a new export.

### Disclosures

A disclosure is a choice row whose list is the detail: it opens in place, so it
ends in the up-down chevron and never in `›`. It hides detail that is set once and rarely revisited — a mapping, a
list the learner is entitled to see but does not read. It is always
native `details`/`summary`; it is never used to hide a control the surface's
main action depends on, which is what a switch group is for. A disclosure never
holds a destructive action: that is a row and a confirmation (see One destructive
pattern).

**A closed disclosure states its current value.** The summary carries the label
and, under it as a setting's value is, what is currently selected — a mapped
field, a count of what is inside. A fold that hides the answer to the question its label asks makes the
screen worse than no fold at all, and forces the learner to open every one to
read the page. Disclosures do not nest: a section that already sits behind one
presents its contents plainly.

Where a link can point inside a disclosure, arriving there opens it. A deep link
that lands the learner on a long page next to a closed fold has not arrived.

### Forms in steps

A form whose later choices depend on earlier ones — Generate: the words, then
the direction, then the plot — is shown **one step at a time**, in the same page
frame. A row of step names under the bar says where the learner is: the current
step in the action colour and marked as the current step for assistive
technology, finished steps with a check and "done" in words. The row is not a
control. The way between steps is the bar's Back, which goes up one step and,
from the first, to the page's parent, and the step's one filled action at the
foot — Next, then the verb that commits the work. There are no step tabs and no
second Next; one action has one control. Moving to a step moves focus to its
heading and the page to its top.

A step's action is disabled only by what that step would spend. Leaving a step
that only chooses costs nothing and is never blocked; leaving one that sends a
request waits on the same prerequisites the request needs.

What still stands in the way is said above the steps as **one grouped card**
under a heading that names why it is there, one row per missing thing: a
warning mark, the sentence, and the way to clear it at the row's end, like
every other list of rows. It is never a column of loose notices with buttons
floating between them.

### Choosing on several axes

Where a learner may steer something along several independent axes, each axis
is one **disclosure row** in one card, and the rows share a native `name` so the
browser keeps one open at a time. The closed row states its value under its
label, as every disclosure does: "Any" when nothing is chosen, the choice when
something is, in the same secondary text — the action colour means "press this",
not "chosen". Every row starts closed, so a
"surprise" that fills them all shows each value in its own summary.

An open row is a wrap of **choice chips**: ordinary `mnButton` toggles in an `mn-chip-group`, with
`aria-pressed`, at the full touch-target height — the density rule allows no
smaller target, and a compact chip whose hit area overflowed its neighbour's
gap would put two targets under one finger. The order never changes on
selection: **Any** leads, the options follow, **Custom** ends the row, and a
custom option the learner adds joins just before Custom and stays. A choice is
the soft selection tint, never the filled primary. Custom opens one text field
and an outline Add beside it; Enter adds, Escape closes and returns focus to
Custom. Filling every axis at random is a ghost action in the card's heading.

### Options to pick from

**Each kind of input has one control** (R20); the table is in rules.md. This
section says how the list-shaped ones behave.

**A short list is the dropdown.** Every choice of one value from about three to
twelve known options uses the app's select (`mn-select`); native selects are not
used, because their popup is the platform's and matches no other menu. Its
trigger is a choice row: the current value as the row's secondary line and the
up-down chevron at its end, not a form field. Open, it is **the dropdown**
(`mn-dropdown`, [ADR 0089](../decisions/0089-one-dropdown-on-every-screen.md),
amended by [ADR 0090](../decisions/0090-settings-overview-and-searchable-picker.md)),
and it has one look on every screen size:

- **Placement.** It hangs from its **row**, not from the value: its edge sits on
  the card's edge, so its option text lines up with the row's text. It opens
  below the row, a small token's gap away, and above only when its content does
  not fit below and there is more room above, measured in the visual viewport so
  an on-screen keyboard counts as a lack of room. A dropdown that is not in a row
  (a filter above a list) hangs from its field's start edge, or its end edge
  where it would leave the column. It never leaves the column or the screen.
  Never a bottom sheet, never a centred dialog.
- **Width.** The card's width, capped at `--dropdown-max-width` and never below
  `--dropdown-min-width`, so it is never cramped to a short value's width like a
  native pop-up menu. One rule on every screen size, with no phone variant.
- **Anatomy.** The floating surface (white in light, a clearly lighter step above a card in
  dark) with its edge (a visible hairline in dark), the overlay radius and a shadow that reads on both, and one small padding the
  same on every side. Rows are inset in the panel, each with its own small
  radius, at one height and one inset, and no line between them. A row is a
  label in normal weight and an optional muted line; the chosen option is
  marked only by a check in the accent colour at the row's end, never by
  weight or a tinted background. Hover, keyboard-active and pressed rows take
  the neutral tint. A real split in a list is one separator line or a muted
  group label, inset with the rows. No title, no handle.
- **Scrolling.** Past its maximum height the rows scroll and the panel's
  padding stays put.
- **Trigger.** Its chevron is the app's up-down stroke icon in the muted
  colour, never turned, and while the list is open its row keeps the state
  layer.
- **Back and outside presses** (R27). Back closes an open dropdown or menu
  instead of leaving the page, and a press outside only closes it: it never also
  activates what was under the press.
- **Motion.** It fades in from its row with a few pixels of travel from the
  row's side and fades back out the same way.

An option that needs explaining gets the muted line rather than a hint under the
whole control; an unexplained choice (a voice name) stays a bare label. A first
"Automatic" or "Not mapped" option is an ordinary option. It is a select-only
combobox: the field is the combobox and the list its listbox. Enter, Space, or
an arrow opens it, the arrow keys, Home, End, and typing move through the
options, Enter or Space chooses, and Escape closes it and returns focus to the
field without choosing.

**A long or searched list is the picker dialog.** Choosing a model from the
catalogue is a navigation row that opens a task dialog, not a dropdown, because
a list that is searched needs room that a field-wide popup cannot give on a
phone: a centred card of fixed height on a wide viewport (so filtering never
makes it jump), a full-height sheet with a grab handle on a phone. The search
field is pinned at its top, and the sheet keeps to the visible viewport so the
keyboard leaves the list scrollable. Favourites
form a group; the chosen model carries the check in the accent colour; a model's
ID is monospace on one truncated line. Choosing closes it. It draws its rows as
the dropdown does and is the one place a searched list lives (R25).

**Two to five options that each need a line are a radio list in place**, on the
sub-page or the form step, so every sentence stays visible: Pace, Speaking style,
Anki word selection. Three short options compared at a glance are a segmented
control. Radio cards remain only for drafted options the learner edits (the
plots).

Drafted options the learner picks one of — the plots — are **insets inside the
card** that offers them, never cards of their own, so the page keeps its two
levels of grouping. Each is a radio card (`mn-radio-card`, sunken when it sits in
the card that offers it) with a native radio and a visible circle; the picked one
wears the selection tint, the same one a pressed toggle wears. Every checkbox and radio in the application, switches aside, is one size
(`--control-check-size`), so a choice does not change how large its control is
between screens. What an option was built from is a row of status
pills: a value the learner chose is a plain pill, a value code chose is the
dashed pill, and an event code chose is a plain pill led by a turn glyph and its
visible word, so colour never tells it apart. An option the learner changed says Edited. Only the picked
option offers Edit, a ghost action that turns its text into a field and becomes
Done. A Regenerate in the card heading rewrites every option the learner has not
edited; an edited option is the learner's text and is never replaced.

While options are being written the card names the wait in words — "Writing
three plots…" — where the options will appear, and the commit is disabled. Options
already on screen stay where they are, inert, until they are replaced. This is
not a skeleton: nothing is drawn that pretends to be content.

### Sliders

An approximate value on an ordered scale — story length, the reader's text size —
is a **slider row**: its value as text at the end of the label line, and the
track under it. There is one look for every slider (R20): one track, no ticks
(a mark with no label is decoration; the value line says where the thumb is),
one thumb with a ring of the ground. A range is **one slider with
two thumbs**, never two sliders. Where the exact value matters, the value is a
field in a dialog instead.

### A glyph beside text that wraps

An icon, radio, or checkbox that leads text which may run to several lines sits
on the **first line**, centred in it, never on the middle of the block and never
by a nudge written for that one row. A radio or checkbox takes
`--control-check-offset`; an icon takes the shared `mn-lead` class, which holds
it to the height of one line. Both measure the line with `lh`, the height of a
line of the element's own text, so the glyph is set in the same size as the text
it leads and nothing else is needed. A hand-tuned margin is how a row and its
neighbour end up a pixel apart, and how a text-size change drifts the glyph off
the line it was lined up with.

### A choice that makes saved work stale

Changing the reading level makes every stored grammar analysis out of date, so
choosing one is a draft: the ladder is a page of its own, tapping a card opens
its example and marks it chosen, and only **Save level** commits it. Leaving
without saving keeps the level that was there. The chosen card alone shows its
example so the ladder stays scannable; that costs nothing because choosing is
free. The commit is the page's one filled control and stays in reach at the
foot of the viewport while the ladder scrolls under it.

### App-level overlays and sheets

Everything that floats over a page is one of **five kinds** (R23), and the kind is
decided by what the learner is doing in it, never by the screen it is on:

| Kind                  | What it is for                                                                                                     | Wide viewport                                                      | Small viewport                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------- |
| **Menu**              | A short list of commands or destinations: a new story, a story's actions                                           | Hangs from its trigger, as a dropdown does, fitted to its commands | The same                                 |
| **Dropdown**          | Choosing one value from a short list: any select                                                                   | Hangs from its row at the card's width, capped                     | The same                                 |
| **Task dialog**       | A form or a task in steps: adding words and every step of it, the OpenRouter key, a typed value, Filters, renaming | A centred card over a scrim: header, body, footer                  | A bottom sheet with a handle             |
| **Searchable picker** | Choosing from a long list people search: a model                                                                   | A task dialog of fixed height, search pinned at the top            | A full-height bottom sheet with a handle |
| **Confirmation**      | A question with a safe answer before something is lost, or a notice that needs an answer                           | A centred card over a scrim                                        | Docked to the bottom edge, no handle     |

All four are drawn from **one overlay surface**: one fill, one edge, one radius,
one elevation, the card's inset as padding, and one scrim behind a modal one —
the overlay roles in the tokens, applied by the shared surface whatever holds it
up. A menu and a dropdown wear the surface without its frame, and share one
padding, one inset row, one placement, and one motion between them; only a
menu's width differs. A menu has a separator only at a real split, such as
before a destructive command. A task dialog and a confirmation share the frame as well: a
**header** with the title, a back arrow when the step is below the first, and a
close on a wide viewport; a **body** that is the one scroller, with anything that
must stay put while it scrolls pinned above it; and a **footer** of actions. Docked to a
phone's edge, the same surface spans the width with the sheet radius on top.

The footer's actions end at the inline end: the primary is the rightmost, the
quiet secondary sits left of it, and a reset or a destructive branch goes to the
far start as a ghost or danger button. A borderless action at either end gives
up its padding outward, so its label keeps the surface's inset. Docked, the
actions share the width, side by side while they fit and stacked when they do
not. A task dialog has **no Cancel button**: its ways out are the close, Escape,
the scrim, and on a phone the handle, all of which discard what it was drafting.
Its commit goes through its own primary action.

An overlay anchored to a trigger never leaves the page's column. It starts at
the trigger's start edge, and where it would leave the column from there it ends
at the trigger's end edge instead (a field or an icon at the column's end). The
choice is made once, by the shared placement, for every dropdown and every menu
alike.

A **menu** is never a form: as soon as a panel holds a field, it is a task
dialog. A **dropdown's** trigger is a choice row, so a card of settings has one control
language. A choice of a few named options that must be compared at a glance is
not an overlay at all but a segmented control or a radio list in place.

Modal surfaces use the CDK Dialog pattern or a native popover that behaves like
it: focus moves into the surface, is held there while it is open, `Escape`
dismisses it, and focus returns to the control that opened it. A confirmation
opens with its safe answer focused. A text field is one border: focused, 2px in the focus colour with no offset ring; wrong, 2px in the danger colour with or without focus. Footer buttons keep their natural width on every size, ghost at the start and primary at the end. A docked sheet lifts above the on-screen keyboard and is
never taller than what can be seen, so a field in it, and the picker's list,
stay in view.

Add words and Story options are the task dialogs held up by a native popover
rather than a CDK dialog, because Add words must stay open while a file chooser
is up and Story options is opened from the reader's header. That is a mechanism,
not a kind: on a wide screen each is a centred task dialog over a scrim like any
other, its sub-steps take the back arrow in its header, and on a phone it is a
docked sheet. Escape, the close, the handle, and a press on the scrim all put it
away and return focus to what opened it.

The reader has one exception, on the shared surface: a word's or a sentence's
details stay **anchored to the word** on a wide screen, because the word is what
they are about. **Story options** is a task dialog like any other — a centred
card on a wide screen, a docked sheet on a phone. Inside, it is flat: each group
is a label on the rows' text edge (`mn-dialog-group`) over rows with hairlines
between them, and what a group has to say about itself is one status line under
its rows, never cards nested in the dialog.

Every docked content sheet carries the same grab handle, whatever surface it is
built on, because the handle is its gesture way out. Confirmations and notices
are the one exception, described below. Dragging the handle down dismisses the
sheet and a plain press does the same; either discards whatever the sheet was
drafting, exactly as dismissing it from outside would. A sheet that commits its
draft does so through its own primary action, never through the handle.

The gesture is read the way a phone reads it. The sheet follows the finger
exactly while it is held. Letting go answers with the same two outcomes a
native sheet gives: a drag that went far enough, or a downward flick of any
length, sends the sheet away, and anything less settles it back against its
edge. Speed counts because a short flick is how a sheet is usually put away,
and a sheet that waits to be dragged the full distance feels deaf to it.

Every overlay arrives and leaves; none is cut in or out. A menu and a dropdown
fade in from their trigger with a few pixels of travel and fade back out; a
centred dialog or confirmation fades in over the page and fades back out; none
of them changes size on the way. A sheet leaves by its docked edge. A surface
that is leaving keeps the layout it had while open, so rows never reflow as it
fades. However it is dismissed — the handle, the backdrop, Escape, a close, a
commit, or a confirmation's own answer — the surface leaves first while the
scrim fades with it, and only then does the dialog close and report its result.
A native popover does this through its own transition; a CDK dialog, whose
element the CDK would otherwise remove at once, animates itself out first and
takes over the backdrop and Escape dismissal to do so, so a dialog's answers go
through its frame rather than straight to the CDK. A second dismissal during the
departure is ignored. With reduced motion it closes at once.

A confirmation or notice that is docked as a sheet already has its own way out,
Cancel, Keep it, or Continue, so it carries no grab handle. Escape and a press
on the backdrop still dismiss a confirmation; the alpha notice is dismissed only
by Continue. Like any docked sheet it stays within the viewport, scrolls when its
content is taller, and leaves room for the system gesture area below it.

### Saved-story controls

The reader header has Back, Listen, and Story options. The story's full title is
the page heading above the reading, in the page-title token, wrapping as far as
it needs. Once that heading has scrolled beneath the header, the header repeats
it on one truncated line; the repeat is hidden from assistive technology, so the
heading stays the one title. Unlike a page header, its hairline lower edge is
always drawn, so the header stays distinct from what begins beneath it. It
carries no
story progress marker: the reading surface and audio transport already expose
the positions they can report accurately. Appearance, preparation, and
maintenance share Story options rather than separate header buttons. It is a
task dialog (see Overlays): a centred card on a wide screen and a docked sheet on
small screens, it stays within the viewport, scrolls when necessary, and restores
focus when dismissed. Its mobile grab handle uses the same shared dismissal: a
downward drag closes the sheet, and a plain press on the handle does the same for
keyboard and touch users.
Reading appearance is the text-size slider row and the switch rows (Furigana, Word
spacing, Sentence per line, and Warning markers), and story content is one list of
rows. Deleting the story itself is not here: it is on the library card, which is
the one place it lives.

A content layer is the rows of one setting (`mn-settings-cluster`): its name with
its state under it, in the row's own words and never in a pill; then, where there
is something to do, one action row in the accent colour (Translate story, Add
notes, Continue, Stop, Retry remaining), a row that leads to the Settings page that
fixes it, or a link to the credit page; then, where something is saved, a danger
row that opens a confirmation naming what goes (Clear translation…, Delete
audio…). A row that waits on a setup says so in its line and leads to the right
Settings page. When every layer waits on the same setup, it is said once, as the
group's one status line with the way forward as its link, and the rows say only
"Not set up".

Reading appearance contains immediate device-wide preferences. Content for this
story shows saved results and explicit verbs: Translate story, Add notes,
Continue, Stop, and Retry remaining. Ready is a status, never a switch, and it
is the whole status once a layer is finished: a count says what is still
missing, so a full set prints Ready rather than the same number twice. Closing
the panel leaves background work running. Progress, failures, and the recovery
actions for the text layers stay in this panel, beside the layer they affect;
status changes use the row's accessible announcement. A refused key offers Check
settings and an unpaid account the OpenRouter credit link in place of a retry; the
stop stays until the learner has seen it and leaves, or comes back from the credit
page. There is no second
generation status line in the reader header. Every deletion is confirmed. The
panel carries no standing cost note.

Audio is the exception, and its row here is a report and a Delete: generating,
stopping, retrying and setting up a voice all live on the player, which is the
card the learner is looking at while any of them matters. One action belongs to
one surface, and audio had grown a second set of the same controls on a panel
that has to be opened to reach them.

The player also carries one compact text control for local reading speed. It
shows `1×`, `0.9×`, or `0.8×` and cycles forward on each press. It sits
beside the mode control, keeps the same touch target and ghost-button treatment,
and exposes the full accessible name — for example, “Reading speed, 0.8 times”.
At `1×` it reads “Reading speed, 1 time”. It changes playback immediately and
never starts regeneration. Stored clips whose pace is already baked remain at `1×`.

### Reader gestures and details

One gesture means one thing, and it is decided while it is being made.

| On a touch device            | What happens                            |
| ---------------------------- | --------------------------------------- |
| Short tap on a word          | Its details open at once                |
| Tap the same word again      | The details stay exactly as they are    |
| Tap a different word         | Its details replace the open ones       |
| Hold a sentence for 450ms    | Sentence details open, under the finger |
| Hold the same sentence again | The details stay open                   |
| Short tap on anything else   | Whatever is open is dismissed           |
| Drag on the reading          | The page scrolls; an open sheet stays   |

The held press applies to words, furigana, punctuation, and the leading around
them alike. There is no double tap. A press is cancelled by movement past 10
CSS pixels, a second finger, a scroll before it fires, cancellation, or the
window losing focus. A press that fired consumes only its own release and the
click made from it. Mouse clicks, native desktop text selection, and keyboard
navigation are unchanged.

Because that press is the application's gesture, the reading surface gives up
native text selection and the platform's long-press callout **on touch and
nowhere else**. Text in details stays selectable — but never to the press that
opened them. A sheet arrives under the finger still holding the line, and the
platform would finish that same press as a selection over whatever it now finds
there, so on touch a sheet starts inert and accepts selection only once that
press has ended: selecting its text is a second, deliberate hold. Scrolling and
pinch-zoom stay native. Copying a sentence with a finger is the sentence card's
Copy action; when the clipboard is unavailable, the card prints the Japanese
source as selectable text and keeps offering Copy.

Sentence details also have a visible route from a word lookup: an unlabelled
arrow that branches off and turns up sits on the headword's own row, at the
ordinary touch target, with a tooltip and the accessible name "Sentence
details". No icon draws a sentence, so it draws the relationship instead: the
sentence is the level the word sits inside, not the next thing along. Grammar in
word details is always readable — each rule once, title and full explanation
together, with no fold to open.

An anchored card closes from a small control in its own top corner, overlapping
the card's padding so it costs no vertical space and the content still leads with
what the reader asked for. Only the card's leading row is inset to clear it. A
docked content sheet carries no such control: its grab handle is both the affordance and
the way out.

On a small screen, word and sentence details are independently scrollable
bottom sheets, at most half the viewport tall. Sheets and the docked player use
a more generous top radius than ordinary cards so the edge reads as a temporary
surface rather than another section of the page. Their bottom edge is the
measured top edge of the docked audio player, and their height is the smaller of
that cap and the remaining space above that boundary with the standard top gap.
The player and the sheet account for the safe-area inset once. Opening or
closing the player, resizing it, and changing the viewport remeasure that
boundary. A sentence card keeps its grab handle and its action tray visible
while the translation, warnings, and grammar scroll between them. Both are
full-bleed and opaque to the card's own edge, so nothing scrolls visibly past
them: a card whose content ends in a sticky footer gives that footer the card's
bottom padding, exactly as a docked content sheet gives its grab handle the top one. A
sticky row stops at the content edge, and padding left on the card behind it is
a strip the content shows through.

An open sheet never covers the line it explains: the reading scrolls just far
enough to clear the pressed line, reserving temporary room when the press was at
the end of the document, and stops correcting as soon as the reader scrolls
themselves.

## 4. Colour

Monosai's palette is warm paper, a muted sage as the action colour, a lavender
accent, and restrained warning tones. That warmth is **identity, not decoration**
— it is what makes a page of Japanese feel like something to sit with rather
than a form to complete. It stays.

Colour carries meaning in exactly three places:

1. **Action.** One colour means "this is the thing to press."
2. **Status.** Success, warning, and danger, each with a soft companion for
   backgrounds.
3. **The reading surface.** Two markers — vocabulary and grammar — plus the
   tint on the sentence being read aloud and the tint on the open sentence or
   word.

The reading surface is the strictest. It may carry those colours and no others.
A new thing worth marking in the Japanese is a change to this document, not a
new token, because every added marker is subtracted from the text's own
legibility.

Colour is never the sole carrier of meaning. The two reading markers are drawn
as squiggles as well as colours; status is named as well as tinted.

Each tone has one meaning (R45), and the lavender accent is not a tone: it marks
no status and nothing pressable, so a lavender Unread badge or favourite star is a
defect. The favourite star uses the action colour. A token that changes is
changed in the Android bridge too, in the same commit (R47).

## 5. Typography and units

### Type

UI text uses a local system sans-serif stack. Japanese uses a system Japanese
gothic stack. An identifier the learner has to copy character for character — a
model ID, an error code, a config key — uses a local system monospace stack, so
that case and punctuation stay legible. No font is downloaded, ever — a reading
application that cannot render Japanese until a network request completes is not
local-first.

The one display face is the wordmark: _monosai_ in Pacifico,
ものさい in Zen Maru Gothic Black. It ships as outlined SVG paths, not as a
font, and it is never used for text.

The type scale is small on purpose: rank is carried by **size and weight within
one scale**, not by a second system. All-caps micro-labels are not part of the
language. The shared page or surface title uses the semantic
`--text-page-title` token, a section uses `--text-xl`, and a group inside a
card takes the small group title. Body copy uses `--text-md`; metadata and
supporting copy use `--text-sm` or `--text-xs`; the Library hero uses
`--text-display`. Weight follows the same hierarchy through the regular,
medium, semibold, and bold weight tokens.

Three ranks exist: the page or surface title, the section within it, and the
group within that. A fourth rank means the surface is doing too much. A group
whose contents are self-evident takes no heading at all.

Line heights are unitless, so they scale with whatever font size they land on,
and they come from one short scale of tokens — tight, snug, normal, relaxed, and
prose — rather than from a number chosen where the text is set. Two values less
than a twentieth apart are one value; a component that finds the scale a hair
off for its text takes the nearest step. The exceptions are tuned by eye and
say so where they are set: display numerals, and the reader's own leading. The reader's leading is deliberately looser than prose needs: it is the room
furigana occupies and the whitespace a sentence is pressed in. It eases off as
the learner's scale grows, because what matters is the resulting gap, not the
ratio.

### Units

This is the part of the design system that decides whether the application is
usable by someone who has changed their device's text size. Each unit expresses
a different intention, and using the wrong one silently removes a setting from
the user.

| What                                | Unit                     | Intention                                                         |
| ----------------------------------- | ------------------------ | ----------------------------------------------------------------- |
| All type, UI and reader alike       | `rem`                    | Honour the browser and OS font-size preference                    |
| Spacing and layout gaps             | `rem`                    | Layout breathes with the text rather than cramping around it      |
| The reading measure                 | `em`                     | Hold characters-per-line constant across the learner's scale      |
| Breakpoints                         | `em`                     | Layout changes when the _text_ outgrows the width, not the window |
| Borders, hairlines, shadow geometry | `px`                     | A one-pixel rule is one pixel; tripling it at 200% is a defect    |
| Touch-target floor                  | `px` floor, `rem` growth | A physical minimum that may grow but never shrink                 |
| Full-height surfaces                | `dvh`                    | The viewport a mobile browser actually leaves after its chrome    |

Four rules follow from that table, and each of them is a thing not to do:

- **The root font size is never overridden.** `html` keeps whatever value the
  user chose, and no element pins a fixed base size for the document to inherit.
  A single `font-size` in pixels on `body` disables the font-size preference for
  the entire application while leaving every automated check passing.
- **No viewport units in type.** Type sized in `vw` does not respond to browser
  zoom, which is a documented WCAG failure. Monosai has no need for it: the
  learner already has a direct text-scale control, which is a better mechanism
  than inferring their intent from window width.
- **The reading measure is expressed in the reader's own text size.** A measure
  in absolute units holds the line width fixed while the type grows inside it,
  so the learner who enlarged the text most gets the fewest characters per line
  — the opposite of what they asked for.
- **Breakpoints are a named, closed set.** Every width rule uses one of them.
  A one-off width invented for a single component is how an application ends up
  with a dozen breakpoints that disagree about where the phone stops.

## 6. Adaptation

**A component adapts by fitting, not by asking.** It is built from flexible
layout that works at any width it is handed, wraps when it must, and permits its
children to shrink. It does not consult the window to decide how to arrange
itself.

Width breakpoints decide only **where a component sits**: docked to an edge,
anchored to a word, centred in the column, stacked below the fields instead of
beside them. They never decide internal composition.

A component that needs to know its own width to compose itself has not been
built to fit yet. When that is genuinely unavoidable, the fix is a container
query on that one component — asking about its own box rather than the window —
and not a new viewport breakpoint, which would be a lie about what the component
depends on.

Placement rules are the small set of cases where the viewport is the honest
question: a bar docked to the bottom edge is docked to the _viewport's_ edge, and
a sheet bounded to a fraction of the screen is bounded by the _screen_.

## 7. Motion

Motion is functional first: it shows where something came from, that something
is still working, or that a value changed. It is quick and it settles; nothing
bounces, overshoots twice, or drifts. Arrival decelerates into place and
departure accelerates away, which is what makes the same distance read as
settling one way and leaving the other. A surface that is cut away between
frames reads as a fault, not as an answer — and so does one that appears from
nowhere.

**Motion is defined once** (R44). Every duration, easing, distance and scale is a
token, and [`_motion.scss`](../../web/src/styles/_motion.scss) turns them into a
small set of **named motions**; every keyframe lives there and nowhere else. A
primitive includes the named motion its job calls for; a feature never writes a
transition, an animation, a duration or a curve, and the style scan rejects one
written by hand anywhere outside that module. A new kind of movement is a new
named motion there first, and then a use of it. Durations name how long a thing
may take — a state settling, a surface moving, one slow movement, a turn, a
breath, a loop, a toast's stay — and easings name the kind of movement: a state
change eases out, a surface settles, a sheet arrives decelerating and leaves
accelerating, and what runs without being asked eases in and out.

Which named motion applies is decided by what is happening, never by the
screen:

| Named motion        | When                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **state**           | A control, a row, a field or a menu item changes colour or tint: hover, press, focus, selection, a chip being chosen |
| **enter**           | A message or block arrives where it will stay: a notice, a field's error, an outcome, the working line               |
| **reveal, conceal** | A banner arrives at the top of the window and later leaves: its row opens and closes, so the page moves once         |
| **dialog**          | A centred task dialog or confirmation fades in over the page, and fades back out when put away                       |
| **grow**            | A centred dialog held by a native popover (Add words, Story options) fades in, and back out, never resizing          |
| **drop**            | A menu or a dropdown fades in from the trigger's side — down from above, up from below — and back out                |
| **sheet**           | A docked sheet rises from its edge and goes back down it, continuing a drag from where the finger let go             |
| **scrim**           | The page behind a modal surface dims as it arrives and clears as it leaves                                           |
| **expand, turn**    | A disclosure opens or closes its height; a list row's chevron turns to say it is open                                |
| **step, fill**      | A form in steps moves: the new step arrives from the side travelled to, and the step row's rail fills                |
| **draw**            | A success check draws itself once                                                                                    |
| **spin**            | A glyph that draws work going round turns while that work runs                                                       |
| **breathe, pulse**  | A busy control, or a wait with no stages to name, breathes                                                           |

Pages replace each other instantly; motion never sits between a tap and the
next page.

**A press is colour, never movement** (R40). A button, a chip, a row, a menu item or a
switch answers a finger or a click with a pressed tint drawn from the shared
tokens, on touch as well as with a mouse; it never scales, bounces or shifts,
and nothing changes width, height or layout while it is held or let go. A choice
that is set simply takes its new state with the state motion: nothing pops, and
no easing overshoots. The browser's own tap flash is switched off once, for the
whole document, so the pressed tint is the only feedback; a row that wraps a
switch does not tint, and only the switch's track and thumb change. A busy
control's turning glyph is the one shared
busy behaviour — any refresh, sync, retry, check or test whose button holds a
turning glyph turns it while its work runs, from the button's own busy state,
with no code of its own. The full home illustration of an empty library arrives
once with the page; nothing on the application moves perpetually for
decoration.

A control that starts work keeps its label and its size while it works: the
glyph turns and the control breathes, and a result that follows is given its
line when the work starts, so it arrives into room already kept for it. Work
that answers instantly is still held busy for a perceivable moment; a busy
state that lasts a single frame reads as a flicker.

A disclosure opening is the one change of size that animates, because the fold
pushes what is below it either way and a height that jumps reads as a fault.
Otherwise **only paint properties animate**. Opacity, transform, colour, and
clip move without asking the layout to be worked out again; width, inset,
margin, and padding do not animate, however small the change. A bar that fills
is drawn full width and uncovered up to its fraction by a clip, which keeps its
rounded ends where a scale would squash them; a selection that slides is one
shape moved by a transform; a word that reveals is uncovered the same way; a
thing that changes width keeps its box and changes what is shown of it.

Beyond that, **a little character is allowed, and only on apparatus**: a settle
on a surface arriving, a check drawing itself. The budget for it is small and it
is spent on things the learner acts on or waits for.

A **count the learner has earned rises when it changes**: the Library's standing
line counts up to the number of words they know whenever a sync finds words they
did not have. It does not rise on arriving at the screen, on a reload, or on
returning to it — nothing moved, and a rise there competed with the sentence the
number sits in for the learner's attention. The moving number is hidden from
assistive technology while it moves, and the settled value is what is read, so a
rise never states a count the learner does not have.

The wordmark is the one flourish outside that: the word spins like a slot reel
through its romaji and kana spellings and lands on one of them — never a mix —
once per launch, and again only when the learner taps it. It is never replayed
on returning to the Library.

The reading surface is exempt. Nothing on it moves, under the pointer or
otherwise — hovering a word or a sentence changes its colour and nothing
else. The colour of a word or sentence may fade at the fast duration, because a
fade is feedback to a state and shifts nothing; position, size, and layout never
animate there. A page of Japanese that shifts while being read is unreadable.

Every non-essential transition is removed under `prefers-reduced-motion`,
including the expressive ones, and it is removed **in one place**: the motion
module cuts every timed animation and transition to a single frame, so no component carries a reduced-motion rule of its
own for movement. What a still screen still needs is decided there too — the
working line shows its dots, a toast simply stays. Character is the first
thing cut, not the last. The setting is read live: a component that decides in
script asks the viewport service, which follows the system, rather than reading
the media query once. A top bar's edge that fades in as the page scrolls is
driven by the scroll position, not by time; it moves nothing, so the reduction
leaves it as it is.

## 8. Words

### Voice

Plain and short by default. State what is true and what to do. No exclamation,
no reassurance where nothing was at risk, no personality in a label.

There is one second register: **anything that touches the learner's own text,
their money, or work that might be lost gets the extra sentence** saying what is
safe. A local-first application failing to save is precisely where terseness
reads as indifference. That sentence says what survived, in the concrete — not
that an error occurred.

Sentence case everywhere: page titles, section headings, group titles, buttons,
menu items, labels. Title case is not a rank and is not used to mark one, and
neither are capitals: there is no uppercase label anywhere in the application.
A fragment that needs ranking below the heading above it is a group title.

### The prose budget

Standing explanatory text exists only where **money, network, or data loss is at
stake**. A hint under a control that merely restates the control's own label, or
describes what a section obviously contains, is removed rather than reworded.

Four exceptions:

- **Help is a prose surface, and it is a guide rather than a page.** Its job is
  explanation: static, local English guidance in one readable column, with
  section headings, short paragraphs, and links close to the actions they
  explain. `/help` carries what the application is for, what it is not for, and a
  shelf of topics; each topic is its own route below it, wearing the shared page
  frame with Back to Help and ending in its neighbours. The measure and the prose
  elements live in `mn-prose`, so a topic page writes words and nothing else.
  Two options being compared are a card each, never a table: the figures are few,
  the prose beside them is long, and a table of that shape either scrolls
  sideways on a phone or breaks a model ID down to one character a line. A guide
  row is the one shelf row whose secondary line may wrap past one line, because
  it says what a topic answers rather than what a thing contains.
  A quiet, non-modal first-use notice offers Help on a non-reader
  surface without moving focus or covering the app: one sentence saying what
  the guide is, the way to it, and a quiet dismissal, as the page's first block
  under its bar. Dismissal records the preference for this local installation;
  the guide remains among the Library's utilities. Reader deep links are never
  interrupted. See [ADR 0079](../decisions/0079-help-is-a-hub-of-topics.md).

- **Empty states teach.** An empty surface has nothing but words to work with,
  so any empty list explains what belongs there and how to fill it. The
  exception ends the moment the surface has content.
- **The first run introduces the application.** An empty Library is what a
  stranger opening the public address sees, so its headline says what Monosai
  is for before anything asks them to act; a standing of nothing — "No words
  yet." — is not a headline. The way in is **one first-steps card**
  (`mn-checklist`): numbered steps in order, each a row that leads to where it
  is done, each showing where it stands — a finished step wears a tick and goes
  quiet, the next step is the screen's one primary action, and a step that
  cannot be done yet is dashed, is not a link, and says what it waits for as
  its state rather than as advice. The steps are read from the same checks that
  block Generate, so the two never disagree. A way round the steps that needs
  no setup sits beside them, visibly secondary; the guide and the one promise a
  stranger needs — nothing leaves the device — are the card's foot, so the
  page-top offer of the guide is not shown beside it. While the card is there,
  the shelf's two ways in are not: two ways in with no order is what the card
  replaced. It ends, like any empty state, the moment there is a story — or
  once a story could be written, when the two ways in are the primary action again
  and the empty shelf says what will fill it.
- **Release-stage disclosure.** A new alpha installation may require one short
  acknowledgment before use. This is a product disclosure rather than Help;
  it is persisted locally and is not shown again after acknowledgment.
- **Failures explain.** A failure states what happened, what is unaffected, and
  what to do next, however quiet the surrounding screen is.

A format used in two places is used the same way in both. A counter, a count, a
character limit, and a duration each have one form across the application.
Character counters stay hidden until a field is roughly 80% full, then remain
visible and are always shown when the limit is exceeded. A hidden counter is
also omitted from that field's accessible description.

### Numbers, dates, and one locale

Monosai is written in English and only in English: every label, hint, and error
exists once, with no translation layer, under `<html lang="en">`. **Numbers and
dates are therefore both formatted in `en`, explicitly, and never in whatever
locale the browser happens to carry.** Following the browser for one and not
the other is what produced `31.8.2026, 17:26:40` beside `72 unique expressions`
on the same page, and a `50,000` character limit on a browser that writes
`50.000`.

The formatters live in `web/src/app/domain/shared/locale.ts` and nothing else
formats a number or a date:

- **A count** is grouped: `3,118 characters`, `50,000 characters`. The singular
  is used for exactly one: `1 character`.
- **A day** is `Aug 31, 2026` — a named month, because `8/31` and `31/8` are
  the same six characters read two ways.
- **A day with a time** is `Aug 31, 2026, 5:26 PM`. Seconds are not shown; no
  screen has ever needed them.
- **A recent day** is said in words — `today`, `yesterday`, `3 days ago` — and
  falls back to the date once counting days stops being useful.

Calling `toLocaleString()`, `toLocaleDateString()`, or `toLocaleTimeString()`
with no locale argument is a defect anywhere in the application. Japanese is
content, not a format: it is never passed through these, and it carries
`lang="ja"` where it is rendered. See
[ADR 0042](../decisions/0042-cross-tab-reading-mutations.md).

## 9. State

### Reporting

A result appears **where it was caused** — beside the control that produced it —
and clears on the next action. There is no application-wide notification
surface.

What a result says is drawn one of three ways. A sentence that belongs to a
surface — a failure, a warning, a success, or a fact to know before acting — is
a **notice**: one anatomy everywhere — the tone's leading mark, the words, and
at most one action at its end, or one action and a quiet way to dismiss it,
kept together as one block. It arrives rather than popping in.

Each tone has **one meaning, app-wide**, and its mark comes with it:

| Tone        | Means                                                                        | Drawn as                                                        |
| ----------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Error**   | Something failed                                                             | Danger ground and words, warning mark                           |
| **Warning** | It can go ahead, but the result may be limited or wrong unless you act       | Warning ground and words, warning mark                          |
| **Setup**   | Something has to be set up before this works; the way to do it is at its end | Plain ground, warning-coloured mark — the look of a blocker row |
| **Info**    | A fact worth knowing before acting                                           | Plain ground, quiet info mark                                   |
| **Success** | It worked                                                                    | Success ground and words                                        |

The lavender accent is not a status colour: a setup step drawn in it read as a
decoration rather than as what stands in the way. A short word that
says where something stands — Ready, Unread, Test failed, a word's form — is a
**status pill**, which is never pressable and so never takes the action colour.
Pills are for shelves and plots, plain unless they say success, warning or
danger — the lavender accent is never a pill; settings rows show status as text (see Status
is a line, not a chip).
Its dashed variant marks a value code chose rather than the learner; the dash,
not a colour, is what says so.
What is wrong with the value of one field is plain danger-coloured text directly
under that field, led by the warning mark and named by the field's
`aria-describedby` — not a notice, and one message: a field over its limit says
the count and the fix in one sentence, never on two red lines.

**Toasts are for work the learner did not trigger**: a background vocabulary
refresh that changed something, an update becoming available. That is the whole
of their remit. A toast for an action the user just took reports a result
somewhere other than where they are looking. Retry on the vocabulary sync banner
is the one exception: the button leaves with the banner, so the toast is the only
report of an update it brought in.

Every state change that is visible has a screen-reader equivalent, whether or
not it is expressed in words on screen. The player normally prints no status
prose and still announces its position, because the reason for the silence is
visual economy, not secrecy. Its one bounded exception is older playable audio:
it prints a single notice that some audio is from older settings, with a Settings
link only when the configuration is not ready. When it is ready, the existing
Generate action is the recovery control, so the notice never grows a duplicate
button.

**A request the browser can decline reports every answer it has.** Granted,
declined, not available here, and could not be completed are four different
situations and get four different sentences; a control that leaves the screen
character-for-character unchanged has reported that it did nothing. The report
says what the browser did, never what it will do — "it may grant this later" is
as far as a promise about browser behaviour is allowed to go, and a retryable
request stays enabled to match.

### Waiting

Work that resolves quickly is shown **on the control that started it**: the
control holds the waiting state, and nothing else on the page moves. Nothing
appears or disappears while waiting, so a surface is laid out identically before,
during, and after. The control holds it as **busy** (`aria-busy`, above): the same
element, in the same place, with the same fill.

Work that takes longer than a few seconds **names its current stage**, in the
learner's terms rather than the pipeline's. A stage name is what is happening
now, not a percentage of an internal step count. Where a real count exists it is
used; where one does not, none is invented.

Skeleton placeholders are not used. Monosai's slow work is generation and
analysis, which have no shape to promise in advance.

**Work the learner walked away from keeps a row where its result will appear.**
A story being written is a Library row of the same shape and height as the
story it will become, so the shelf is laid out identically before, during, and
after. The row is a story row and states in words, leading its line, both that it
is not a story yet and which stage it is in. It leads back to the screen that shows the run
in full. A run that stopped without producing anything keeps its row, marked as
needing attention, until the learner dismisses it: work they were not watching
when it failed is not allowed to disappear.

### Irreversible actions

Anything irreversible **asks first**, in a dialog that names the specific thing
being destroyed, after a destructive row (never an inline fold with a second
"Continue?" step). Undo is not used as a substitute: it requires holding deleted
records in limbo, and the data model is better served by asking.

The dialog states what is being deleted and what is kept. Its confirming action
is labelled with the verb, never with a bare "OK".

### Empty and error surfaces

A state that replaces a whole page — a failure, something not found, a surface
with nothing on it — has **one anatomy**, in the page column at the top of the
page on the card surface: a mark that carries the tone (the danger colour for a
failure, the quiet sunken one for what is not a fault), a short title, one
sentence on what happened, one on what is safe or what to do, and the actions
with the primary first. Nothing about it changes between screens but its words.

An empty surface offers its primary action and explains what would fill it. An
error surface states what failed, what is unaffected, and the one action worth
taking — retry only where retrying could plausibly succeed unchanged. Where its
sentence names a place to fix it — Settings — that place is one of its actions.

The same failure is classified identically wherever it appears, and the action
is the one **this** surface can offer. A message that names a control the screen
does not have — the settings test, quoted mid-reading — is a broken action, not
a wording preference.

**A link lives beside the thing it unblocks, and nowhere else.** There is no help
section, no list of further reading, and nothing in a picker row that is working:
a link on a screen where nothing is wrong is a symptom. The exceptions are
narrow and stated — a claim the reader is entitled to check, such as an app
saying it only reads a collection, may carry the link that lets them check it.
Where a failure prints a technical code, the code carries the link that looks it
up. Every one of these opens in a new tab and says so.

## 10. Accessibility floor

The Android bridge is a native utility surface: one vertically scrolling column
of Android platform controls, light/dark system themes, scalable `sp` text and
`dp` spacing. It has no web renderer or independent decorative palette. Native
focus, touch targets, system-bar insets and permission/installer dialogs supply
the equivalent semantics. Start/Stop and permission are visible; origins live in
one labelled disclosure, and update status appears beside its action.

These are not aspirations; a change that breaks one of them is a regression.

- Text is resizable by browser zoom **and** by font-size preference, to 200%,
  without loss of content or function.
  A page heading other than the home wordmark wraps instead of ending in an
  ellipsis; a row's secondary line wraps at larger text sizes; a segmented control
  that cannot fit becomes a radio list; in a list row the badge, then the
  title, then an overview row's value each take a line once the row is too narrow
  to hold them side by side, so a word is not broken to fit. The `narrow-screen`
  e2e spec holds this for Settings, Generate, What you can read, Help, the
  Library and a source that could not be read, at 320px with 200% text, 320px
  with 100% and 393px with 150%. Only a long name in a list row, which ends after
  two lines, and a model name at normal size may still end in an ellipsis.
- Native semantics first. A button is a `button`, a disclosure is
  `details`/`summary`, a link navigates. ARIA supplements native elements; it
  does not replace them.
- Focus is always visible, against every surface the application has, in both
  themes. There is one focus ring: the action colour at its text strength, so it
  belongs to the palette, set off from its control by a gap of the ground so it
  shows around a filled action too. It is defined once, as a token, and reaches
  3:1 against every ground in both themes. A text field is the one exception: it
  shows focus as a heavier action-colour border and no ring, so the field never
  draws a doubled edge.
- Focus order follows visual order. Overlays trap focus, are labelled, close
  where closing is safe, and return focus to what opened them.
- Every icon-only control has an accessible name that states its current state
  where the state matters.
- Colour is never the only carrier of meaning.
- No horizontal page scrolling at the narrowest supported width.
- Both themes are checked at desktop and Android-sized viewports before a visual
  change is considered done.
