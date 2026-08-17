/**
 * Static build identity shown in Settings diagnostics.
 *
 * `APP_VERSION` is kept in sync with `package.json` by a unit test.
 * The commit is injected at build time (`ng build --define ...`) and defaults
 * to `development` for local builds.
 */
export const APP_VERSION = '0.1.0';

export interface BuildInfo {
  readonly appVersion: string;
  readonly buildCommit: string;
}

export function readBuildInfo(): BuildInfo {
  return {
    appVersion: APP_VERSION,
    buildCommit: typeof MONOSAI_BUILD_COMMIT === 'string' ? MONOSAI_BUILD_COMMIT : 'development',
  };
}
