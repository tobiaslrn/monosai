import { writeArtifact, readJson } from './lib/fs-json.mjs';
import {
  assert,
  assertOptionalPlainText,
  assertPlainText,
  assertUnique,
} from './lib/validate-source.mjs';

const PRESET_ID_PATTERN = /^mn-preset-[a-z0-9-]+$/;
const PRESET_LEVEL_IN_NAME = /\bN[1-5]\b/;
const MAXIMUM_GUIDANCE_LENGTH = 1000;
const REGISTER_KEYS = ['spoken', 'written', 'either'];
/**
 * Matches the Japanese pattern strings quoted in preset guidance. Stops at any
 * separator or sentence punctuation so `〜ました／〜ませんでした,` yields two
 * patterns and no trailing marks.
 */
const QUOTED_PATTERN = /〜[^\s,、。；;.·／/（）()]+/g;
/** Marks a quoted pattern must never end on; the prose carries the punctuation. */
const TRAILING_PUNCTUATION = /[!?！？:：「」『』…ー–—]$/;

/**
 * Validates and compacts the committed grammar difficulty presets.
 *
 * Presets reference no rule ids: guidance quotes Japanese patterns literally as
 * prose sent to the model, so there is nothing for a preset to dangle against.
 * See `docs/decisions/0014-remove-grammar-rule-catalog.md`.
 */
export async function buildGrammarPresets({ sourcePath }) {
  const source = await readJson(sourcePath);
  assertPlainText(source.version, 'grammar presets version');
  assertPlainText(source.sourceId, 'grammar presets sourceId');
  assert(
    Array.isArray(source.presets) && source.presets.length > 0,
    'grammar presets source has no presets',
  );

  const presets = source.presets.map((preset, index) => {
    const where = `grammar preset ${index} (${String(preset.id)})`;
    assert(PRESET_ID_PATTERN.test(preset.id ?? ''), `${where} has an invalid stable id`);
    assert(preset.order === index, `${where} order must match its position, easiest first`);
    assertPlainText(preset.nameEn, `${where} nameEn`);
    assert(
      !PRESET_LEVEL_IN_NAME.test(preset.nameEn),
      `${where} name must not contain a JLPT level; the caption carries the level`,
    );
    assertPlainText(preset.captionEn, `${where} captionEn`);
    assertPlainText(preset.descriptionEn, `${where} descriptionEn`);
    assertPlainText(preset.exampleJa, `${where} exampleJa`);
    assertPlainText(preset.exampleEn, `${where} exampleEn`);
    assertPlainText(preset.promptGuidance, `${where} promptGuidance`);
    assert(
      preset.promptGuidance.length <= MAXIMUM_GUIDANCE_LENGTH,
      `${where} promptGuidance exceeds ${MAXIMUM_GUIDANCE_LENGTH} characters`,
    );
    assertQuotedPatterns(preset.promptGuidance, where);

    return {
      id: preset.id,
      order: preset.order,
      nameEn: preset.nameEn,
      captionEn: preset.captionEn,
      descriptionEn: preset.descriptionEn,
      exampleJa: preset.exampleJa,
      exampleEn: preset.exampleEn,
      promptGuidance: preset.promptGuidance,
    };
  });

  assertUnique(
    presets.map((preset) => preset.id),
    'grammar preset ids',
  );

  const registerGuidance = source.registerGuidance ?? {};
  for (const key of REGISTER_KEYS) {
    assert(
      typeof registerGuidance[key] === 'string',
      `grammar presets register guidance is missing ${key}`,
    );
    assertOptionalPlainText(registerGuidance[key] || undefined, `register guidance ${key}`);
  }
  assert(registerGuidance.either === '', 'register guidance for either must be empty');

  return {
    artifact: {
      schemaVersion: 1,
      version: source.version,
      sourceId: source.sourceId,
      presetCount: presets.length,
      // Key order must match `writeGrammarPresets`, which emits the scalar
      // metadata, then presets; verification compares serialized text.
      registerGuidance: {
        spoken: registerGuidance.spoken,
        written: registerGuidance.written,
        either: registerGuidance.either,
      },
      presets,
    },
  };
}

/**
 * Structural lint on the Japanese patterns a guidance string quotes.
 *
 * There is no rule corpus to check them against, so this catches the mistakes
 * that are visible without one: a bare tilde, a mark that belongs to the
 * surrounding prose, and the same pattern named twice in one string.
 */
function assertQuotedPatterns(guidance, where) {
  const seen = new Set();
  for (const quoted of guidance.match(QUOTED_PATTERN) ?? []) {
    const form = quoted.replace(/^[〜～]/, '');
    assert(form.length > 0, `${where} quotes an empty pattern`);
    assert(
      !TRAILING_PUNCTUATION.test(form),
      `${where} quotes pattern ${quoted} with trailing punctuation`,
    );
    assert(!seen.has(form), `${where} quotes pattern ${quoted} more than once`);
    seen.add(form);
  }
}

export async function writeGrammarPresets(path, artifact) {
  const { presets, ...meta } = artifact;
  const metaText = Object.entries(meta)
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(',\n');
  const presetText = presets.map((preset) => `    ${JSON.stringify(preset)}`).join(',\n');
  return writeArtifact(path, `{\n${metaText},\n  "presets": [\n${presetText}\n  ]\n}`);
}
