import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The build needs Java 21: the unit tests run Robolectric at SDK 36 on the Gradle daemon's JDK.
// Gradle 8.14 itself stops at Java 24.
export const MIN_JAVA = 21;
export const MAX_JAVA = 24;

/** Major version from `java -version` output: 21 from `openjdk version "21.0.2"`, 8 from "1.8.0_402". */
export function parseJavaMajor(output) {
  const match = /version "(\d+)(?:\.(\d+))?/.exec(output);
  if (!match) return null;
  return match[1] === '1' ? Number(match[2]) : Number(match[1]);
}

/** The value of `org.gradle.java.home` in a properties file's text, or null. The last entry wins. */
export function readGradleJavaHome(text) {
  let found = null;
  for (const line of (text ?? '').split(/\r?\n/)) {
    const match = /^\s*org\.gradle\.java\.home\s*[=:]\s*(.*?)\s*$/.exec(line);
    if (match) found = match[1].replace(/\\\\/g, '\\').replace(/\\:/g, ':') || null;
  }
  return found;
}

function runJava(java) {
  const result = spawnSync(java, ['-version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return `${result.stdout}${result.stderr}`;
}

function readFile(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Checks the JDK that runs Gradle's daemon, and so the build and its tests.
 * Gradle takes `org.gradle.java.home` from, in order, the command line, the Gradle user home's
 * gradle.properties, then the project's gradle.properties; when it is set that JDK is the daemon's.
 * Otherwise the daemon uses the client's JDK: JAVA_HOME, then `java` on PATH.
 * Returns an error message, or null when that JDK can run the build.
 */
export function checkJdk({
  env = process.env,
  windows = process.platform === 'win32',
  run = runJava,
  read = readFile,
  homedir = os.homedir(),
  projectDir = path.resolve('apps/android'),
} = {}) {
  const userHome = env.GRADLE_USER_HOME?.trim() || path.join(homedir, '.gradle');
  const configured =
    readGradleJavaHome(read(path.join(userHome, 'gradle.properties'))) ??
    readGradleJavaHome(read(path.join(projectDir, 'gradle.properties')));
  const javaHome = windows ? env.JAVA_HOME?.replaceAll('"', '').trim() : env.JAVA_HOME?.trim();
  const home = configured ?? javaHome;
  const java = home ? path.join(home, 'bin', windows ? 'java.exe' : 'java') : 'java';
  const source = configured
    ? `org.gradle.java.home (${configured})`
    : home
      ? `JAVA_HOME (${home})`
      : '`java` on PATH';
  const required = `Java ${MIN_JAVA} to ${MAX_JAVA}`;
  const output = run(java);
  if (output === null) {
    return `Gradle needs ${required}, but ${source} could not be run. Fix or unset it, or put a JDK on PATH.`;
  }
  const major = parseJavaMajor(output);
  if (major === null) {
    return `Gradle needs ${required}, but the version of ${source} could not be read.`;
  }
  if (major < MIN_JAVA || major > MAX_JAVA) {
    return `Gradle needs ${required}, but ${source} is Java ${major}. Point JAVA_HOME at a supported JDK for this command; your environment is left unchanged.`;
  }
  return null;
}
