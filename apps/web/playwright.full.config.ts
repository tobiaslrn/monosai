import { defineConfig } from '@playwright/test';
import smokeConfig from './playwright.config';

// Without the smoke config's `grep`, every test runs.
const { grep: _smokeGrep, projects, ...shared } = smokeConfig;

export default defineConfig({
  ...shared,
  ...(projects === undefined
    ? {}
    : {
        projects: projects.map((project) =>
          project.name === 'android-chrome' ? { ...project, grep: /@mobile/ } : project,
        ),
      }),
});
