# Visual review checklist

How to judge screenshots before a visual change is accepted. [The design rules](rules.md) say
what is allowed. This list says whether the result is good. A change passes only when both
are met. Meeting the task description is never enough: if a spec produces something that
looks worse, the spec is wrong, so fix it and tell the owner.

Work through the passes in order. Write down a verdict per screen (better, same or worse)
with the issues found, before checking any rule.

## Pass 1: first impression (before any checklist)

- Look at the whole screen for five seconds, at full size. Does it look like a polished,
  calm, friendly app that a good designer would ship? If not, name the first thing that looks
  off. That is the top issue.
- Put the before and after side by side at the same scale. Which one would the owner rather
  use? If the answer is "before" for any part of the screen, that part is a regression.
- Squint, or look at a blurred view. Is there one clear focal point, with the primary action
  easy to find? Do the blocks look balanced, without one side much heavier or emptier?
- Does the screen still have its character? The mascot, the illustrations and the warmth are
  part of the product. They must never shrink into a thumbnail, get cropped awkwardly, or be
  squeezed to make room for text.

## Pass 2: regressions

Compare every prominent element with the before shot, even ones the change was not about:

- Imagery: same or better size, crop, sharpness and placement.
- Hierarchy: the most important thing is still the most prominent.
- White space: no new dead areas, no new cramped areas.
- Text: no new truncation, wrapping or orphaned words.
- Controls: nothing moved, resized or changed emphasis without a reason.

A regression blocks the change, even when a spec asked for it.

## Pass 3: hierarchy and proportion

- The headline, the illustration and the actions are sized to each other, not just to fit
  a line count. A smaller headline does not mean a smaller picture.
- One filled primary action per surface. The secondary actions are visibly quieter.
- The reading order matches the order of importance.
- Each block has the visual weight its importance deserves: a hint is small and quiet, an
  empty state invites, an error stands out.

## Pass 4: layout, alignment and spacing

- Every block lines up with the column edges. Text inside cards starts at the same inset on
  every card. Nothing is indented for no reason.
- Spacing follows the scale and keeps a steady rhythm: the same gap between the same kinds
  of blocks everywhere.
- Icons are optically centred with their text, and icon badges share one size.
- Buttons in one row have the same height. They are side by side when they fit and stack
  only when they do not.
- On desktop, content keeps a sensible measure and does not stretch across the screen.

## Pass 5: type and text

- Each text uses one of the type roles. Sizes step down clearly from title to body to meta.
- Headlines break into a few balanced lines: no single word on its own line, and no headline
  taller than the picture beside it.
- Truncation only appears where it is meant to (excerpts, long titles). It never cuts a
  label, a button or a number.
- Japanese text breaks at sensible points and keeps its line height. Furigana does not
  collide.
- Copy is short, plain, sentence case, and the same word is used for the same thing.

## Pass 6: colour, tone and dark mode

- Each tone means one thing. Colour alone never carries a meaning; an icon or word goes
  with it.
- In dark mode: surfaces read as layers, nothing glows or looks like a hole, text and
  icons keep their contrast, and illustrations sit well on the dark background.
- Disabled things look disabled but stay readable. Selected things are clearly selected.

## Pass 7: consistency across the app

- Put every instance of each role you touched on one contact sheet: light and dark, phone
  and desktop. Anything that differs other than the text is a defect (R3).
- Compare with the same role on other screens that were not touched: rows, buttons, pills,
  dialogs, empty states, status lines.

## Pass 8: sizes and states

- Check the narrowest phone, a common phone and desktop. Check for horizontal overflow,
  clipped focus rings, and touch targets below the rules' minimum.
- Check the full-page shot, not just the first screen: the bottom of the page counts too.
- Check every state the change can show: empty, loading, filled, long content, error,
  disabled, focus. Loading must not make the layout jump.
- A focus ring or hover left over from the test script is a capture artefact. Recapture
  instead of judging through it.

## Pass 9: rules

Only now go through the [review checklist in the rules](rules.md#12-review-checklist).

## Reporting

For each screen, state the verdict and the issues, ranked by how visible they are. Never
report "matches the spec" as a pass. Report what it looks like.
