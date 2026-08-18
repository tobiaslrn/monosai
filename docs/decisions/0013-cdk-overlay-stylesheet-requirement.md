# 0013 — The CDK overlay and a11y stylesheets are a hard build requirement

Date: 2026-08-18
Status: Accepted

## Context

Milestone 0 adopted `@angular/cdk` for dialogs and overlays (0001,
0003), and the Milestone 0 More sheet already used `Dialog` from
`@angular/cdk/dialog`. Building this milestone's word inspector sheet and
delete-confirmation dialog surfaced a defect that predates both: neither
`@angular/cdk/overlay-prebuilt.css` nor `@angular/cdk/a11y-prebuilt.css` was
ever imported anywhere in the application.

The CDK's `Dialog`/`Overlay` machinery works entirely through classes it
applies via JavaScript (`cdk-overlay-container`, `cdk-overlay-pane`,
`cdk-overlay-backdrop`, and the visually-hidden utility classes `a11y-prebuilt`
defines for live announcers and focus traps) but defines no positioning,
sizing, or backdrop styling of its own — that lives entirely in the two
stylesheets. Without them, every CDK dialog in the application, including the
already-shipped More sheet, rendered its content unpositioned in normal
document flow with no backdrop and no visible overlay behavior. This had not
been caught because Milestone 0/1's verification of the More sheet checked
that it opened and its content was reachable, not that it was positioned as an
overlay.

## Decision

Both stylesheets are imported in `src/styles.scss`, the one global stylesheet
already responsible for design tokens and base element styling, rather than
per-component. This is a hard, non-optional build requirement, not a
per-feature choice: any future use of `@angular/cdk/dialog` or
`@angular/cdk/overlay` anywhere in the application depends on it, and importing
it once globally is what makes that guarantee automatic rather than something
every future dialog author has to remember.

## Consequences

- Every CDK dialog in the application — the existing More sheet and this
  milestone's confirm dialog and word inspector sheet — now renders positioned,
  with a backdrop, and with the a11y utilities' visually-hidden and focus-trap
  behavior active, with no per-component change required.
- This is asserted indirectly by every test that opens a CDK dialog and
  expects to interact with it as an overlay (focus trapped, closable by
  Escape, backdrop present) rather than as inline content; there is no
  standalone regression test for "the stylesheet is imported," because the
  failure mode it prevents is exactly the one those tests already exercise.
- Any future stylesheet reorganization that moves global styles out of
  `src/styles.scss` must carry this import with it; it is called out here so
  that move does not silently drop it the way the original omission went
  unnoticed.

## Alternatives considered

**Import the stylesheets in each component that opens a dialog.** Rejected: it
makes correctness depend on every future dialog author remembering a build
detail unrelated to what their component does, for a resource that is small,
global, and has no reason to vary per feature.
