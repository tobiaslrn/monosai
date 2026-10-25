# 0083 — Floating panels that hang from a control are native popovers

Date: 2026-10-25
Status: Accepted

## Context

Four mechanisms put a panel under a control:

- The reading card's action menu was a native popover that also registered a document
  `pointerdown` and `keydown` listener per instance. A shelf of readings is virtualised, so
  every visible row carried its own two document listeners.
- The model picker and the OpenRouter connection panel registered the same two listeners
  themselves, and were positioned `absolute` inside cards that therefore needed
  `overflow: visible` and a `z-index` ladder (`mn-settings-card--overlay`,
  `mn-settings-group--overlay`) to stay unclipped.
- The reader's popovers and the Library's new-story surface use `PopoverService`, a CDK overlay.
- The reader's Story options sheet uses a CDK focus trap.

None of the first three did anything the browser does not already do for a native popover
with `popover="auto"`: a press outside and Escape dismiss it, Escape and `hidePopover()` return focus to what had
it (a press outside has already moved it), and it renders in the top layer. The model picker's panel was also only as wide as its trigger, so
its search box and model names were cut.

## Decision

A panel that hangs from a control is a **native popover**, built with `mnPopup` on the panel and
`mnPopupTrigger` on the control (`shared-ui/popup`). The trigger names the panel with
`popovertarget`, so opening is declarative; the panel anchors to the trigger with CSS anchor
positioning and falls back to the other side when there is no room (`_popup.scss`).

- No instance registers a listener. The browser owns outside dismissal, Escape, and focus
  return. The directive mirrors open and closed for `aria-expanded` and so content can
  render only while open: it takes the state from `beforetoggle`, before the panel is shown,
  and reads it from the element on `toggle`, because a panel the browser hides when its node
  moves or is removed fires no `toggle`.
- A menu (`[menu]="true"`) adds what `role="menu"` promises: focus on the first item when it
  opens, and Up, Down, Home, and End between items.
- A panel closes itself with `hide()`; a surface that then opens a dialog hides its panel
  first, so the dialog is not left over a panel.
- The CDK overlay (`PopoverService`) stays for the reader's floating surfaces and the
  new-story surface. They need what a menu does not: gesture-aware dismissal (a scroll is not a
  tap), a docked sheet on a phone, and stacking beneath the independent audio player. The
  reader's Story options sheet keeps its focus trap for the same reason: it is a modal sheet,
  not a panel on a control. Add words keeps its own native popover until it takes `mnPopup`.
- CDK Menu was weighed and rejected for the shared mechanism: it fits an action menu but not a
  panel holding a search field and a list, and it would have left two mechanisms.

## Consequences

- A row in a virtualised list owns no document listener, so scrolling a long shelf creates and
  destroys none.
- A panel is never clipped by the card it hangs from, so the `--overlay` settings modifiers and
  their `z-index` ladder are gone.
- The unit environment (jsdom) has no popover, so specs install `installPopoverShim()`, which
  stands in for the browser's `showPopover`, `hidePopover`, light dismiss, Escape, and focus
  return on Escape and `hidePopover()`. What the browser does is covered by the Playwright journeys that dismiss a reading
  menu, the connection panel, and a model picker.
- Anchor positioning needs a browser that supports it, which the reading card already required.
