# UX and UI specification

## 1. Experience principles

1. **Reader first.** The first useful action is reading, not configuration.
2. **Calm transparency.** Status is visible and specific without turning Japanese into a diagnostic dashboard.
3. **Beginner-friendly, not childish.** Soft colors and generous spacing support attention; labels stay precise.
4. **Progressive disclosure.** The text remains primary. Details live in inspectors, sheets, and expandable status panels.
5. **No surprise network or cost.** Missing cloud aids are buttons, never automatic effects.
6. **Same mental model across devices.** Navigation adapts, but names, states, and task order remain consistent.

## 2. Information architecture

### Primary destinations

Monosai is a reading application. The Reader is the centre, the Library is the
shelf in front of it, and everything else is somewhere you go to change a
setting and come back from. The information architecture says that rather than
listing six equal destinations (ADR 0025).

- **Library**: the shelf, and the one way to add to it.
- **Reader**: the reading itself.
- **Add text**: paste input and save.
- **Generate**: prerequisites, premise form, progress, invalid draft.
- **Settings**: OpenRouter, TTS, exception policy, appearance, storage, install/update, reset, and links to Vocabulary and Grammar.
- **Vocabulary**: providers, source mappings, refresh results, snapshots. Reached from Settings.
- **Grammar**: difficulty preset, register and wording, structural baseline explanation. Reached from Settings.

### Navigation

There is no application-wide navigation at any viewport: no sidebar, no bottom
bar, no More sheet. The application frame is a skip link and the main landmark.

Every page carries its own way back, in a shared page header: a back link on
the left, the page title, and any trailing control the page owns.

- Library → Settings (a gear in the trailing slot). The Library is the root, so it has no back link.
- Reader, Add text, Generate, Settings → Library.
- Vocabulary, Grammar → Settings.

Adding a reading is one primary **New reading** button on the Library, which
opens a chooser with **Paste text** and **Write with AI**. Generating is a
branch of adding, not a destination of its own.

### Initial routing

The root route always resolves to the Library. An empty library explains the two
starting paths — adding Japanese the learner already has, or generating from
reviewed Anki vocabulary — and offers the same **New reading** button, which is
a truer first screen than a form the learner never asked for.
- Deep links restore the requested route after initialization. If prerequisites are missing, preserve the intended destination and route to the relevant setup step.

## 3. Visual system

### Color direction

Use warm paper neutrals, muted sage as the primary interactive color, lavender as the secondary/accent color, and restrained coral/amber for problems. Dark theme uses low-chroma charcoal and softened equivalents rather than saturated neon.

Token names are semantic, not color names:

```scss
:root {
  --surface-canvas: #f8f6f1;
  --surface-panel: #fffdf9;
  --surface-raised: #ffffff;
  --text-primary: #252824;
  --text-secondary: #626860;
  --border-subtle: #dfe4dc;
  --action-primary: #6f8f7a;
  --action-primary-hover: #5e7e69;
  --accent-secondary: #9a8db8;
  --status-success: #527d62;
  --status-warning: #9a722e;
  --status-danger: #a85f58;
  --focus-ring: #6657a5;
}
```

Exact final colors may be tuned only to meet contrast. Do not use semantic token values directly in feature components; consume tokens. Provide equivalent dark-theme values under `[data-theme='dark']`. System theme observes `prefers-color-scheme` until the learner explicitly chooses Light or Dark.

### Typography

- UI: local system sans-serif stack.
- Japanese reading text: system Japanese Gothic/sans-serif stack; do not download remote fonts.
- Ruby: native `<ruby><rt>` semantics with the token button as the ruby base. Use whole-token readings, omit ruby for kana-only tokens and punctuation.
- Base reader size: 20px desktop and 19px mobile, multiplied by the learner's text scale (0.8–2.5) and additionally user-scalable through browser/OS.
- Line height >= 2.05 with furigana, >= 1.75 without. The leading is not only room for ruby: it is the whitespace a sentence is pressed in, so it is deliberately looser than prose would need. The ratio eases off as the scale grows, because what matters is the gap in pixels.
- Never disable browser zoom or Android text scaling.

### Shape, spacing, elevation, motion

- Use 8px spacing increments with 4px for compact internals.
- Controls use 10–14px radii; cards use 16px; chips use pill shapes.
- Shadows are subtle and optional in dark mode. Borders carry structural meaning.
- Motions are 120–200ms and limited to opacity/transform. `prefers-reduced-motion` removes nonessential transitions and all animated progress flourishes.

## 4. Library

### Layout

Desktop: the page centres itself within a wide shelf measure. The Library
header carries the small Monosai mark and wordmark, with the Settings gear in
the trailing slot. A **Library** heading and **New reading** action come next.
Readings form one compact, full-width list grouped under **Today**,
**Yesterday**, **Earlier this week**, and **Older**; empty date groups are not
shown. The lockup is Library chrome only; it does not enter the Reader.

Mobile: same order and date groups. At narrow phone widths the mark and
**Library** remain while the redundant Monosai wordmark gives way, preserving
the Settings touch target without shrinking the destination title.

Filter chips (All / Imported / Generated) appear only once the shelf holds at
least eight readings. Below that they are chrome that can only ever hide one or
two cards the learner can already see.

### Reading row content

A row identifies the reading without repeating its contents.

- Title; its link covers the row and opens the Reader.
- One quiet line with the character count.
- **Audio available** with a small audio icon when at least one saved clip exists.
- Overflow menu with Delete. No edit, favorite, tags, export, or duplicate actions.

Deliberately absent: story excerpts, absolute timestamps, sentence counts,
story form, source badge, "Translations: none yet"-style aid summaries, and
last-opened state. None of them changed a decision, and together they made the
library harder to scan.

Character and audio availability are denormalized onto the `readings` row, so
rendering a page remains one bounded query and never loads audio bytes.

The premise is available in generated-story details/reader metadata but not required on every library card.

### Empty state

Explain both paths equally: “Add Japanese you already have” and “Generate from reviewed Anki vocabulary.” Add text is primary; Generate may route through setup.

## 5. Add-text workflow

### Input and save

- Required Japanese text area with live character count and 50,000-character limit.
- Optional title. Pasted text without a title defaults to the first non-empty line truncated for display, otherwise “Untitled reading.” The user can change it before save.
- Add reading remains disabled for empty/over-limit content.
- Add reading automatically segments and tokenizes the text, preserves blank-line paragraph structure, saves the reading, and shows progress for long texts.

### Unsaved-exit guard

If input changed, navigation/back/reload produces an accessible confirmation. Do not use a guard after a successful save.

## 6. Reader

### The reading surface

The page is Japanese and nothing else. Translations, grammar notes, dictionary
entries, and provenance all live in a popover the learner opened deliberately,
so scrolling a reading never means scrolling past commentary on it. Nothing on
the page is added or removed by an aid arriving, so a reading with every
sentence translated is laid out exactly like one with none.

### Desktop structure

- Compact sticky header: Back, title, Aids, an always-present Audio button, and an overflow menu. The title is single-line with an ellipsis and never displaces the controls. There is no reading-progress figure, because Monosai keeps no reading position (ADR 0025).
- Center reading column: 680–760px maximum text width.
- Word details are a compact Yomitan-style lookup ordered as: surface form and reading; dictionary form and part of speech; a high-level form line; the first two dictionary meanings; stored grammar labels; and, when applicable, warning/status and the recommended next action. The surface form is prominent, and the dictionary line is compact — for example `分からなかった`, `わからなかった`, `分かる · verb`, `Plain · negative · past`.
- The form line is derived only from analyzer evidence already stored locally: token lemmas, the analyzer's bounded inflection form, and the analyzed te-form seam. It uses ordered labels such as `Polite`, `Plain`, `negative`, `past`, `te-form`, `ongoing`, `conditional`, `imperative`, and `volitional`; it retains honest ambiguity as `passive / potential`; and it omits unsupported or uninflected classifications rather than guessing. A word with no useful form classification has no form line.
- The dictionary shows the first two meanings across the returned entries by default. The existing **More** action reveals the remaining meanings. No intermediate forms, derivation rows, ending descriptions, stem highlighting, or derivation-specific pointer/focus behavior appear in the lookup.
- Stored grammar findings appear after the dictionary as compact labels. Their existing explanatory text remains available behind one keyboard-accessible **Details** disclosure. A stale-analysis notice remains visible when applicable; grammar analysis remains an explicit sentence action and does not move into the word lookup.
- Word details and the sentence translation open as floating popovers — anchored to what was pressed at desktop widths, docked as a sheet below the breakpoint — and never as a panel that takes a column (see ADR 0022, ADR 0031, and ADR 0032). A lightweight preview appears on pointer hover, but never replaces the pinned popover; it is offered to a mouse and a keyboard only, because a phone synthesizes a hover for every tap and never takes it back (ADR 0032).
- Exactly one sentence/word/preview popover is open at a time; opening one closes the other, and scrolling closes the anchored sentence and word surfaces.
- The audio player is independent from those popovers. It is a fixed, centered card behind the Audio button, so it can remain visible with sentence or word details open (section 6a).

### Mobile structure

- Sticky header with Back, truncated title, Aids, Audio, and overflow — the same controls as desktop, at the same touch target. Below 480px, Aids keeps its accessible name and touch target but drops its visible label so the title and all four controls fit without horizontal scrolling.
- Full-width reading with 16px gutters.
- Sentence and word details dock to the bottom edge as a sheet below the desktop breakpoint (ADR 0031). A sheet is full width, bounded to 80% of the viewport, scrolls internally, clears the safe-area inset, and carries a grab handle that is also a **Close** button and can be flicked down to dismiss. Focus returns to the word when dismissed.
- The reading keeps scrolling while a sheet is open: a sheet is fixed to an edge rather than to the line it explains, so reading on with a translation open is possible. A press outside that travels is a scroll and leaves the sheet alone; a tap outside dismisses it.
- The audio player docks to the bottom edge on a phone as a full-width bar above the safe-area inset, and is a compact centred card at wider widths. A sheet opened while the player is docked sits above it rather than under it.

### Text and token interaction

- Paragraphs retain source order and spacing.
- Sentences have `lang="ja"`; translations have `lang="en"` inside their popover.
- Tokens are interactive only if they have inspectable data. Use native buttons styled inline rather than click handlers on spans.
- A word's target is the word itself: the button is the ruby base rather than the ruby's parent, and its own leading is reset so the box hugs the glyphs. The annotation above it and the leading around it belong to the sentence, so a press there opens the sentence rather than the word.
- On a coarse pointer the word button carries vertical padding that reaches into the leading, bringing a word up to a usable touch target without moving a glyph. It is applied by media query rather than by the current pointer, because a hit area that changes during a gesture breaks that gesture's own click (ADR 0032).
- A press is about the whole word, never the morpheme under the pointer: あり and ます are one word, so pressing either opens あります, tints both, and looks up ある. Particles stay words of their own, because a particle is worth inspecting.
- Desktop: hover/focus gives a concise preview; click/Enter/Space pins full details.
- Android: tap a word to open full details. A tap that is not on a word does nothing to the reading and dismisses whatever is open, so a word tap and putting a sheet away never conflict.
- A word is always one press away, whatever is open: a press on a word dismisses nothing and keeps its click, so tapping the next word moves to it and tapping the open word puts it away (ADR 0032). The same is true of a long press on the open sentence.
- The word or line a sheet is about stays visible above it: when a sheet opens on a phone the reading scrolls only as far as the sheet requires, including as the sheet grows to fit its content.
- Token spacing is implemented by layout gap/margins, not by modifying the stored Japanese string.
- The gap falls between bunsetsu, not between analyzer morphemes. A content word keeps its particles, auxiliaries, inflection, suffixes, and counters; a prefix keeps the word it modifies; punctuation keeps the chunk it closes; and a reviewed multi-token phrase is never broken into. Spacing every morpheme printed 目 が あり ます, which is the analyzer's view of the sentence rather than the learner's.
- Normal line breaks occur between bunsetsu. Each bunsetsu stays on one line whenever it fits the available measure; an exceptionally long bunsetsu may break internally only as a last-resort safeguard against horizontal overflow, using strict Japanese punctuation-breaking rules.

### Selecting a sentence

- **No control is printed for a sentence** — no gutter affordance, no end-cap, no hover toolbar, no focus-revealed button on the page.
- With a mouse, a click anywhere in a paragraph that is not a word selects the sentence it fell in or nearest to: the gaps between words, the punctuation, the leading between two lines, and the run of space out to the end of a line all count.
- The decision is geometric, taken from the line boxes of the sentences in the paragraph, because a press in the leading lands on the paragraph and on no sentence element at all. The line the press is on wins over a nearer point on another line.
- On touch, **only a long press selects**, from anywhere in the sentence including on a word, and it is confirmed by a short haptic where the device offers one. A tap never selects: on a phone a tap is how a reader dismisses what is open and scrolls on, and answering it with a popover made every attempt to put one away open the next one (ADR 0031).
- A press that moves, is interrupted by a scroll, or ends in a text selection is not a selection. On a coarse pointer the reading surface does not take text selections at all, so the platform's own long-press menu never covers the sentence that was just opened.
- The selected sentence is tinted, so an anchored card is not orphaned from the sentence it is about. The open sentence and the open word share one tint colour, because only one of the two is ever open (ADR 0032).
- Hovering a sentence or a word tints it neutrally, and only its colour changes: nothing on the page may move under the pointer. Hover styling is keyed off the last pointer device rather than a hover media query, so a tap never leaves a hover behind on a phone or a touchscreen laptop.
- On touch the sentence under a resting finger is tinted after a short delay rather than on the first frame, so a tap and the start of a scroll leave the page alone.
- The word popover does not offer a route to the sentence; sentence selection remains a pointer or touch interaction on the reading surface.

### Initial aid state

Global aids start on: furigana, token spacing, warning markers, and an unscaled
text size. There is no preference for showing translations or grammar, because
neither is ever laid out on the page.

Opening a sentence or a word requests nothing. Where an aid does not exist, the
sentence popover shows an explicit action, as a label and nothing else:
**Translate**, **Grammar**, **Audio** (**Play** once a clip exists, and
**… again** after a failure).

Nothing is written under those buttons. That an AI action sends the sentence to
the learner's own model is a property of the application, stated once in
Settings; repeating it under every button that could trigger one is what made
pressing a sentence feel expensive.

### Status presentation

The reader marks warnings and nothing else. A known word, a particle, a number,
and a policy exception all render as plain text: each is a way of saying the
text is readable, and marking them buried the Japanese they described. Every
status still carries its label, explanation, and next action in word details.

| Category | Visual treatment | Accessible short label |
| --- | --- | --- |
| Not in current snapshot, or unknown | Pastel-orange wavy underline under the word | Not in current vocabulary / Unknown vocabulary |
| Grammar outside the learner's profile | Pastel-blue wavy underline, drawn under the span the finding covers, at a deeper offset so a word can carry both | Unfamiliar grammar |
| Everything else | None | None |

A finding with no span marks nothing: the word popover explains it rather than
guessing a word for it.

### Sentence popover

The sentence is where everything that spends a request lives, and where the two
warnings the page marks are said in words:

1. The translation, or the action that fetches it.
2. **Words you may not know** — the words in this sentence carrying the
   vocabulary warning, de-duplicated, each with the kind of warning it is.
3. **Grammar** — the findings outside the learner's profile, the action to
   analyze or re-analyze (imported readings only), and a note that each finding
   is also on the word it is about. In-profile findings never appear here; a
   note saying a form is already known is what buried the Japanese.

The actions are one tray at the foot of the card, ruled off from the notes above
them: three equal-width controls, each an icon and a label, so on a phone they
split the width rather than stacking into three full-width bars. **Play** — the
one action that spends nothing, because the clip already exists — is the filled
one.

Both sections are ruled in their marker's own colour, so a learner who pressed
the sentence because something was underlined finds out what without hunting for
the underline that sent them there. A failure is shown in Monosai's words with a
retry, and always says the sentence itself is unchanged.

### Word popover content order

Read-only throughout. Nothing here spends a request, so a word can be opened as
often as a learner likes without wondering what it cost.

1. Surface form and reading.
2. Dictionary form and part of speech.
3. A high-level form line, omitted when the local analyzer evidence has no useful classification.
4. The first two dictionary meanings, with the existing **More** action for the rest. Written forms are secondary, and the meanings remain a compact numbered list.
5. Relevant stored grammar findings as compact labels. Their existing explanatory text is behind one collapsed, keyboard-accessible **Details** disclosure; a stale-analysis notice remains visible when applicable.
6. Validation/status and the recommended next action, only when applicable.
The sentence is not repeated here: the learner is looking at it. A finding with
no span marks nothing on the page, so every word of its sentence carries it —
there is no other surface it could be read on.

### Whole-reading actions

- The overflow menu holds **Translate reading** (becoming **Stop translating** while it runs) and **Delete reading**. Labels only, no explanations.
- **Translate reading** disappears once every sentence is translated, rather than becoming a line saying so.
- A running **translation** job appears as a hairline progress row under the header with a stop, a retry for what is left, and a dismissal. It takes none of the page at rest, and no permanent status strip exists.
- Generated stories are reviewed once against the profile captured with them and are never re-analyzed.

## 6a. Audio

The reader header carries an **Audio** button at all times, whether or not the
reading has any audio. It is the only thing that tells a learner Monosai can
read to them at all, and its accessible name states the current state (`Audio`,
`Audio, ready`, `Audio, playing`, `Audio, paused`,
`Audio, waiting for the next sentence`, `Audio, being generated`). Playback is
named before generation, because the two now run at the same time and what the
learner is hearing is the more useful of the two to be told about. Its
appearance follows that state, so playback or a job remains visible even while
the player is closed. The button exposes `aria-expanded` and
`aria-controls="reading-audio-player"`.

Pressing it opens the fixed audio player. The player is a labelled `region`, not
a dialog or CDK popover: it has no backdrop, focus trap, outside-click handler,
or Escape handler. Opening captures the selected sentence for **Start from this
sentence**, but loads nothing, requests nothing, and plays nothing. It does not
close sentence or word popovers.

Pressing the same header button while the player is open calls playback Stop,
clears the active sentence and cursor, hides the player, and clears the captured
selection. It does not cancel an in-progress generation job; generation progress
and errors remain available when the player is opened again. Outside clicks and
Escape do nothing to the player, while the existing sentence and word popover
dismissal rules remain unchanged.

The player is a compact, rounded, elevated card fixed above the viewport bottom
and centered at desktop widths, and a full-width bar docked to the bottom edge
below 600px, clearing `env(safe-area-inset-bottom)`.
Its height is bounded with internal overflow for long generation or failure copy,
and an open player adds bottom clearance to the reading. The sticky reader header
and the player sit above the CDK popover backdrop, so the Audio toggle and player
remain reachable alongside a sentence or word popover.

The player owns every audio state there is (ADR 0025, ADR 0028, and ADR 0033).
It is one card in two bands: a **transport** whenever there is anything to play,
and a quieter **generation rail** beneath it whenever there is anything to say
about preparing the rest. Either band may be absent; they are never alternatives
to each other.

| Band | Content |
| --- | --- |
| Transport | Back / play, pause, or resume / next, with the position beside it, a position bar, and **Start from this sentence** when the selected sentence has a clip |
| Rail — being generated | Progress bar, "4 of 13 sentences ready", **Stop** |
| Rail — stopped or failed | "Stopped with 4 of 13 sentences ready.", the failure, **Try again**, **Dismiss** |
| Rail — nothing prepared or partly prepared | The sentence count, or "4 of 13 sentences have audio", and **Generate audio** |

- The transport appears as soon as any sentence has a clip under the current voice, not when every sentence does. A reading whose set is partial is played as far as it goes and waits for the rest (ADR 0033).
- The position line reads "Sentence 4 of 13" while playing, "4 of 13 sentences ready" while idle, and "Waiting for sentence 5 of 13" at the frontier. While waiting, the play control is disabled and named for what it is doing: the session has already started and there is nothing to press.
- Generation reports how many sentences are ready rather than which one it is at, because four requests are open at once and there is no single sentence the run has reached.
- A job that fails before it resolves what to send reports no position, rather than deriving a nonsensical one from empty counts.
- Back replays the sentence being read from its start, and steps to the sentence before only when pressed within the first moment of one. The reason to reach for it is that a sentence went past too fast, and jumping straight back meant the sentence actually wanted could only be reached by going back and then forward again. Its accessible name says both things it does.
- Back and Next stay disabled until playback has an active sentence and do not wrap at either boundary. Next is also disabled while the sentence after this one has no clip yet, because a jump needs somewhere to land; Back stays available, because replaying this sentence never depends on a neighbour. Play is disabled while sentence one has no clip.
- The transport has no Stop button: closing through the header Audio toggle is the stop/reset action. The rail keeps its own **Stop**, which aborts the requests in flight and stops no sound.
- Per-sentence audio is generated and played from the sentence popover. No play control is printed on the reading surface itself, so pressing a sentence still costs nothing.
- Audio never autoplays. Preparing a clip never plays it, a clip arriving never plays it, and playing is always a second, explicit action. Reading on after a wait continues a session the learner started.

## 7. Generate

### Prerequisite panel

List only the prerequisites that are **not** met — Text AI, vocabulary snapshot
(>= 50), premise — one line each, and drop the panel entirely once none are
outstanding. A row of green ticks confirming a setup finished weeks ago is not
information. Each line links to its configuration screen and preserves the
generation draft.

TTS never blocks generation, so it is not listed at all. The advisory grammar
preset warning is the one non-blocking line that stays, because it is the one
that costs money to ignore.

What a generation is written from is stated once, immediately above the button
that sends it, with links to Vocabulary and Grammar.

The grammar preset is always set and is therefore not a check. It is shown as a read-only line naming the current preset and linking to Grammar. When the preset is far above what the snapshot can supply, that line carries a non-blocking warning.

### Form

- Required premise, multiline, with a reasonable UI limit stated in the AI specification.
- On desktop, the premise and special-instructions fields occupy the wider left column. A smaller settings panel on the right contains a rectangular eight-stop length slider for 5, 15, 30, 50, 100, 200, 400, and 800 sentences. Its established scale names remain Tiny, Short, Medium, and Long; selections above 50 continue to use Long. At 100 sentences and above, an inline non-blocking warning explains that models become much less reliable at following grammar and vocabulary settings. An enabled, keyboard-accessible Anki word-selection select offers Uniform, Recently learned, and Difficult modes. The settings panel stacks below the fields on narrow screens. The select is disabled while generation is in flight and its remembered value is persisted immediately.
- Optional special instructions with examples such as tone, viewpoint, dialogue, or desired register.
- Current vocabulary summary and current grammar preset name are read-only links.
- Generate button includes an OpenRouter/network indicator but no price estimate.

No genre selector, topic suggestions, visible target-vocabulary list, temperature control, or raw prompt editor.

### Progress

Submitting replaces the form with a focused generation screen. Show the current
stage title with a simple animated ellipsis and one short detail line describing
the work currently in progress; do not show the entire internal pipeline. Text changes as the job
moves through:

1. Preparing vocabulary
2. Writing Japanese
3. Parsing
4. Validating vocabulary
5. Reviewing exceptions (when needed)
6. Repairing (when needed, with attempt 1/2)
7. Reviewing grammar
8. Translating
9. Saving

Use real counts when available: exception review names its unfamiliar-word
count, and repair names how many unfamiliar words it is replacing plus its
attempt number. When grammar review and translation run concurrently, name
both in the same message. On completion, replace the loading state with the
saved title and **Open story** as the primary action.

Cancel remains available until saving begins. During saving it is disabled for the brief transaction. A user cancellation discards the entire story even if auxiliary results had completed.

### Invalid draft

Show the unsaved Japanese with unknown markers, an issue list, repair-attempt count, and actions **Try a new generation**, **Change premise/instructions**, and **Close**. No Save anyway action exists. Closing loses the draft after confirmation.

## 8. Vocabulary sources

The page presents a single list of independently enabled sources feeding one
combined current vocabulary. Source cards use source-specific controls rather
than forcing every source through Anki terminology.

### Provider selection

One **Add source** button follows the source list. It expands in place into three
source kinds:

- AnkiConnect access: preferred when AnkiConnect or a compatible local bridge is running.
- Anki package: fallback using `.apkg` or `.colpkg`, processed locally.

Connection attempts show a specific error when needed and never claim the app
can start Anki or install another application automatically.

- Pasted list: a local source created from a named multiline value with one
  expression per line. Show the parsed non-empty line count and exact duplicate
  count before saving. Editing or disabling it rebuilds the combined vocabulary
  without requiring Anki.
- AnkiConnect sources always sync while Anki is available. Automatic failures
  are non-modal and always state that the current vocabulary was kept.

### Mapping editor

Anki and pasted-list sources appear in the same list and share Enabled and
Remove controls. Source-specific configuration stays within its row: Anki has
deck, note type, expression field, and subdeck settings; a pasted list has its
named multiline editor. Dropdown options come only from the provider/package.
Stale mappings are retained but marked invalid until fixed or removed.

### Updating

There is no manual refresh section or confirmation step. Adding a source,
changing its configuration, editing it, enabling it, pausing it, or removing it
updates the combined vocabulary immediately. AnkiConnect also refreshes on
startup, focus, and its background interval while Anki is available. Detailed
query/analyse progress remains an implementation state exposed to assistive
technology, not a permanent dashboard. Failures keep the previous vocabulary
and offer a specific recovery path.

### Current vocabulary

The compact **Current** section leads with the unique count, then shows the
updated time, enabled source count, and number of generated stories using the
current vocabulary. The source-management section is simply **Sources**; avoid
repeating page context in explanatory headings. There is no snapshot history or
deletion UI in v1.

Outside the reader, a successful automatic refresh shows a compact bottom-right
toast only when the combined vocabulary expressions changed. The toast says
“Vocabulary updated”, flies in, and fades away. Unchanged refreshes and routine
checking states are silent. Actionable automatic failures remain visible with
actions to retry or manage sources; do not show routine unavailable notifications
repeatedly and do not add application chrome to the reading surface.

## 9. Grammar

### Preset picker

- Six preset cards in a single ordered list, easiest first, exactly one selected. Each card shows the name, a smaller caption reading "usually taught around N…" (the first card reads "the first patterns in any course"), a one-line plain-English description, and a real Japanese example sentence.
- The example sentence is the primary affordance. Learners choose by reading it, not by trusting the label, because recognising a sentence is reliable where self-reporting grammar knowledge is not.
- The name is never a JLPT level. The caption is the only place a level appears, and its wording states where patterns are conventionally taught rather than asserting an official list.
- Selecting a card saves immediately and shows what changed in one line, including that existing grammar analyses become stale.

### Register

Three options — everyday spoken, polite written, either — as a single compact control below the picker. Optional, defaulting to either.

### Custom variant

- One **Use my own wording** action opens a text field prefilled with the selected preset's guidance, bounded at 1,000 characters, with **Reset to preset**.
- The screen states plainly that a custom variant replaces the preset wording entirely, for generation and for novelty analysis alike. Novelty is judged against the captured guidance prose, so a variant is not approximate — it is simply the profile.
- There is no per-rule custom-rule editor.

### Structural baseline

- The structural baseline section is read-only, grouped by category, and explains that these forms are always treated as readable and are never counted as learner vocabulary. It is collapsed by default so its 177 entries cannot push the picker off the first screen.
- There is no in-app grammar reference; see [ADR 0014](../decisions/0014-remove-grammar-rule-catalog.md).

## 10. Settings

Settings starts with a **Your setup** panel linking to Vocabulary and Grammar,
followed by Appearance controls. AI configuration comes next, then
generation policy, storage and app maintenance. Language asset details and
diagnostics stay at the bottom, with technical details collapsed by default;
readiness, errors, and retry actions remain visible.

### Appearance

- System/Light/Dark theme.
- Reading text scale and reader aid switches for furigana, spacing, and warning markers are available in the reader's Aids panel.

### Models

- One configured-model list and one top-right **Add model** menu. Rows use capability badges for Story, Translation, Grammar, and Audio only when supported by validated provider metadata and compatibility evidence.
- Compact defaults for text, audio, and grammar judgement. Grammar judgement falls back to the text default when no dedicated model is chosen.
- Default assignments appear as badges in the model rows. Removing a default leaves it unconfigured and never silently promotes another model.
- Test, edit, and remove actions are consistent per row. Exact IDs, reasoning, voice/speed, compatibility results, and technical details are disclosed within the row.
- API key entry, Save/Replace, Remove, and configured/not-configured indicator stay separate and compact. Never show the saved value or a reveal toggle after save.
- Story generation and reader audio use the Settings defaults for their capability and offer no per-request model selector. The model actually used is still captured in provenance/cache identity.
- Story generation token budget remains bounded to 4,096–32,768 (default 16,384). Changing key/model marks matching test evidence stale but preserves cached content.

### Generation policy

- One global exception-policy text area, save state, and short explanation that AI-approved exceptions stay visibly distinct.

### Storage and app

- Browser storage protection status.
- Approximate usage when available.
- Clear audio cache.
- Install instructions when browser criteria permit.
- Update available action; never force reload during work.
- Full reset in a danger zone with two-step confirmation.

No dedicated privacy/legal page or spending dashboard.

## 11. Accessibility and responsive acceptance

- Logical heading hierarchy and landmarks on every route.
- Skip link to main content on desktop.
- Focus order follows visual order; no positive `tabindex`.
- Focus remains visible against all pastel surfaces.
- Sheets/dialogs are labelled, trap focus, close with Escape where safe, and restore focus.
- Status changes use polite live regions; token hover previews do not announce repeatedly.
- Long-running progress exposes its current stage and textual counts in a polite live region.
- Chips expose `aria-pressed`; whole-level controls announce affected ranges.
- At 320px, no page-level horizontal scrolling; tables become definition lists/cards.
- Ruby never overlaps adjacent lines at 200% Android text scaling.
- Touch targets remain usable without hover. A sentence is reached without a pointer through the word popover, since selecting one is a press on whitespace that a keyboard cannot aim.
- Sentence and word details are modal CDK popovers with their existing dismissal and focus behavior — anchored at desktop widths, docked as a sheet below the breakpoint. A docked sheet's grab handle is a real **Close** button, so dismissing one never depends on a gesture. The audio player is a non-modal fixed region and deliberately ignores outside clicks and Escape; it may coexist with those popovers.
- All audio begins only after explicit activation.
