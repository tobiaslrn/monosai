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

- **Library**: returning home, Continue reading, filter, reading cards.
- **Add text**: paste/file input, segmentation review, save.
- **Generate**: prerequisites, premise form, progress, invalid draft.
- **Vocabulary**: providers, source mappings, refresh results, snapshots.
- **Grammar**: difficulty preset, register and wording, structural baseline explanation.
- **Settings**: OpenRouter, TTS, exception policy, appearance, storage, install/update, reset.

The Reader is a focused child route reached from Library or finalization. It is not a permanent navigation item.

### Navigation by viewport

Desktop (>= 960px): persistent left sidebar with Library, Add text, Generate, Vocabulary, Grammar, and Settings. Collapse labels only below 1120px while retaining accessible names/tooltips.

Mobile (< 960px): bottom navigation with Library, Add, Generate, and More. More opens a full-height sheet containing Vocabulary, Grammar, and Settings. Hide bottom navigation in the focused reader; use a reader header with Back, title, and Aids.

### Initial routing

- Fresh profile: Add text page with a short statement that Anki and AI are optional.
- Returning profile with readings: Library.
- Returning profile without readings: Add text.
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
- Ruby: native `<ruby><rt>` semantics. Use whole-token readings, omit ruby for kana-only tokens and punctuation.
- Base reader size: 20px desktop and 19px mobile, user-scalable through browser/OS. Line height >= 1.9 with furigana, >= 1.65 without.
- Never disable browser zoom or Android text scaling.

### Shape, spacing, elevation, motion

- Use 8px spacing increments with 4px for compact internals.
- Controls use 10–14px radii; cards use 16px; chips use pill shapes.
- Shadows are subtle and optional in dark mode. Borders carry structural meaning.
- Motions are 120–200ms and limited to opacity/transform. `prefers-reduced-motion` removes nonessential transitions and all animated progress flourishes.

## 4. Library

### Layout

Desktop: maximum 1120px content width. Continue reading spans the first row; actions and filter tabs follow; cards use a responsive 2-column grid when space permits.

Mobile: single column. Continue reading appears first, then two equal primary buttons (**Add text**, **Generate**), then segmented filters.

### Reading card content

- Title and source badge: Imported or Generated.
- Creation date/time in local format.
- Story form for generated content; omit for imported.
- Progress indicator and last-opened state.
- Generated status summary: Strict, Exceptions, grammar warning count/unavailable, translation completion, audio completion.
- Imported status summary: sentence count, translation completion, audio completion.
- Overflow menu with Delete. No edit, favorite, tags, export, or duplicate actions.

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

### Desktop structure

- Compact sticky header: Back, title, reading progress, Aids, overflow metadata/delete.
- Center reading column: 680–760px maximum text width.
- Word details open as a floating popover anchored to the word, not as a right inspector panel (see ADR 0022). A lightweight preview appears on pointer hover, but never replaces the pinned popover.
- Whole-reading player appears as a sticky footer only while preparing/playing or when explicitly opened.

### Mobile structure

- Sticky header with Back, truncated title, Aids, and player status.
- Full-width reading with 16px gutters.
- Word details use the same popover, docked to the bottom edge as a sheet below the desktop breakpoint (ADR 0022). Focus returns to the word when dismissed.
- Sentence actions have no visible control at rest. Hovering a sentence tints it, clicking its whitespace (desktop) or long-pressing it (Android) opens the sentence menu, and a focus-revealed button at the end of each sentence opens the same menu from the keyboard, so long-press is never the only route.

### Text and token interaction

- Paragraphs retain source order and spacing.
- Sentences have `lang="ja"`; translations have `lang="en"`.
- Tokens are interactive only if they have inspectable data. Use native buttons styled inline rather than click handlers on spans.
- Desktop: hover/focus gives a concise preview; click/Enter/Space pins full details.
- Android: tap opens full details. Tapping sentence whitespace does not conflict with a word tap.
- Token spacing is implemented by layout gap/margins, not by modifying the stored Japanese string.

### Initial aid state

All global aids start on:

- Furigana shown when a reading is available.
- Token spacing enabled.
- Status markers enabled when a status exists.
- Cached/saved translations expanded.

If an aid does not exist, show an explicit action without making a request. Examples: **Translate sentence**, **Analyze grammar**, **Generate audio**.

### Status presentation

Use a combination of color, underline/pattern, icon, accessible label, and inspector text. Do not permanently attach verbose labels to every token.

| Category | Visual treatment | Accessible short label |
| --- | --- | --- |
| Known from Anki | Sage dotted underline | Known from Anki |
| Structural grammar | Neutral thin underline | Structural grammar |
| Normalized known form | Sage dashed underline | Known normalized form |
| Entity/number/date | Lavender dotted underline | Recognized entity |
| Policy exception | Lavender/amber double underline + badge in inspector | Policy exception |
| Not in current snapshot (imported) | Amber dashed underline | Not in current vocabulary |
| Unknown generated draft | Coral wavy underline + warning icon | Unknown vocabulary |
| Grammar concern | Amber marker on the sentence, not misleadingly on a single token unless the analysis supplies a span | Grammar concern |

### Sentence actions

- Show/hide translation.
- Translate/retry when missing or failed.
- Generate/play audio.
- Analyze/re-analyze grammar for imported content.
- Open sentence details with provider/provenance status.

Generated translations and grammar results appear automatically when available. All failures are retryable from the affected sentence or reading status panel.

### Inspector content order

1. Surface form and reading.
2. Lemma and part of speech.
3. Validation/status badge and plain-language explanation.
4. Compact dictionary senses, numbered when multiple.
5. Sentence context.
6. Exception or grammar explanation when applicable.
7. Recommended next action, such as “Review this word in Anki, then refresh vocabulary.”

## 7. Generate

### Prerequisite panel

Show three independently actionable checks: Text AI, vocabulary snapshot (>= 50), and premise. TTS is shown as optional and never blocks generation. Each failed check links to its configuration screen and preserves the generation draft.

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
- Global furigana, spacing, markers, and translations switches.

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
- Touch targets and sentence actions remain usable without hover or long-press.
- All audio begins only after explicit activation.

