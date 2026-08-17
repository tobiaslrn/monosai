import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import importPlugin from 'eslint-plugin-import';

/**
 * Architectural zones (see docs/spec/system-architecture.md):
 *
 *   presentation -> application -> domain
 *                        |           ^
 *                        v           |
 *                   infrastructure --+
 */
const layerZones = [
  { target: './src/app/domain', from: './src/app/application' },
  { target: './src/app/domain', from: './src/app/infrastructure' },
  { target: './src/app/domain', from: './src/app/features' },
  { target: './src/app/domain', from: './src/app/core' },
  { target: './src/app/domain', from: './src/app/shared-ui' },
  { target: './src/app/application', from: './src/app/infrastructure' },
  { target: './src/app/application', from: './src/app/features' },
  { target: './src/app/application', from: './src/app/shared-ui' },
  { target: './src/app/application', from: './src/app/core' },
  { target: './src/app/features', from: './src/app/infrastructure' },
  { target: './src/app/shared-ui', from: './src/app/features' },
  { target: './src/app/shared-ui', from: './src/app/application' },
  { target: './src/app/shared-ui', from: './src/app/infrastructure' },
  { target: './src/app/infrastructure', from: './src/app/features' },
  { target: './src/app/infrastructure', from: './src/app/core' },
];

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', '.angular/**', 'playwright-report/**', 'test-results/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['playwright.config.ts'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { import: importPlugin },
    settings: {
      'import/resolver': { typescript: { alwaysTryTypes: true } },
    },
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'mn', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'mn', style: 'kebab-case' },
      ],
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // Angular's `output<void>()` and CDK dialog generics are idiomatic void usage.
      '@typescript-eslint/no-invalid-void-type': 'off',
      '@typescript-eslint/no-unnecessary-type-arguments': 'off',
      '@typescript-eslint/no-extraneous-class': ['error', { allowEmpty: true }],
      '@typescript-eslint/consistent-indexed-object-style': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      'import/no-cycle': ['error', { maxDepth: Infinity }],
      'import/no-restricted-paths': ['error', { zones: layerZones }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAsExpression > TSAnyKeyword, TSTypeAssertion > TSAnyKeyword',
          message: 'Casting through `any` is not allowed; validate at the adapter boundary.',
        },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.spec.ts', 'src/testing/**/*.ts'],
    rules: {
      'import/no-restricted-paths': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {},
  },
  {
    files: ['e2e/**/*.ts', '*.config.ts', 'scripts/**/*.{ts,mjs,js}'],
    rules: {
      'no-console': 'off',
    },
  },
);
