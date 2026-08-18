import { readJson, writeArtifact } from './lib/fs-json.mjs';
import {
  assert,
  assertOptionalPlainText,
  assertPlainText,
  assertUnique,
} from './lib/validate-source.mjs';

const CATEGORIES = [
  'particle',
  'copula',
  'auxiliary',
  'inflection',
  'conjunction',
  'formal-noun',
  'affix',
  'counter',
  'punctuation',
];

const PARTS_OF_SPEECH = [
  'noun',
  'proper-noun',
  'pronoun',
  'verb',
  'adjective-i',
  'adjective-na',
  'adverb',
  'determiner',
  'conjunction',
  'particle',
  'auxiliary',
  'prefix',
  'suffix',
  'counter',
  'number',
  'interjection',
  'symbol',
  'other',
];

const ID_PATTERN = /^sb-[a-z0-9-]+$/;

/**
 * Validates the Monosai-versioned structural baseline source.
 *
 * The baseline holds sentence-building forms only. Content words are rejected by
 * construction: every entry must declare a structural category and a bounded
 * part-of-speech set, and independent nouns, verbs, and adjectives are only
 * allowed for the explicitly enumerated formal-noun category.
 */
export async function buildStructuralBaseline({ sourcePath }) {
  const source = await readJson(sourcePath);
  assertPlainText(source.version, 'structural baseline version');
  assert(Array.isArray(source.entries) && source.entries.length > 0, 'baseline has no entries');

  const entries = source.entries.map((entry, index) => {
    const where = `baseline entry ${index} (${String(entry.id)})`;
    assert(ID_PATTERN.test(entry.id ?? ''), `${where} has an invalid stable id`);
    assert(CATEGORIES.includes(entry.category), `${where} has an unknown category`);
    assertPlainText(entry.nameEn, `${where} nameEn`);
    assertPlainText(entry.descriptionEn, `${where} descriptionEn`);
    assertOptionalPlainText(entry.exampleJa, `${where} exampleJa`);
    assert(
      Array.isArray(entry.forms) && entry.forms.length > 0,
      `${where} needs at least one form`,
    );
    for (const form of entry.forms) {
      assertPlainText(form, `${where} form`);
    }
    for (const reading of entry.readings ?? []) {
      assertPlainText(reading, `${where} reading`);
    }
    assert(
      Array.isArray(entry.partsOfSpeech) && entry.partsOfSpeech.length > 0,
      `${where} needs at least one part of speech`,
    );
    for (const partOfSpeech of entry.partsOfSpeech) {
      assert(PARTS_OF_SPEECH.includes(partOfSpeech), `${where} has an unknown part of speech`);
    }
    const contentPos = ['verb', 'adjective-i', 'adjective-na', 'proper-noun'];
    assert(
      !entry.partsOfSpeech.some((pos) => contentPos.includes(pos)),
      `${where} uses a content-word part of speech, which the baseline must not contain`,
    );
    assert(
      !entry.partsOfSpeech.includes('noun') || entry.category === 'formal-noun',
      `${where} may only use the noun part of speech in the formal-noun category`,
    );
    return {
      id: entry.id,
      category: entry.category,
      forms: entry.forms,
      ...(entry.readings === undefined ? {} : { readings: entry.readings }),
      partsOfSpeech: entry.partsOfSpeech,
      nameEn: entry.nameEn,
      descriptionEn: entry.descriptionEn,
      ...(entry.exampleJa === undefined ? {} : { exampleJa: entry.exampleJa }),
    };
  });

  assertUnique(
    entries.map((entry) => entry.id),
    'baseline ids',
  );
  assertUnique(
    entries.map((entry) => `${entry.forms.join('/')}|${entry.partsOfSpeech.join(',')}`),
    'baseline form sets',
  );

  // A surface can belong to more than one structural entry: で is both a case
  // particle and the connective form of て. Such overlaps are legitimate, so they
  // are recorded rather than rejected. The matcher resolves them by declaration
  // order, and this list keeps that resolution reviewable.
  const byLookupKey = new Map();
  for (const entry of entries) {
    const lookupForms = new Set([...entry.forms, ...(entry.readings ?? [])]);
    for (const form of lookupForms) {
      for (const partOfSpeech of entry.partsOfSpeech) {
        const key = `${form}|${partOfSpeech}`;
        byLookupKey.set(key, [...(byLookupKey.get(key) ?? []), entry.id]);
      }
    }
  }
  const overlappingForms = [...byLookupKey.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => {
      const [form, partOfSpeech] = key.split('|');
      return { form, partOfSpeech, resolvesTo: ids[0], alsoDeclaredBy: ids.slice(1) };
    })
    .sort((left, right) => (left.form < right.form ? -1 : 1));

  const countsByCategory = Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      entries.filter((entry) => entry.category === category).length,
    ]),
  );
  return {
    artifact: {
      schemaVersion: 1,
      version: source.version,
      entryCount: entries.length,
      countsByCategory,
      overlappingForms,
      entries,
    },
  };
}

export async function writeStructuralBaseline(path, artifact) {
  const { entries, ...meta } = artifact;
  const metaText = Object.entries(meta)
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(',\n');
  const entryText = entries.map((entry) => `    ${JSON.stringify(entry)}`).join(',\n');
  return writeArtifact(path, `{\n${metaText},\n  "entries": [\n${entryText}\n  ]\n}`);
}
