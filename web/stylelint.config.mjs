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

/** The end of every design message: the rule in docs/design/rules.md. */
const cite = (rule) => `(${rule} in docs/design/rules.md)`;

const hoverGuardMessage = (selector) =>
  `"${selector}" uses :hover without the mouse guard, so a phone keeps the hover after a ` +
  `tap. Fix: prefix the selector with :host-context(html[data-pointer='mouse']) in a ` +
  `component, or :where(html[data-pointer='mouse']) in src/styles. ${cite('R37')}`;

const handWrittenMotionMessage = (property) =>
  `"${property}" is written by hand. Fix: include a named motion from ` +
  `src/styles/_motion.scss (\`@include motion.enter;\`). ${cite('R44')}`;

// Which token family each allow-listed property takes, and the rule behind it.
const tokenFamilies = [
  [/^(transition|animation)/, null],
  [/^(background|background-color|border-color|color)$/, ['a colour token', 'R39']],
  [/^border-radius$/, ['a radius role token (--radius-*)', 'R38']],
  [/^box-shadow$/, ['a shadow token (--shadow-*)', 'R39']],
  [/^font-(size|weight)$/, ['a type role token', 'R34']],
];

const tokenValueMessage = (property, value) => {
  const family = tokenFamilies.find(([pattern]) => pattern.test(property))?.[1];
  if (family === null) return handWrittenMotionMessage(property);
  const [token, rule] = family ?? ['a token', 'R39'];
  return (
    `"${property}: ${String(value)}" is a literal value. Fix: use ${token} from ` +
    `src/styles/_tokens.scss. ${cite(rule)}`
  );
};

// Motion is defined once, in src/styles/_motion.scss: durations, curves, the
// keyframes and the named motions built from them. Everywhere else a moving
// thing includes a named motion (`@include motion.enter;`), so a transition or
// an animation written out by hand — or a keyframe of a component's own — is
// rejected. `none` stays allowed, for a state that must not move.
const handWrittenMotion = {
  'at-rule-disallowed-list': [
    ['keyframes'],
    {
      message: () =>
        `A component writes its own @keyframes. Fix: keyframes live in ` +
        `src/styles/_motion.scss; include a named motion. ${cite('R44')}`,
    },
  ],
  'declaration-property-value-allowed-list': [
    { '/^(transition|animation)(-[a-z-]+)?$/': ['none'] },
    { message: handWrittenMotionMessage },
  ],
};

// src/styles is outside the component config (it owns the tokens and the .mn-*
// primitives), but its hover rules need the same guard. The scan applies this
// one rule to it.
export const globalStylesConfig = {
  customSyntax: 'postcss-scss',
  rules: {
    'selector-disallowed-list': [[unguardedHover], { splitList: true, message: hoverGuardMessage }],
    ...handWrittenMotion,
  },
};

// The motion module itself is where durations, curves and keyframes are written.
export const motionModuleConfig = {
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
    'color-no-hex': [
      true,
      {
        message: (hex) =>
          `${String(hex)} is a colour literal. Fix: use a colour token from ` +
          `src/styles/_tokens.scss. ${cite('R39')}`,
      },
    ],
    'comment-empty-line-before': null,
    'declaration-block-no-redundant-longhand-properties': null,
    'declaration-empty-line-before': null,
    ...handWrittenMotion,
    'declaration-property-value-allowed-list': [
      {
        '/^(transition|animation)(-[a-z-]+)?$/': ['none'],
        background: [tokenValue],
        'background-color': [tokenValue],
        'border-color': [tokenValue],
        'border-radius': [tokenList],
        'box-shadow': [tokenList],
        color: [tokenValue],
        'font-size': [tokenValue],
        'font-weight': [tokenValue],
      },
      { message: tokenValueMessage },
    ],
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
            : `"${selector}" styles a .mn-* primitive from a component. Fix: change the ` +
              `primitive in src/styles or web/src/app/shared-ui/ for every use. ${cite('R2')}`,
      },
    ],
    'selector-class-pattern': null,
  },
};
