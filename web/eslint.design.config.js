import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import { SCRIPT_RESTRICTIONS, TEMPLATE_RESTRICTIONS } from './scripts/design-lint-rules.mjs';

/**
 * The design rules that need a syntax tree, run by `npm run design:check`
 * (scripts/design-check.mjs). It is untyped so it stays fast; the full typed lint is
 * `eslint.config.js`. Inline disable comments are ignored here, so a design rule can be
 * set aside only on the shrinking exemption list (scripts/design-rules-exemptions.json).
 */
const features = ['src/app/features/**', 'src/app/core/**'];

export default [
  {
    ignores: ['**/*.spec.ts'],
  },
  {
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'off' },
  },
  {
    files: features.map((root) => `${root}/*.ts`),
    languageOptions: { parser: tseslint.parser },
    processor: angular.processInlineTemplates,
    rules: { 'no-restricted-syntax': ['error', ...SCRIPT_RESTRICTIONS] },
  },
  {
    files: features.map((root) => `${root}/*.html`),
    languageOptions: { parser: angular.templateParser },
    rules: { 'no-restricted-syntax': ['error', ...TEMPLATE_RESTRICTIONS] },
  },
];
