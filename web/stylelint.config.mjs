const token = String.raw`var\(--[a-z0-9-]+\)`;
const keyword = String.raw`(?:inherit|currentcolor|transparent|none|0)`;
const tokenValue = new RegExp(`^(?:${token}|${keyword})$`, 'i');
const tokenList = new RegExp(`^(?:(?:${token}|${keyword})\\s*)+$`, 'i');

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
    'selector-disallowed-list': [/^\.mn-/],
    'selector-class-pattern': null,
  },
};
