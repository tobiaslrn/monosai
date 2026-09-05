import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';

const NAMES = new Map([
  ['Apache-2.0', 'Apache-2.0'],
  ['The Apache Software License, Version 2.0', 'Apache-2.0'],
  ['The Apache License, Version 2.0', 'Apache-2.0'],
  ['Apache License, Version 2.0', 'Apache-2.0'],
  ['MIT License', 'MIT'],
  ['MIT', 'MIT'],
]);

export async function gradlePackages(reportPath) {
  const path = 'android-bridge/runtime-dependencies.json';
  const records = JSON.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(records) || records.length === 0)
    throw new Error('Empty Gradle licence report');
  if (reportPath !== undefined) {
    const resolved = JSON.parse(await readFile(reportPath, 'utf8'));
    if (!isDeepStrictEqual(records, resolved)) {
      throw new Error(
        'Gradle runtime graph or licences changed; regenerate android-bridge/runtime-dependencies.json and licences',
      );
    }
  }
  const names = new Set();
  return records.map((record) => {
    if (
      typeof record.name !== 'string' ||
      typeof record.version !== 'string' ||
      !Array.isArray(record.licenses) ||
      record.licenses.length !== 1 ||
      typeof record.licenses[0] !== 'string' ||
      names.has(record.name)
    ) {
      throw new Error('Invalid or unreviewed Gradle licence metadata');
    }
    names.add(record.name);
    return {
      name: record.name,
      version: record.version,
      license: NAMES.get(record.licenses[0]) ?? record.licenses[0],
    };
  });
}
