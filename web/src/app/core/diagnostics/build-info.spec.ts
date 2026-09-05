import { describe, expect, it } from 'vitest';
import packageJson from '../../../../package.json';
import { APP_VERSION, readBuildInfo } from './build-info';

describe('build info', () => {
  it('matches the package version', () => {
    expect(APP_VERSION).toBe(packageJson.version);
  });

  it('falls back to a development commit marker', () => {
    expect(readBuildInfo().buildCommit.length).toBeGreaterThan(0);
  });
});
