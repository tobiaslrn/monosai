import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const windows = process.platform === 'win32';
const tasks = [
  ':app:testDebugUnitTest',
  ':app:assembleDebug',
  ':app:lintDebug',
  ':app:runtimeLicenses',
];
const wrapper = path.resolve('android-bridge', windows ? 'gradlew.bat' : 'gradlew');
const result = windows
  ? spawnSync(`"${wrapper}" ${tasks.join(' ')}`, {
      cwd: 'android-bridge',
      stdio: 'inherit',
      shell: true,
    })
  : spawnSync(wrapper, tasks, { cwd: 'android-bridge', stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const licenses = spawnSync(
  process.execPath,
  [
    'scripts/licenses/check-licenses.mjs',
    '--check',
    '--gradle-report',
    'android-bridge/app/build/reports/runtime-dependencies.json',
  ],
  { stdio: 'inherit' },
);
process.exit(licenses.status ?? 1);
