import { defineConfig } from 'vitest/config';

/**
 * Runner for the manual compatibility checks.
 *
 * These are not part of `npm run verify` and CI never runs them, because they
 * read real Anki collections that cannot be committed. They are kept as tests
 * rather than as scripts so they exercise exactly the production pipeline the
 * ordinary suite does, and they are typechecked with everything else.
 *
 * The Angular builder owns the ordinary unit-test run; this config exists only
 * because that run deliberately matches `*.spec.ts` and nothing else.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.manual.ts'],
    environment: 'jsdom',
    globals: false,
  },
});
