import { join } from 'node:path';
import { downloadPinned } from './lib/download.mjs';
import { readGzippedTarEntries, singleEntry } from './lib/read-tgz.mjs';
import { mapJmdictPos, mapJmdictVerbConjugationFamily } from './lib/jmdict-pos.mjs';
import { writeArtifact } from './lib/fs-json.mjs';

/** Bounds keep the offline artifact small and lookups predictable. */
const LIMITS = {
  writtenForms: 6,
  readings: 6,
  senses: 4,
  glosses: 4,
  glossLength: 120,
};

/** Forms that exist only to help upstream search, never as real orthography. */
const SEARCH_ONLY_TAGS = new Set(['sK', 'sk']);
/** Outdated or irregular kana are not canonical variants for matching. */
const NON_CANONICAL_KANA_TAGS = new Set(['ok', 'ik']);

function pickForms(forms, limit, excludedTags) {
  const usable = forms.filter((form) => !form.tags.some((tag) => excludedTags.has(tag)));
  const ordered = [
    ...usable.filter((form) => form.common),
    ...usable.filter((form) => !form.common),
  ];
  const seen = new Set();
  const texts = [];
  for (const form of ordered) {
    if (!seen.has(form.text)) {
      seen.add(form.text);
      texts.push(form.text);
    }
    if (texts.length === limit) {
      break;
    }
  }
  return texts;
}

function compactSenses(senses, unmappedCodes) {
  const compacted = [];
  for (const sense of senses) {
    const glosses = sense.gloss
      .filter((gloss) => gloss.lang === 'eng')
      .map((gloss) => gloss.text.trim())
      .filter((text) => text.length > 0 && text.length <= LIMITS.glossLength)
      .slice(0, LIMITS.glosses);
    if (glosses.length === 0) {
      continue;
    }
    const partsOfSpeech = [];
    const conjugationFamilies = [];
    for (const code of sense.partOfSpeech) {
      const mapped = mapJmdictPos(code);
      if (!mapped.known) {
        unmappedCodes.add(code);
      }
      if (!partsOfSpeech.includes(mapped.partOfSpeech)) {
        partsOfSpeech.push(mapped.partOfSpeech);
      }
      const family = mapJmdictVerbConjugationFamily(code);
      if (family !== undefined && !conjugationFamilies.includes(family)) {
        conjugationFamilies.push(family);
      }
    }
    compacted.push({
      p: partsOfSpeech,
      g: glosses,
      ...(conjugationFamilies.length === 0 ? {} : { c: conjugationFamilies }),
      ...(sense.misc.includes('uk') ? { u: true } : {}),
    });
    if (compacted.length === LIMITS.senses) {
      break;
    }
  }
  return compacted;
}

/**
 * Builds the compact offline dictionary artifact from the pinned JMdict
 * common-only export. Only written forms, readings, mapped parts of speech, and
 * a bounded number of prioritized English senses survive; JMdict codes, cross
 * references, and dialect metadata are dropped at build time.
 */
export async function buildDictionary({ sources, cacheDir, version }) {
  const source = sources.jmdict;
  const download = await downloadPinned({
    url: source.url,
    path: join(cacheDir, source.archive),
    sha256: source.sha256,
  });
  const entriesInArchive = await readGzippedTarEntries(download.path);
  const raw = JSON.parse(singleEntry(entriesInArchive, new RegExp(source.member)).toString('utf8'));
  if (raw.commonOnly !== true || !raw.languages.includes('eng')) {
    throw new Error('Pinned JMdict export is not the English common-only variant');
  }

  const unmappedCodes = new Set();
  const entries = [];
  for (const word of raw.words) {
    const written = pickForms(word.kanji, LIMITS.writtenForms, SEARCH_ONLY_TAGS);
    const readings = pickForms(word.kana, LIMITS.readings, NON_CANONICAL_KANA_TAGS);
    const senses = compactSenses(word.sense, unmappedCodes);
    if (readings.length === 0 || senses.length === 0) {
      continue;
    }
    entries.push({ i: word.id, w: written, k: readings, s: senses });
  }
  entries.sort((left, right) => (left.i < right.i ? -1 : 1));

  const artifact = {
    schemaVersion: 1,
    version,
    source: {
      name: source.name,
      revision: raw.version,
      releasedOn: raw.dictDate,
      release: source.release,
      sha256: download.sha256,
    },
    limits: LIMITS,
    entryCount: entries.length,
    entries,
  };
  return { artifact, unmappedCodes: [...unmappedCodes].sort() };
}

/**
 * Writes the artifact with one entry per line so that diffs stay reviewable and
 * rebuilding an unchanged dataset reproduces the file byte for byte.
 */
export async function writeDictionary(path, artifact) {
  const { entries, ...meta } = artifact;
  const metaText = Object.entries(meta)
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(',\n');
  const entryText = entries.map((entry) => `    ${JSON.stringify(entry)}`).join(',\n');
  return writeArtifact(path, `{\n${metaText},\n  "entries": [\n${entryText}\n  ]\n}`);
}
