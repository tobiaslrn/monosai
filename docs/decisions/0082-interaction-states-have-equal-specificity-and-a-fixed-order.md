# 0082 — Interaction states have equal specificity and a fixed order

Date: 2026-10-25
Status: Accepted

## Context

The shared button rules guarded hover so that touch input never inherits it:
`html[data-pointer='mouse'] .mn-button:hover:not(:disabled):not([aria-disabled='true'])`.
That selector weighs (0,5,1). The rule that draws a pressed toggle,
`.mn-button[aria-pressed='true']:not(:disabled):not([aria-disabled='true'])`, weighs
(0,4,0). The guard was written for correctness and its weight was an accident, but it
decided the cascade:

- Under a mouse, a chip that had just been clicked showed the grey hover surface instead of
  the selection tint, and after it was deselected it still looked filled while hovered.
- A pressed chip that became disabled lost its tint, so a chosen option looked unchosen.
- A component that styled a variant of `.mn-icon-button` lost to the global hover and
  `:active` rules, so the player's Play control turned grey with a white glyph on every tap.

Raising a selector's weight to win one case loses the next, and every fix of that kind
makes the following state harder to add.

## Decision

**Interaction states differ by source order, not by specificity.**

- Every qualifier of a state rule is wrapped in `:where()`: the pointer guard
  (`:where(html[data-pointer='mouse'])`), the pseudo-class (`:where(:hover)`), the
  attribute (`:where([aria-pressed='true'])`), and the enabled and disabled tests. A state
  rule therefore weighs exactly the primitive's own class, the same as its resting rule.
- The order within a primitive is fixed: **rest, variants, hover, active, pressed, pressed
  and hover, disabled, pressed and disabled.** A variant's hover follows the base hover so
  it beats it. A variant's resting rule precedes the base hover so hover can recolour it.
- A selected control stays readable under every other state. Pressed and hover takes a
  deeper selection tint (`--action-primary-soft-hover`). Pressed and disabled keeps the
  selection tint and its text colour behind the dashed disabled boundary, so a chosen chip
  that cannot be changed still shows that it is chosen.
- `aria-pressed` is the only state a toggle has. A component does not mirror it in a class,
  and it does not paint it a second time.
- A component does not recolour a shared control's states. A role that needs a different
  fill is a modifier in the shared file: `.mn-icon-button--primary` is the large filled
  circle (the player's Play), with its own hover, press, and disabled treatment. Components
  keep position, size through `--icon-button-primary-size`, and layout.
- The same rule applies to every shared primitive that has a pointer guard: list rows,
  segmented options, and settings rows. A rule that resets a resting background sits with
  the resting rules, before hover.

A busy control is the next state of this order. Its rule belongs after pressed and hover
and before disabled.

## Consequences

- A new state is a rule added at its place in the order, with no weight to calculate. The
  order is written as a comment above the state rules in `_button.scss`.
- A component stylesheet is scoped by an attribute, so it weighs more than a shared state
  rule. A component rule that sets a colour or background on a shared control therefore
  overrides every state of it. The design system forbids that, and the shared modifiers
  exist so nothing needs it.
- The pressed and hover tint is a mix of the action colour into the selection tint. It is a
  token, so it follows both palettes and no component repeats it.
- Hover stays a mouse state, so a phone never keeps a control tinted after a tap; only the
  specificity of the guard changed.
