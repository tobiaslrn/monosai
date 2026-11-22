# 0099 — Design knowledge has one home

Date: 2026-11-22
Status: Accepted. Retires `docs/design/design-system.md`. Rule numbers in earlier records keep
their meaning; [`docs/design/checks.md`](../design/checks.md) says where each retired number went.

## Context

The interface was built almost entirely by coding agents from about 2,500 lines of design prose:
a 343-line rulebook of 55 rules, a 1,625-line design system, and three shorter guides. The
rulebook said it beat the design system, yet both held rules, values and component APIs, and they
disagreed in at least eight places: whether there are four or five overlay kinds, whether
"accent" meant the sage action colour or the lavender, which button deletes from a dialog footer,
whether a busy control may be disabled. About 40% of the design system described single screens,
because every feature commit added a sentence to it. Only three rules were fully checked by a
script, and the component types allowed much of what the prose forbade.

Published guidance from Anthropic and OpenAI, and measurements from Atlassian, Vercel and
instruction-following research, agree on four points. An agent follows a short, always-loaded file
far better than a long one it has to decide to open. A rule that can be checked belongs in a check
whose message says the fix, because style rules are the first an agent drops as rules pile up.
Agents copy neighbouring code more faithfully than they follow prose. Taste is judged best from
screenshots by a reviewer that did not make the change.

## Decision

**Each kind of design knowledge has exactly one home, chosen by how an agent meets it.**

| Knowledge                                   | Home                                                        |
| ------------------------------------------- | ----------------------------------------------------------- |
| Values                                      | `web/src/styles/`                                           |
| How a primitive looks and behaves           | The primitive and its doc comment; the gallery build        |
| Rules a script can check                    | `npm run design:check`, which prints the fix and the rule   |
| Rules that need judgment, and the glossary  | `docs/design/rules.md`, loaded into every Claude Code session |
| Behaviour (Back, Escape, focus, gestures)   | Tests                                                       |
| Taste                                       | Screenshot baselines of the gallery and the `design-reviewer` agent |
| Help prose                                  | `docs/design/help-writing.md`, loaded for Help files        |
| Why the interface looks as it does          | `docs/design/README.md`, for people                         |

Rule numbers stay stable. A rule that a check, a type or a primitive now carries leaves the
rulebook and is listed as retired in the generated `checks.md`. The rulebook and `AGENTS.md` have
line budgets that a check enforces, so neither grows back into a manual. Docs describe rules and
structure, not screens.

Where the old documents disagreed, the code and the rulebook won: five overlay kinds; the sage
tone is **action** and the lavender is **highlight**, which is not a tone; a footer action that
deletes is a danger ghost; a busy control is never disabled; the toast is the one app-wide
surface, for work the learner did not start.

## Consequences

- An agent reads about 250 lines of rules and workflow instead of being sent to 2,000.
- Most rules fail loudly at `npm test` instead of depending on an agent remembering them.
- Screen-level detail that only the old design system recorded is gone; the code and its tests
  are the record.
- Changing a rule means changing its check in the same commit, which the owner approves.
