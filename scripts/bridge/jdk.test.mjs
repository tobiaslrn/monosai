import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { checkJdk, parseJavaMajor, readGradleJavaHome } from './jdk.mjs';

const banner = (v) => `openjdk version "${v}" 2026-01-01\nOpenJDK Runtime Environment`;
const base = { windows: false, homedir: '/home/u', projectDir: '/repo/android-bridge' };
const files = (map) => (file) => map[file.replaceAll('\\', '/')] ?? null;

test('reads the major version from both numbering schemes', () => {
  assert.equal(parseJavaMajor(banner('21.0.12')), 21);
  assert.equal(parseJavaMajor(banner('25.0.2')), 25);
  assert.equal(parseJavaMajor(banner('17')), 17);
  assert.equal(parseJavaMajor('java version "1.8.0_402"'), 8);
  assert.equal(parseJavaMajor('nonsense'), null);
});

test('reads org.gradle.java.home from properties text', () => {
  assert.equal(readGradleJavaHome('a=b\norg.gradle.java.home=/jdk21\n'), '/jdk21');
  assert.equal(readGradleJavaHome('org.gradle.java.home = C\\:\\\\jdk\r\n'), 'C:\\jdk');
  assert.equal(readGradleJavaHome('x=1'), null);
  assert.equal(readGradleJavaHome(null), null);
});

test('accepts a supported JAVA_HOME', () => {
  const run = (java) => (java.includes('good') ? banner('21.0.2') : null);
  assert.equal(checkJdk({ ...base, env: { JAVA_HOME: '/jdks/good' }, run }), null);
});

test('names the version found and required for an unsupported JAVA_HOME', () => {
  const message = checkJdk({
    ...base,
    env: { JAVA_HOME: '/studio/jbr' },
    run: () => banner('25.0.2'),
  });
  assert.match(message, /JAVA_HOME \(\/studio\/jbr\) is Java 25/);
  assert.match(message, /Java 21 to 24/);
});

test('rejects Java 17, which cannot run the Robolectric tests', () => {
  const message = checkJdk({ ...base, env: { JAVA_HOME: '/j' }, run: () => banner('17.0.9') });
  assert.match(message, /is Java 17/);
});

test('falls back to java on PATH when JAVA_HOME is unset', () => {
  const seen = [];
  const run = (java) => (seen.push(java), banner('21.0.2'));
  assert.equal(checkJdk({ ...base, env: {}, run }), null);
  assert.deepEqual(seen, ['java']);
});

test('reports a JAVA_HOME that cannot be run', () => {
  const message = checkJdk({ ...base, env: { JAVA_HOME: '/missing' }, run: () => null });
  assert.match(message, /JAVA_HOME \(\/missing\) could not be run/);
});

test('uses java.exe on Windows and strips quotes from JAVA_HOME', () => {
  const seen = [];
  const run = (j) => (seen.push(j), banner('21'));
  checkJdk({ ...base, windows: true, env: { JAVA_HOME: '"C:\\jdk"' }, run });
  assert.equal(seen[0], path.join('C:\\jdk', 'bin', 'java.exe'));
});

test('org.gradle.java.home decides the daemon JDK even when JAVA_HOME is on 25', () => {
  const run = (java) => (java.includes('jdk21') ? banner('21.0.2') : banner('25.0.2'));
  const read = files({ '/repo/android-bridge/gradle.properties': 'org.gradle.java.home=/jdk21' });
  assert.equal(checkJdk({ ...base, env: { JAVA_HOME: '/jbr25' }, run, read }), null);
});

test('a bad org.gradle.java.home is reported by name', () => {
  const read = files({ '/repo/android-bridge/gradle.properties': 'org.gradle.java.home=/jdk25' });
  const message = checkJdk({ ...base, env: {}, run: () => banner('25.0.2'), read });
  assert.match(message, /org\.gradle\.java\.home \(\/jdk25\) is Java 25/);
});

test('the Gradle user home overrides the project, and honours GRADLE_USER_HOME', () => {
  const seen = [];
  const run = (j) => (seen.push(j), banner('21'));
  const read = files({
    '/custom/gradle.properties': 'org.gradle.java.home=/user-jdk',
    '/home/u/.gradle/gradle.properties': 'org.gradle.java.home=/default-jdk',
    '/repo/android-bridge/gradle.properties': 'org.gradle.java.home=/project-jdk',
  });
  checkJdk({ ...base, env: { GRADLE_USER_HOME: '/custom' }, run, read });
  checkJdk({ ...base, env: {}, run, read });
  assert.deepEqual(seen, [
    path.join('/user-jdk', 'bin', 'java'),
    path.join('/default-jdk', 'bin', 'java'),
  ]);
});
