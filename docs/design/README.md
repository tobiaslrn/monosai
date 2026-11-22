# Monosai design

The one page for people: what Monosai should feel like, and how its design is changed. Agents work
from [the rules](rules.md); nothing here binds them.

## What it should feel like

A quiet desk with a good book on it. A page of Japanese should feel like something to sit with,
not a form to complete.

- **The text is the application.** Japanese is the only content. Everything else is apparatus that
  earns its place by being needed at the moment it appears. The reading surface stays still and
  uncoloured except where it marks the Japanese itself.
- **A word on screen is doing work or it is not there.** Explanation is a cost every future reader
  pays. It is worth paying where money, the network or the learner's own text is at stake, and
  rarely elsewhere. Help is the exception: there the learner sat down to read.
- **Repetition earns silence.** A control pressed fifty times a session may drop its label; one
  pressed once a week may not.
- **State is shown, not narrated.** A control that is busy, filled or disabled says what a sentence
  would have said.
- **Everything scales from the reader's own settings.** Browser text size, the system text scale and
  the reader scale are inputs the layout obeys.
- **One look per role.** A row, a button, a dialog looks and behaves the same everywhere, so the
  learner learns it once.
- **Familiar before clever.** Each control is the one an Android or iPhone user already knows.

## Colour, motion and voice

- **Warm paper, sage for action, lavender for highlight.** The warmth is identity, not decoration.
  Sage means "press this" and nothing else. Success, warning, error, setup and info each have one
  meaning. Lavender only marks the open word or sentence in the reader.
- **The reading surface is strictest.** It carries the two reading markers (drawn as squiggles as
  well as colours, so colour never carries meaning alone), the tint on the sentence read aloud and
  the tint on the open word, and nothing else. Every new marker costs the text legibility.
- **Dark mode is layers.** Surfaces get lighter as they rise; a sunken or tinted fill is a
  translucent layer, never a darker slab that reads as a hole.
- **Motion explains, then settles.** It shows where something came from, that work is going on, or
  that a value changed. Nothing bounces, a press only changes colour, and pages switch instantly.
- **Words are minimal.** Say what the learner needs to act, in plain words, and stop. Sentence case,
  British spelling, no exclamation marks.

## Where the design lives

| To see or change                    | Look at                                                         |
| ----------------------------------- | --------------------------------------------------------------- |
| Every primitive in every state      | The gallery: `npm run build:gallery`, then `npm run visual`     |
| A real screen, light and dark       | `npm run shots -- --grep <screen>` (from `web`)                 |
| The rules agents follow             | [rules.md](rules.md)                                            |
| What is checked automatically       | [checks.md](checks.md) (generated)                              |
| How a change is judged              | [visual-review.md](visual-review.md)                            |
| Help prose                          | [help-writing.md](help-writing.md)                              |
| The mascot                          | [mascot.md](mascot.md)                                          |
| Colours, sizes, motion              | `web/src/styles/_tokens.scss`, `_motion.scss`                   |
| One primitive's behaviour           | Its doc comment in `web/src/app/shared-ui/<name>/`              |

## How to change it

- **Change a rule.** Tell an agent which rule and what it should say. It edits `rules.md`, the check
  in `npm run design:check` and the code in one commit. Only you change a rule.
- **Add or change a primitive.** Ask for the need, not a one-off variant: the change applies to
  every place that uses the primitive. Review its gallery page in the pull request.
- **Approve a visual change.** Open the before and after shots the agent attaches. The screenshot
  baselines fail CI when a primitive changes; when the change is intended, run the **Visual
  baselines** workflow on that branch to record the new look. Agents never do this.
- **Keep it short.** `rules.md` and `AGENTS.md` have line budgets that a check enforces. When a rule
  can become a check, it leaves `rules.md` and appears in `checks.md`.
