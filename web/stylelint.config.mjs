const token = String.raw`var\(--[a-z0-9-]+\)`;
const keyword = String.raw`(?:inherit|currentcolor|transparent|none|0)`;
const tokenValue = new RegExp(`^(?:${token}|${keyword})$`, 'i');
const tokenList = new RegExp(`^(?:(?:${token}|${keyword})\\s*)+$`, 'i');

// Hover is a mouse state: a phone reports it after a tap and never takes it
// back. The selector therefore has to name the pointer guard, written as
// `:host-context(html[data-pointer='mouse'])` in a component and as
// `:where(html[data-pointer='mouse'])` in a global partial. Every rule below
// sets `splitList`, so each selector of a comma list is tested on its own and
// a guarded selector does not excuse its unguarded neighbour. The guard must
// name the mouse, since `data-pointer='touch'` in front of a hover is the
// opposite of a guard, and case is ignored so `:HOVER` cannot slip past.
const unguardedHover = /^(?![\s\S]*data-pointer=['"]?mouse\b)[\s\S]*:hover/i;

const hoverGuardMessage = (selector) =>
  `Unexpected unguarded :hover in "${selector}". Hover is a mouse-only state: prefix the ` +
  `selector with :host-context(html[data-pointer='mouse']) in a component, or ` +
  `:where(html[data-pointer='mouse']) in src/styles.`;

// src/styles is outside the component config (it owns the tokens and the .mn-*
// primitives), but its hover rules need the same guard. The scan applies this
// one rule to it.
export const globalStylesConfig = {
  customSyntax: 'postcss-scss',
  rules: {
    'selector-disallowed-list': [[unguardedHover], { splitList: true, message: hoverGuardMessage }],
  },
};

export default {
  extends: ['stylelint-config-standard-scss'],
  customSyntax: 'postcss-scss',
  ignoreFiles: ['src/styles/**'],
  rules: {
    // Prettier owns whitespace, and the existing UI deliberately uses BEM
    // names and browser-prefixed reading controls.
    'at-rule-empty-line-before': null,
    'color-no-hex': true,
    'comment-empty-line-before': null,
    'declaration-block-no-redundant-longhand-properties': null,
    'declaration-empty-line-before': null,
    'declaration-property-value-allowed-list': {
      background: [tokenValue],
      'background-color': [tokenValue],
      'border-color': [tokenValue],
      'border-radius': [tokenList],
      'box-shadow': [tokenList],
      color: [tokenValue],
      'font-size': [tokenValue],
      'font-weight': [tokenValue],
    },
    'length-zero-no-unit': null,
    'media-feature-range-notation': null,
    'number-max-precision': null,
    'property-no-vendor-prefix': null,
    'rule-empty-line-before': null,
    // A component may use a shared class in a descendant selector, but it may
    // not become the owner of a .mn-* primitive. The shared files are outside
    // the app scan and are the only place where those selectors may start.
    'selector-disallowed-list': [
      [/^\.mn-/, unguardedHover],
      {
        splitList: true,
        message: (selector) =>
          unguardedHover.test(selector)
            ? hoverGuardMessage(selector)
            : `Unexpected selector "${selector}": a component may not own a .mn-* primitive.`,
      },
    ],
    'selector-class-pattern': null,
  },
};
