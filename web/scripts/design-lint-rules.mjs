// The design rules that need a template or TypeScript syntax tree. Each entry is
// an ESLint `no-restricted-syntax` selector and the message it prints: what is
// wrong, how to fix it, and the rule it enforces. `eslint.design.config.js`
// applies them; `design-lint.test.mjs` proves each still fires, because the
// template AST's node names change across Angular versions.

/** `Element[name="mn-settings-row"]`, the row that is the control itself. */
const ROW = 'Element[name="mn-settings-row"]';

/** What every failure ends with: the rule, so the reader can look it up. */
export const cite = (rule) => `(${rule} in docs/design/rules.md)`;

const restriction = (rule, selector, what, fix) => ({
  selector,
  message: `${what}. Fix: ${fix}. ${cite(rule)}`,
});

const ROW_FIX =
  'the row is the control. Give it `action` or `end="nav"` and handle `(pressed)`, or open a ' +
  'dialog from it; a row holds only an mn-select, an mn-segmented-control or a ' +
  '[mn-settings-row-detail] span';

/** Selectors for inline templates in features and core. */
export const TEMPLATE_RESTRICTIONS = [
  restriction(
    'R15',
    `${ROW} Element[name="button"], ${ROW} :matches(TextAttribute, BoundAttribute)[name="mnButton"]`,
    'A button sits inside an mn-settings-row',
    ROW_FIX,
  ),
  restriction(
    'R15',
    `${ROW} Element[name=/^(input|textarea|select|mn-field|mn-search-field|mn-secret-field|mn-range-field)$/]`,
    'A field or boxed select sits inside an mn-settings-row',
    'a typed value is a `›` row (`end="nav"`) that opens a field dialog; a choice is an ' +
      'mn-select projected into the row (`end="choice"`)',
  ),
  restriction(
    'R15',
    `${ROW} TextAttribute[name="class"][value=/(^|\\s)mn-status-pill/], ${ROW} BoundAttribute[name=/^mn-status-pill/]`,
    'A status pill sits inside an mn-settings-row',
    "put where the setting stands in the row's own `status` and `statusText`, which lead its " +
      'summary',
  ),
  restriction(
    'R20',
    'Element[name="select"]',
    'A native <select> is used',
    'use mn-select for a short list, or a `›` row opening the model picker dialog for a long ' +
      'or searched one',
  ),
  restriction(
    'R2',
    'TextAttribute[name="class"][value=/(^|\\s)mn-[a-z0-9-]+__/], BoundAttribute[name=/^mn-[a-z0-9-]+__/]',
    "A feature uses a primitive's internal class (`mn-*__*`)",
    'compose the primitive through its inputs and slots; if it lacks one, add it to the ' +
      'primitive in web/src/app/shared-ui/ for every use',
  ),
  restriction(
    'R54',
    'Text[value=/—/]',
    'Interface text uses an em dash',
    'split it into two sentences with a full stop, or use "·" in a metadata line',
  ),
  restriction(
    'R54',
    'Text[value=/!/]',
    'Interface text uses an exclamation mark',
    'state the fact plainly and end without one',
  ),
  restriction('R54', 'Text[value=/ & /]', 'Interface text uses "&"', 'spell out "and"'),
  restriction(
    'R54',
    'Text[value=/\\.\\.\\./]',
    'Interface text uses three dots',
    'cut them; work in progress ends with the single "…" character',
  ),
];

const VAGUE_CONFIRM = '/^\\s*(ok|okay|yes|continue|really)\\b/i';

/** Selectors for the TypeScript of features and core. */
export const SCRIPT_RESTRICTIONS = [
  restriction(
    'R52',
    `Property[key.name="confirmLabel"] Literal[value=${VAGUE_CONFIRM}], ` +
      `Property[key.name="confirmLabel"] TemplateElement[value.cooked=${VAGUE_CONFIRM}]`,
    'A confirmation\'s confirm button says "OK", "Yes", "Continue" or "Really"',
    'repeat the verb of the title ("Delete this story?" confirms with "Delete")',
  ),
];

/** The rule an ESLint message from these restrictions cites, or null. */
export function ruleOf(message) {
  return /\((R\d+) in docs\/design\/rules\.md\)$/.exec(message)?.[1] ?? null;
}
