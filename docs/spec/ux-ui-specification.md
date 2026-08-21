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
- **Add text**: paste/file input, segmentation review, save.
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

The root route always resolves to the Library. An empty library states that in
one line and offers the same **New reading** button, which is a truer first
screen than a form the learner never asked for.
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
- Japanese reading text: system Japanese serif stack with sans-serif fallback; do not download remote fonts.
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

Desktop: the page centres itself within the shared content width. The header
(title plus the Settings gear) comes first, then **New reading**, then the
cards in a responsive grid that fills the available width
(`repeat(auto-fill, minmax(260px, 1fr))`).

Mobile: single column, same order.

Filter chips (All / Imported / Generated) appear only once the shelf holds at
least eight readings. Below that they are chrome that can only ever hide one or
two cards the learner can already see.

### Reading card content

A card shows the reading, not a report on it.

- Title, linking into the Reader.
- Two to three lines of the reading's opening in Japanese, clamped by line count. It is a preview: no furigana, no tap targets, no markers.
- One quiet line: a relative date ("2 days ago"), and a small audio icon when the reading has audio.
- Overflow menu with Delete. No edit, favorite, tags, export, or duplicate actions.

Deliberately absent: absolute timestamps, sentence counts, story form, source
badge, "Translations: none yet"-style aid summaries, and last-opened state.
None of them changed a decision, and together they made a card a table.

The excerpt is denormalized onto the `readings` row, so rendering a page of
cards is still one bounded query.

The premise is available in generated-story details/reader metadata but not required on every library card.

### Empty state

Explain both paths equally: “Add Japanese you already have” and “Generate from reviewed Anki vocabulary.” Add text is primary; Generate may route through setup.

## 5. Add-text workflow

### Step 1: Input

- Tabs: Paste text and Text file.
- Required Japanese text area with live character count and 50,000-character limit.
- Optional title. File import fills it from filename; pasted text without a title defaults to the first non-empty line truncated for display, otherwise “Untitled reading.” The user can change it before save.
- Continue remains disabled for empty/over-limit content.

File errors are inline and do not clear a prior pasted draft. Drop zones have an ordinary button equivalent and do not require drag-and-drop.

### Step 2: Review structure

- Show title field and paragraph cards.
- Within each paragraph, sentences are focusable rows with stable temporary IDs.
- Sentence menu: Split at caret, Merge with previous, Merge with next.
- Raw-text Back action returns without losing work.
- Save reading performs tokenization/persistence and shows progress for long texts.

Do not provide arbitrary sentence text editing in the review step. If the underlying text is wrong, the user returns to raw input. This keeps saved content and token analysis coherent.

### Unsaved-exit guard

If input or reviewed boundaries changed, navigation/back/reload produces an accessible confirmation. Do not use a guard after a successful save.

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
- Word details name the parts of a word the analyzer split, head first: 小さい as an i-adjective, then です as the polite copula. Endings are named from the shipped structural baseline, so nothing is guessed and nothing costs a request; an ending the baseline does not cover falls back to its word class. A word that was never split shows its dictionary form and part of speech instead, because a one-item composition explains nothing.
- Word details and the sentence translation open as floating popovers anchored to what was pressed, never as a panel that takes a column (see ADR 0022). A lightweight preview appears on pointer hover, but never replaces the pinned popover.
- Exactly one floating surface is open at a time; opening either closes the other, and scrolling closes both.
- The audio panel opens anchored to the Audio button. There is no docked footer player: audio has one place and it is behind that button (section 6a).

### Mobile structure

- Sticky header with Back, truncated title, Aids, Audio, and overflow — the same controls as desktop, at the same touch target.
- Full-width reading with 16px gutters.
- Popovers dock to the bottom edge as a sheet below the desktop breakpoint (ADR 0022). Focus returns to the word when dismissed.

### Text and token interaction

- Paragraphs retain source order and spacing.
- Sentences have `lang="ja"`; translations have `lang="en"` inside their popover.
- Tokens are interactive only if they have inspectable data. Use native buttons styled inline rather than click handlers on spans.
- A word's target is the word itself: the button is the ruby base rather than the ruby's parent, and its own leading is reset so the box hugs the glyphs. The annotation above it and the leading around it belong to the sentence, so a press there opens the sentence rather than the word.
- A press is about the whole word, never the morpheme under the pointer: あり and ます are one word, so pressing either opens あります, tints both, and looks up ある. Particles stay words of their own, because a particle is worth inspecting.
- Desktop: hover/focus gives a concise preview; click/Enter/Space pins full details.
- Android: tap opens full details. Tapping sentence whitespace does not conflict with a word tap.
- Token spacing is implemented by layout gap/margins, not by modifying the stored Japanese string.
- The gap falls between bunsetsu, not between analyzer morphemes. A content word keeps its particles, auxiliaries, inflection, suffixes, and counters; a prefix keeps the word it modifies; punctuation keeps the chunk it closes; and a reviewed multi-token phrase is never broken into. Spacing every morpheme printed 目 が あり ます, which is the analyzer's view of the sentence rather than the learner's.

### Selecting a sentence

- **No control is printed for a sentence** — no gutter affordance, no end-cap, no hover toolbar, no focus-revealed button on the page.
- A press anywhere in a paragraph that is not a word selects the sentence it fell in or nearest to: the gaps between words, the punctuation, the leading between two lines, and the run of space out to the end of a line all count.
- The decision is geometric, taken from the line boxes of the sentences in the paragraph, because a press in the leading lands on the paragraph and on no sentence element at all. The line the press is on wins over a nearer point on another line.
- Android long-presses anywhere in the sentence, including on a word. A press that moves, is interrupted by a scroll, or ends in a text selection is not a selection.
- The selected sentence is tinted, so a sheet docked to the bottom of a phone is not orphaned from the sentence it is about.
- Hovering a sentence tints it, and only its colour changes: nothing on the page may move under the pointer.
- The keyboard cannot aim at whitespace, so its route to a sentence is the word popover, which offers the sentence translation from the word the reader stopped at.

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

Both sections are ruled in their marker's own colour, so a learner who pressed
the sentence because something was underlined finds out what without hunting for
the underline that sent them there. A failure is shown in Monosai's words with a
retry, and always says the sentence itself is unchanged.

### Word popover content order

Read-only throughout. Nothing here spends a request, so a word can be opened as
often as a learner likes without wondering what it cost.

1. Surface form and reading.
2. Lemma and part of speech.
3. **Grammar, when this word has any** — the notes covering it, plus the ones said about the sentence as a whole, marked as such. A learner who pressed an underlined word came for this, so it must not sit below a dictionary they have to scroll past. It is ruled in the grammar marker's own colour, so the section names the underline that sent them there.
4. Validation/status badge and plain-language explanation.
5. Compact dictionary senses, numbered when multiple.
6. Grammar, when this word has none: the empty state alone. Analysis is offered on the sentence.
7. Recommended next action, such as "Review this word in Anki, then refresh vocabulary."
8. A route to this word's sentence, laid out only while it holds focus — the keyboard's only way to a sentence, since selecting one is a press on whitespace it cannot aim.

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
`Audio, ready`, `Audio, playing`, `Audio, being generated`). Its appearance
follows that state, so a job running behind a closed panel is still visible.

Pressing it opens the audio panel: anchored to the button on desktop, docked as
a sheet on a phone, using the same floating surface as the reader's popovers
(ADR 0022). Opening it loads nothing, requests nothing, and plays nothing.

The panel owns every audio state there is (ADR 0025):

| State | Panel content |
| --- | --- |
| No audio yet | The sentence count, and **Generate audio** |
| Being generated | Progress bar, "Sentence 4 of 13", **Stop** |
| Stopped or failed | What happened, the failure, **Try again**, **Dismiss** |
| Ready | Transport (previous / play / next / stop), position bar, and **Start from this sentence** when one was open |

- The transport appears only when every sentence has a clip under the current voice. A reading whose set is incomplete gets the failure state instead, because a player that stopped in the middle of a reading would be worse than no player (ADR 0024).
- A job that fails before it resolves what to send reports no position, rather than deriving a nonsensical one from empty counts.
- Per-sentence audio is generated and played from the sentence popover. No play control is printed on the reading surface itself, so pressing a sentence still costs nothing.
- Audio never autoplays. Preparing a clip never plays it; playing is always a second, explicit action.

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
- Story form cards: Micro (4–6 sentences) and Short (13–20).
- Optional special instructions with examples such as tone, viewpoint, dialogue, or desired register.
- Active snapshot summary and current grammar preset name are read-only links.
- Generate button includes an OpenRouter/network indicator but no price estimate.

No genre selector, topic suggestions, visible target-vocabulary list, temperature control, or raw prompt editor.

### Progress

Use a vertical stepper on mobile and horizontal/vertical adaptive stepper on desktop. States: Pending, Active, Complete, Retrying, Skipped, Failed. Stages:

1. Preparing vocabulary
2. Writing Japanese
3. Parsing
4. Validating vocabulary
5. Reviewing exceptions (when needed)
6. Repairing (when needed, with attempt 1/2)
7. Reviewing grammar
8. Translating
9. Saving

Cancel remains available until saving begins. During saving it is disabled for the brief transaction. A user cancellation discards the entire story even if auxiliary results had completed.

### Invalid draft

Show the unsaved Japanese with unknown markers, an issue list, repair-attempt count, and actions **Try a new generation**, **Change premise/instructions**, and **Close**. No Save anyway action exists. Closing loses the draft after confirmation.

## 8. Vocabulary

### Provider selection

Cards explain:

- Local Anki connection: preferred when desktop AnkiConnect or the Android-compatible bridge is running.
- Anki package: fallback using `.apkg` or `.colpkg`, processed locally.

Connection tests show a specific state and never claim the app can start Anki or install another application automatically.

### Mapping editor

Each mapping has provider source, deck, note type, expression field, enabled toggle, and Remove. Dropdown options come only from the provider/package. Changing deck updates compatible note types; changing note type updates fields. Stale mappings are retained but marked invalid until fixed or removed.

### Refresh review

Show summary cards rather than raw records: cards queried, reviewed matches, non-empty values, duplicates, unique vocabulary, rejected empty values, and warnings/errors. Confirmation creates the snapshot. Provide a downloadable dump nowhere in v1.

### Snapshot history

List created time, unique count, mapping summary, source kind, and number of generated stories referencing it. The newest completed snapshot is Active. No snapshot deletion UI in v1.

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

### OpenRouter text

- API key entry, Save/Replace, Remove, and configured/not-configured indicator. Never show the saved value or a reveal toggle after save.
- Exact text-model ID and Test configuration.
- Changing key/model marks the test stale but preserves cached content.

### TTS

- Exact TTS-model ID, exact voice ID, speed control where supported, and Test voice.
- A capability failure is separate from text-model status.

### Generation policy

- One global exception-policy text area, save state, and short explanation that AI-approved exceptions stay visibly distinct.

### Appearance and reading

- System/Light/Dark theme.
- Global furigana, spacing, and warning-marker switches.
- Reading text scale (0.8–2.5), which line height and paragraph spacing follow within bounds. Also reachable from the reader's Aids panel.

### Storage and app

- Persistence-granted/denied status.
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
- Progress steppers expose current stage and textual counts.
- Chips expose `aria-pressed`; whole-level controls announce affected ranges.
- At 320px, no page-level horizontal scrolling; tables become definition lists/cards.
- Ruby never overlaps adjacent lines at 200% Android text scaling.
- Touch targets remain usable without hover. A sentence is reached without a pointer through the word popover, since selecting one is a press on whitespace that a keyboard cannot aim.
- Header panels are native popovers, so dismissal, Escape, the top layer, and mutual exclusivity are the platform's behaviour rather than bespoke listeners.
- All audio begins only after explicit activation.

