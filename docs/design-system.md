# Monosai design system

This document holds the design language: what Monosai's surfaces mean, which
choice applies when, and what each rule rules out. It is the authority for
*why* an interface looks and behaves the way it does.

It deliberately carries **no values**. There are no hex codes, no pixel counts,
no type scale, and no component API here, because a document that repeats them
goes stale the first time one is tuned. Values live in `src/styles/_tokens.scss`
and the shared control classes in `src/styles/_controls.scss`; this document
names the *roles* those tokens fill and the rules that govern their use. When
the two disagree, this document describes the intent and the tokens describe the
current state — reconcile by changing the tokens.

This document describes what any screen may do. What a particular screen does is
described by the screen's own code, and the structure it sits in is described by
[the architecture documentation](arc42/README.md).

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

## 2. Structure

### The column

Every page is **one centred column** at every width, with a bounded measure. A
wide window gives a page more margin, never more columns. This is a deliberate
refusal of the adaptive multi-pane layouts that desktop patterns encourage: the
reader is a single measure of Japanese, and a shell that reflows around it would
make the desktop and the phone two different applications to learn.

There is one exception. **A form may carry one narrow settings aside** beside
its fields on wide screens, where the settings frame a decision the fields
express — Generate's length and word-selection panel is the case this exists
for. The aside stacks below the fields when the width no longer supports it. It
is available to forms only; reading surfaces, lists, and prose never take one.

### Vertical composition

Pages are **top-aligned and grow downward**, like a document. Content is never
centred vertically and never stretched to fill the viewport. A short page leaves
the space below it empty, which is the honest result of having little to say.

### Density

Interactive targets are **one size at every width and every pointer**. There is
no denser desktop variant. A pointer-conditional target size requires knowing
the current pointer, and a hit area that changes during a gesture breaks that
gesture's own click (ADR 0032) — the cost of getting it wrong is larger than the
space it would save.

What may tighten on a wide viewport is the **vertical rhythm between sections**,
so a long settings page scrolls less. Targets, control heights, and the padding
inside a control do not change.

## 3. Controls

### The line between an icon and a label

An icon may stand alone when the control is **pressed repeatedly within a
session** and its meaning is fixed by that repetition — the reader header, the
audio transport, close, back, and overflow. Everything else carries a visible
label beside its icon: anything rare, anything destructive, and anything that
spends money or sends a request.

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
application.

### Appearance

Icon buttons are **bare at rest**: no border, no filled background, only the
glyph. Fill and border are reserved for hover, for press, and for the single
primary action of a surface — the play control in the transport, the primary
button of a form.

At most one control on a surface is filled. If two actions both look primary,
one of them is not.

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

A group sits with the thing it configures: on the form that starts the work, or
in the header of the screen that shows the result. It does not go into a list
row's action menu. That menu is a short list of things to do to a row, and a
shelf is for choosing what to open rather than for configuring each entry.

The track uses the sunken surface at rest and the action colour when selected.
A disabled switch stays visible and names, below the group, the exact state
that prevents it; generic setup advice is never substituted for an untested,
stale, or failed configuration. The whole labelled row meets the touch-target
floor while the switch itself stays compact.

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

## 5. Typography and units

### Type

UI text uses a local system sans-serif stack. Japanese uses a system Japanese
gothic stack. No font is downloaded, ever — a reading application that cannot
render Japanese until a network request completes is not local-first.

The type scale is small on purpose: rank is carried by **size and weight within
one scale**, not by a second system. All-caps micro-labels are not part of the
language. A group inside a card is named the same way a section of a page is
named, one step smaller.

Three ranks exist: the page or surface title, the section within it, and the
group within that. A fourth rank means the surface is doing too much. A group
whose contents are self-evident takes no heading at all.

Line heights are unitless, so they scale with whatever font size they land on.
The reader's leading is deliberately looser than prose needs: it is the room
furigana occupies and the whitespace a sentence is pressed in. It eases off as
the learner's scale grows, because what matters is the resulting gap, not the
ratio.

### Units

This is the part of the design system that decides whether the application is
usable by someone who has changed their device's text size. Each unit expresses
a different intention, and using the wrong one silently removes a setting from
the user.

| What | Unit | Intention |
| --- | --- | --- |
| All type, UI and reader alike | `rem` | Honour the browser and OS font-size preference |
| Spacing and layout gaps | `rem` | Layout breathes with the text rather than cramping around it |
| The reading measure | `em` | Hold characters-per-line constant across the learner's scale |
| Breakpoints | `em` | Layout changes when the *text* outgrows the width, not the window |
| Borders, hairlines, shadow geometry | `px` | A one-pixel rule is one pixel; tripling it at 200% is a defect |
| Touch-target floor | `px` floor, `rem` growth | A physical minimum that may grow but never shrink |
| Full-height surfaces | `dvh` | The viewport a mobile browser actually leaves after its chrome |

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
question: a bar docked to the bottom edge is docked to the *viewport's* edge, and
a sheet bounded to a fraction of the screen is bounded by the *screen*.

## 7. Motion

Motion is functional first: it shows where something came from, that something
is still working, or that a value changed. A sheet rises from the edge it
docks to. A generation fill breathes while requests are open. A control settles
into its new state rather than cutting to it.

Beyond that, **a little character is allowed, and only on apparatus**: a spring
on the play control, a settle on a popover arriving. The budget for it is small
and it is spent on things the learner acts on or waits for.

The reading surface is exempt. Nothing on it animates, and nothing on it moves
under the pointer — hovering a word or a sentence changes its colour and nothing
else. A page of Japanese that shifts while being read is unreadable.

Every non-essential transition is removed under `prefers-reduced-motion`,
including the expressive ones. Character is the first thing cut, not the last.

## 8. Words

### Voice

Plain and short by default. State what is true and what to do. No exclamation,
no reassurance where nothing was at risk, no personality in a label.

There is one second register: **anything that touches the learner's own text,
their money, or work that might be lost gets the extra sentence** saying what is
safe. A local-first application failing to save is precisely where terseness
reads as indifference. That sentence says what survived, in the concrete — not
that an error occurred.

Sentence case everywhere: page titles, section headings, buttons, menu items,
labels. Title case is not a rank and is not used to mark one.

### The prose budget

Standing explanatory text exists only where **money, network, or data loss is at
stake**. A hint under a control that merely restates the control's own label, or
describes what a section obviously contains, is removed rather than reworded.

Two exceptions:

- **Empty states teach.** An empty surface has nothing but words to work with,
  so any empty list explains what belongs there and how to fill it. The
  exception ends the moment the surface has content.
- **Failures explain.** A failure states what happened, what is unaffected, and
  what to do next, however quiet the surrounding screen is.

A format used in two places is used the same way in both. A counter, a count, a
character limit, and a duration each have one form across the application.

### Numbers, dates, and one locale

Monosai is written in English and only in English: every label, hint, and error
exists once, with no translation layer, under `<html lang="en">`. **Numbers and
dates are therefore both formatted in `en`, explicitly, and never in whatever
locale the browser happens to carry.** Following the browser for one and not
the other is what produced `31.8.2026, 17:26:40` beside `72 unique expressions`
on the same page, and a `50,000` character limit on a browser that writes
`50.000`.

The formatters live in `src/app/domain/shared/locale.ts` and nothing else
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
[ADR 0042](decisions/0042-cross-tab-reading-mutations.md).

## 9. State

### Reporting

A result appears **where it was caused** — beside the control that produced it —
and clears on the next action. There is no application-wide notification
surface.

**Toasts are for work the learner did not trigger**: a background vocabulary
refresh that changed something, an update becoming available. That is the whole
of their remit. A toast for an action the user just took reports a result
somewhere other than where they are looking.

Every state change that is visible has a screen-reader equivalent, whether or
not it is expressed in words on screen. A player that deliberately prints
nothing still announces its position, because the reason for the silence is
visual economy, not secrecy.

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
during, and after.

Work that takes longer than a few seconds **names its current stage**, in the
learner's terms rather than the pipeline's. A stage name is what is happening
now, not a percentage of an internal step count. Where a real count exists it is
used; where one does not, none is invented.

Skeleton placeholders are not used. Monosai's slow work is generation and
analysis, which have no shape to promise in advance.

**Work the learner walked away from keeps a row where its result will appear.**
A story being written is a Library row of the same shape and height as the
reading it will become, so the shelf is laid out identically before, during, and
after. The row is muted — secondary text on the sunken surface — and states in
words both that it is not a reading yet and which stage it is in; the muting is
never the only thing saying so. It leads back to the screen that shows the run
in full. A run that stopped without producing anything keeps its row, marked as
needing attention, until the learner dismisses it: work they were not watching
when it failed is not allowed to disappear.

### Irreversible actions

Anything irreversible **asks first**, in a dialog that names the specific thing
being destroyed. Undo is not used as a substitute: it requires holding deleted
records in limbo, and the data model is better served by asking.

The dialog states what is being deleted and what is kept. Its confirming action
is labelled with the verb, never with a bare "OK".

### Empty and error surfaces

An empty surface offers its primary action and explains what would fill it. An
error surface states what failed, what is unaffected, and the one action worth
taking — retry only where retrying could plausibly succeed unchanged.

The same failure is classified identically wherever it appears, and the action
is the one **this** surface can offer. A message that names a control the screen
does not have — the settings test, quoted mid-reading — is a broken action, not
a wording preference.

## 10. Accessibility floor

These are not aspirations; a change that breaks one of them is a regression.

- Text is resizable by browser zoom **and** by font-size preference, to 200%,
  without loss of content or function.
- Native semantics first. A button is a `button`, a disclosure is
  `details`/`summary`, a link navigates. ARIA supplements native elements; it
  does not replace them.
- Focus is always visible, against every surface the application has, in both
  themes.
- Focus order follows visual order. Overlays trap focus, are labelled, close
  where closing is safe, and return focus to what opened them.
- Every icon-only control has an accessible name that states its current state
  where the state matters.
- Colour is never the only carrier of meaning.
- No horizontal page scrolling at the narrowest supported width.
- Both themes are checked at desktop and Android-sized viewports before a visual
  change is considered done.
