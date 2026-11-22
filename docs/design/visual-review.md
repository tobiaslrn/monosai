# Visual review

How to judge screenshots of a visual change. [The rules](rules.md) say what is allowed; this
says whether the result is good. Both must pass. If a task's spec produces something that looks
worse, the spec is wrong: fix it and tell the owner. The `design-reviewer` agent works from
this page.

## Capture

1. Before changing anything: `npm run shots -- --grep <scenario>` (from `web`), then move
   `test-results/shots` to `test-results/shots-before`.
2. After the change, capture again, then `npm run shots:sheet` for the before/after sheet.
3. For every primitive you touched, also open its gallery page (`npm run visual` shows any
   change to it as a diff).

## Judge, in this order

Write down a verdict per screen (better, same or worse) before checking any rule.

1. **First impression.** Look at the whole screen at full size for five seconds. Does it look
   like a calm, polished app a good designer would ship? Put before and after side by side: if
   the owner would rather have "before" for any part, that part is a regression.
2. **Regressions.** Compare every prominent element, even ones the change was not about:
   imagery (size, crop, placement), hierarchy, white space, truncation and wrapping, and any
   control that moved, resized or changed emphasis.
3. **Character.** The mascot, illustrations and warmth never shrink into a thumbnail, get
   cropped awkwardly or squeezed to make room for text.
4. **Hierarchy.** One clear focal point and one filled primary. The reading order matches the
   order of importance; a hint is quiet, an error stands out.
5. **Layout.** Blocks line up with the column edges and text starts at the same inset on every
   card. Gaps between the same kinds of block are the same everywhere. Buttons in a row share
   a height and stack only when they do not fit.
6. **Type and text.** Each text uses a type role and sizes step down clearly. No orphaned word
   in a headline, no truncated label, button or number. Japanese breaks sensibly and furigana
   does not collide.
7. **Colour and dark mode.** Each tone means one thing. In dark mode surfaces read as layers,
   nothing glows or looks like a hole, and contrast holds. Disabled stays readable.
8. **Consistency.** Every instance of a touched role matches its gallery tile and the same role
   on untouched screens (R3).
9. **Sizes and states.** The narrowest phone, a common phone and desktop; the whole page, not
   just the first screen; every state the change can show (empty, loading, long content, error,
   focus). Loading never makes the layout jump. A leftover focus ring or hover from the script
   is a capture artefact: recapture.
10. **Rules.** Only now check the change against [the rules](rules.md).

## Report

For each screen: the verdict and the issues, ranked by how visible they are. Never report
"matches the spec" as a pass; report what it looks like. State the result in the commit or PR.
