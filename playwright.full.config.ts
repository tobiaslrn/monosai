import { defineConfig } from '@playwright/test';
import smokeConfig from './playwright.config';

export default defineConfig({
  ...smokeConfig,
  grep: undefined,
  projects: smokeConfig.projects?.map((project) =>
    project.name === 'android-chrome' ? { ...project, grep: /@mobile/ } : project,
  ),
});
