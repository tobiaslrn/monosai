# Monosai design system

This document holds the design language: what Monosai's surfaces mean, which
choice applies when, and what each rule rules out. It is the authority for
*why* an interface looks and behaves the way it does.

It deliberately carries **no values**. There are no hex codes, no pixel counts,
no type scale, and no component API here, because a document that repeats them
goes stale the first time one is tuned. Values live in `web/src/styles/_tokens.scss`,
the named thresholds in `web/src/styles/_breakpoints.scss`, and the shared control
classes in `web/src/styles/_controls.scss` and
`web/src/styles/components/_button.scss`; this document
names the *roles* those tokens fill and the rules that govern their use. When
these disagree, this document describes the intent and the tokens describe the
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

### The non-reader utility bar

Every non-reader screen shares one compact application bar: the Monosai mark
and wordmark link to the Library, followed by Settings, Help, and GitHub in a
labelled utility navigation landmark. The wordmark may hide at the existing
narrow breakpoint. The Reader has no application bar and keeps its own controls.

These three destinations are an explicit exception to the repetition rule:
they are icon-only on both mobile and desktop, with accessible names and
tooltips. GitHub names its new-tab behavior. Local destinations identify the
current page. The bar sits in the document flow and uses bare shared icon
controls with unchanged touch targets and visible keyboard focus.

The Library is the home-screen exception. It uses the mark without the wordmark,
a Settings destination, and a reserved Search control so the opening surface can
stay as compact as the reading-first composition it introduces. Search remains a
no-op until the shelf has a real search interaction; it still keeps its native
button semantics, accessible name, tooltip, touch target, and focus treatment.
The home illustration blends into the canvas through an organic crop; the hero
is not a card and therefore has no panel boundary or elevation.
The crop follows the illustration's arch and low foreground, preserving the
whole reading character and books. Its proportions stay fixed as the column
changes width. The home headline is tightly set beside it, above a quiet sync
line. The creation action spans the column; filter pills share the available
width on phones and stay compact on desktop.
Home's primary action uses the shared primary action colour; the illustration is
gently dimmed in the dark palette.

**What you can read is composed like the Library**
([ADR 0063](decisions/0063-what-you-can-read-is-composed-like-the-library.md)).
Its overview, the vocabulary list, the reading-level ladder, and a source's page
wear no utility bar. Each has its own title row instead: Back, the title, and
Help at its end as a bare icon link, with one quiet line beneath the title that
says what the page holds or how much of it. They use the Library's rail and its
row surface — quiet raised cards (`.mn-card`) led by a soft round mark
(`.mn-icon-badge`) — and a section heading at the rank below the title, with its
one verb opposite it as green text rather than as a filled button.

Below the bar the Library states **where the learner stands** — how many words
Monosai can write from, and at what level. That line is the screen's lead and
also the way to the page that explains it. In the image-led home hero it remains
plain copy without a trailing navigation glyph; hover, focus, and link semantics
identify the interaction without interrupting the headline. It states current
facts and never becomes a control that changes them.

**A destination is named once per screen.** A masthead label that repeats the
sentence beneath it is not navigation, it is a caption, however it is styled.
Where a prominent line already leads somewhere, that is the door; a second link
to the same place in nearly the same words makes both harder to see.

### Vertical composition

Pages are **top-aligned and grow downward**, like a document. Content is never
centred vertically and never stretched to fill the viewport. A short page leaves
the space below it empty, which is the honest result of having little to say.

Settings uses the Library's compact rail rather than the widest form measure.
Each top-level group is one quiet raised card with a compact section heading;
actions use the same pill silhouette as the Library's filters and creation
control. Complex model fields may use sunken groups inside that card, but may
not introduce a second competing hierarchy of raised panels.

### Density

Interactive targets are **one size at every width and every pointer**. There is
no denser desktop variant. A pointer-conditional target size requires knowing
the current pointer, and a hit area that changes during a gesture breaks that
gesture's own click (ADR 0032) — the cost of getting it wrong is larger than the
space it would save.

What may tighten on a wide viewport is the **vertical rhythm between sections**,
so a long settings page scrolls less. Targets, control heights, and the padding
inside a control do not change.

### Rows on a shelf

A shelf is for choosing what to open, so a row answers that and nothing else. It
carries the name, one line saying what is inside, and — opposite the name — how
big the thing is and when it was last used. The row is one link, because a row
is not a place to configure anything. Where a row has a handful of things to do
to it, they live in an overflow menu; where what it opens is a surface of its
own, they live there and the row carries none
([ADR 0057](decisions/0057-one-anki-entry-and-a-page-per-source.md)).

The line saying what is inside prefers **what the content already says about
itself** over anything counted about it: a generated story states the premise
the learner wrote, and only something with no such sentence falls back to its
size and its origin. On a shelf the useful date is when you last picked
something up, not when it was filed, and something never opened says so rather
than substituting the other date.

Rows on one shelf are the same height, and a row standing in for work still
running matches the row it will become.

The vocabulary sources are one card of such rows, where the count joins the
line saying what is inside rather than sitting opposite the name, because a
source's name is long and the card is narrow. The card's last line reports how
current the sources are as a whole — when they were last read, or what is
stopping them — and holds the one control that can change that.

### Lists with filters

A list that helps the learner find a known item keeps one quiet column and a
compact toolbar: search first, the most useful quick filter beside it, and a
labelled Filters action for the less frequent choices. The current sort is
visible as one line of text, and the result count is both visible near the list
and announced through a polite live region.

Rows show the value that makes them recognisable, the meaning or secondary
line beneath it, and only the metadata needed to choose between rows. Where
every row carries the same few figures they are columns under a quiet header
row; the header is presentation, so each figure also names itself to
assistive technology. The columns are sized in `rem`, and a list too narrow
for them lays its figures under the value instead — a container query on the
list, not a breakpoint. A figure that says the learner still finds something
hard takes the warning colour, and the figure itself says so too. A row
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

The home Library is a compact shelf exception: date groups share one pair of
card edges, with quiet flat cards, a small circular mark, a system-sans title,
and a character count. A short Read or Unread badge and overflow sit opposite.
Read means opened, not completed; the last-opened date, origin and available
audio remain accessible metadata. Premises and filenames do not replace the
character count here. Long titles wrap without colliding with the badge.

## 3. Controls

### The line between an icon and a label

An icon may stand alone when the control is **pressed repeatedly within a
session** and its meaning is fixed by that repetition — the reader header, the
audio transport, close, back, and overflow. Everything else carries a visible
label beside its icon: anything rare, anything destructive, and anything that
spends money or sends a request.

There are exactly three deliberate exceptions: the non-reader utility bar's
destinations, described above, wherever they are worn; the trash icons on the
Story options content rows, described under Saved-story controls; and the
control that reads Anki again at the end of the vocabulary sources card. That
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
application.

### Appearance

Icon buttons are **bare at rest**: no border, no filled background, only the
glyph. Fill and border are reserved for hover, for press, and for the single
primary action of a surface — the play control in the transport, the primary
button of a form.

Text buttons share one pill silhouette, one touch-target height, one text size,
and one weight. The unqualified `.mn-button` is the secondary outline for an
ordinary reversible action. `.mn-button--primary` is the one filled action that
starts or commits the main work on a surface. `.mn-button--ghost` is action-colour
text without a border for quiet verbs such as adding a source, testing, or
previewing. `.mn-button--danger` keeps a destructive action outlined in the
danger colour and is used where confirmation follows. A surface has at most one
filled primary control; selected toggles use a soft selection tint instead.

Disabled controls are drawn with the sunken surface, secondary text, and a
distinct boundary. Opacity alone is not a disabled state: disabled must be
recognisable in both themes and must not resemble either an active secondary
outline or a selected control.

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
`mn-switch` in [`_controls.scss`](../web/src/styles/_controls.scss), wherever an
independent outcome is turned on or off.

The track uses the sunken surface at rest and the action colour when selected.
A disabled switch stays visible and names, below the group, the exact state
that prevents it; generic setup advice is never substituted for an untested,
stale, or failed configuration. The whole labelled row meets the touch-target
floor while the switch itself stays compact.

**A surface never shows a control the thing in front of it cannot answer.** A
file has no freshness to configure, so it does not get a disabled refresh
switch — it gets the sentence saying what it does instead ("A file never
changes"). A disabled control invites a learner to work out why; a sentence
tells them.

### Disclosures

A disclosure hides detail that is set once and rarely revisited — a mapping, a
list the learner is entitled to see but does not read. It is always
native `details`/`summary`; it is never used to hide a control the surface's
main action depends on, which is what a switch group is for.

**A closed disclosure states its current value.** The summary carries the label
and, opposite it, what is currently selected — a mapped field, a count of what
is inside. A fold that hides the answer to the question its label asks makes the
screen worse than no fold at all, and forces the learner to open every one to
read the page. Disclosures do not nest: a section that already sits behind one
presents its contents plainly.

Where a link can point inside a disclosure, arriving there opens it. A deep link
that lands the learner on a long page next to a closed fold has not arrived.

### A choice that makes saved work stale

Changing the reading level makes every stored grammar analysis out of date, so
choosing one is a draft: the ladder is a page of its own, tapping a card opens
its example and marks it chosen, and only **Save level** commits it. Leaving
without saving keeps the level that was there. The chosen card alone shows its
example so the ladder stays scannable; that costs nothing because choosing is
free. The commit is the page's one filled control and stays in reach at the
foot of the viewport while the ladder scrolls under it.

### App-level overlays and sheets

An app-level modal surface uses the CDK Dialog pattern: focus moves into the
surface, `Escape` dismisses it, outside dismissal follows the surface's
semantics, and focus returns to the control that opened it. The surface is a
centred card on a wide viewport. On a small viewport it becomes a bottom sheet
that is full width, owns its scrolling, and uses the sheet radius; it does not
need an anchor in the page underneath it. The backdrop and focus treatment are
shared, while the content decides whether its safe dismissal is Cancel, Close,
or a committed primary action.

Add words is the one sheet opened from a native popover rather than a dialog,
because it must stay open while a file chooser is up. It follows the same
placement — hanging from its control on a wide screen, docked to the bottom
edge over a dimmed page on a phone — and the same dismissal: Escape, Cancel,
and a press outside all close it, and Escape and Cancel return focus to Add
source.

### Saved-story controls

The reader header has Back, the title, Listen, and Story options. It carries no
story progress marker: the reading surface and audio transport already expose
the positions they can report accurately. Appearance, preparation, and
maintenance share Story options rather than separate header buttons. The
reader's panel is anchored on desktop and docked as a bottom sheet on small
screens; it stays within the viewport, scrolls when necessary, and restores
focus when dismissed. It follows the app-level overlay pattern above while
retaining its reader anchor.
Reading appearance uses compact switch rows, and story content is one quiet
grouped list with pill actions. Deleting the story itself is not here: it is on
the library card, which is the one place it lives.

A content row keeps its copy on one side and its controls on the other, and the
controls move as one block: on a narrow sheet they wrap together below the copy
rather than splitting a pill from the control beside it. A row's destructive
control is **the trash icon alone**, in the danger colour and bare at rest.

This is the one place a destructive control has no visible label, and it is a
deliberate exception to the rule above. Three of them run down one short list,
identical in shape, each in a row that already names the layer it clears, and
each opening a confirmation that says in full what is about to go — so the
press is not the commitment, and the trash can is the most reliably read symbol
there is. Every one carries the whole sentence as its accessible name and its
tooltip. Repeating the layer in the label instead produced three long red
phrases that wrapped on a phone. The exception does not extend to destructive
controls that stand alone or act without confirmation.

Reading appearance contains immediate device-wide preferences. Content for this
story shows saved results and explicit verbs: Translate story, Add notes,
Continue, Stop, and Retry remaining. Ready is a status, never a switch, and it
is the whole status once a layer is finished: a count says what is still
missing, so a full set prints Ready rather than the same number twice. Closing
the panel leaves background work running. Progress, failures, and the recovery
actions for the text layers stay in this panel, beside the layer they affect;
status changes use the row's accessible announcement. There is no second
generation status line in the reader header. Every deletion is confirmed. The
panel carries no standing cost note.

Audio is the exception, and its row here is a report and a Delete: generating,
stopping, retrying and setting up a voice all live on the player, which is the
card the learner is looking at while any of them matters. One action belongs to
one surface, and audio had grown a second set of the same controls on a panel
that has to be opened to reach them.

### Reader gestures and details

One gesture means one thing, and it is decided while it is being made.

| On a touch device | What happens |
| --- | --- |
| Short tap on a word | Its details open at once |
| Tap the same word again | The details stay exactly as they are |
| Tap a different word | Its details replace the open ones |
| Hold a sentence for 450ms | Sentence details open, under the finger |
| Hold the same sentence again | The details stay open |
| Short tap on anything else | Whatever is open is dismissed |
| Drag on the reading | The page scrolls; an open sheet stays |

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
docked sheet carries no such control: its grab handle is both the affordance and
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
while the translation, warnings, and grammar scroll between them.

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

## 5. Typography and units

### Type

UI text uses a local system sans-serif stack. Japanese uses a system Japanese
gothic stack. No font is downloaded, ever — a reading application that cannot
render Japanese until a network request completes is not local-first.

The type scale is small on purpose: rank is carried by **size and weight within
one scale**, not by a second system. All-caps micro-labels are not part of the
language. The page or surface title uses `--text-2xl`, a section uses
`--text-xl`, and a group uses `--text-lg` one step below it. Body copy uses
`--text-md`; metadata and supporting copy use `--text-sm` or `--text-xs`; the
Library hero uses `--text-display`. Weight follows the same hierarchy through
the regular, medium, semibold, and bold weight tokens.

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

**One exception, named:** a small-caps label may rank a fragment below the heading
above it where adding another heading level would be worse. There are two, both in
`_controls.scss`, and no third is written inline: `.mn-eyebrow` (accented, above a
result or a group) and `.mn-section-label` (quiet, over a list inside a card). The
markup stays sentence case; only the rendering is capitalised. Anything that could be
an ordinary heading is one instead.

### The prose budget

Standing explanatory text exists only where **money, network, or data loss is at
stake**. A hint under a control that merely restates the control's own label, or
describes what a section obviously contains, is removed rather than reworded.

Four exceptions:

- **Help is a prose surface.** Its job is explanation: static, local English
  guidance uses one readable column, section headings, short paragraphs, and
  links close to the actions they explain. It needs no cards around each topic.
  A quiet, non-modal first-use banner offers Help on a non-reader
  surface without moving focus or covering the app. Dismissal records the preference for this local installation;
  the guide remains in the utility bar. Reader deep links are never interrupted.

- **Empty states teach.** An empty surface has nothing but words to work with,
  so any empty list explains what belongs there and how to fill it. The
  exception ends the moment the surface has content.
- **The first run introduces the application.** An empty Library is what a
  stranger opening the public address sees, so it says what Monosai is and what
  it would do for them before it offers a way in. This is the one surface
  written in the first person: that a person made this is allowed to show here
  and nowhere else. It ends, like any empty state, the moment there is content.
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
story it will become, so the shelf is laid out identically before, during, and
after. The row is muted — secondary text on the sunken surface — and states in
words both that it is not a story yet and which stage it is in; the muting is
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
