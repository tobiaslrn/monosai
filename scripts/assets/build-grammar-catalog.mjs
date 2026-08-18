import { writeArtifact, readJson } from './lib/fs-json.mjs';
import {
  assert,
  assertOptionalPlainText,
  assertPlainText,
  assertUnique,
} from './lib/validate-source.mjs';

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
const ID_PATTERN = /^mn-(n5|n4|n3|n2|n1)-[a-z0-9-]+$/;
const MINIMUM_DESCRIPTION_LENGTH = 25;

/**
 * Validates and compacts the committed grammar catalog source.
 *
 * JLPT publishes no official exhaustive grammar list, so the catalog is
 * Monosai-authored and versioned here; the level column records the level at
 * which a pattern is conventionally taught.
 */
export async function buildGrammarCatalog({ sourcePath }) {
  const source = await readJson(sourcePath);
  assertPlainText(source.version, 'grammar catalog version');
  assert(Array.isArray(source.rules) && source.rules.length > 0, 'grammar catalog has no rules');

  const rules = source.rules.map((rule, index) => {
    const where = `grammar rule ${index} (${String(rule.id)})`;
    assert(ID_PATTERN.test(rule.id ?? ''), `${where} has an invalid stable id`);
    assert(LEVELS.includes(rule.level), `${where} has an invalid level`);
    assert(
      rule.id.startsWith(`mn-${rule.level.toLowerCase()}-`),
      `${where} id does not match its level`,
    );
    assertPlainText(rule.pattern, `${where} pattern`);
    assertPlainText(rule.nameEn, `${where} nameEn`);
    assertPlainText(rule.descriptionEn, `${where} descriptionEn`);
    assert(
      rule.descriptionEn.length >= MINIMUM_DESCRIPTION_LENGTH,
      `${where} descriptionEn is too short to be useful`,
    );
    assertOptionalPlainText(rule.formation, `${where} formation`);
    assertOptionalPlainText(rule.exampleJa, `${where} exampleJa`);
    assertOptionalPlainText(rule.exampleEn, `${where} exampleEn`);
    assert(
      (rule.exampleJa === undefined) === (rule.exampleEn === undefined),
      `${where} must provide both example languages or neither`,
    );
    for (const alias of rule.searchAliases ?? []) {
      assertPlainText(alias, `${where} search alias`);
    }
    return {
      id: rule.id,
      level: rule.level,
      pattern: rule.pattern,
      nameEn: rule.nameEn,
      descriptionEn: rule.descriptionEn,
      ...(rule.formation === undefined ? {} : { formation: rule.formation }),
      ...(rule.exampleJa === undefined ? {} : { exampleJa: rule.exampleJa }),
      ...(rule.exampleEn === undefined ? {} : { exampleEn: rule.exampleEn }),
      ...(rule.searchAliases === undefined ? {} : { searchAliases: rule.searchAliases }),
    };
  });

  assertUnique(
    rules.map((rule) => rule.id),
    'grammar catalog ids',
  );
  assertUnique(
    rules.map((rule) => `${rule.level}\u0000${rule.pattern}`),
    'grammar catalog level and pattern pairs',
  );
  for (const level of LEVELS) {
    assert(
      rules.some((rule) => rule.level === level),
      `grammar catalog has no ${level} rules`,
    );
  }

  const countsByLevel = Object.fromEntries(
    LEVELS.map((level) => [level, rules.filter((rule) => rule.level === level).length]),
  );
  return {
    artifact: {
      schemaVersion: 1,
      version: source.version,
      sourceId: source.sourceId,
      ruleCount: rules.length,
      countsByLevel,
      rules,
    },
  };
}

export async function writeGrammarCatalog(path, artifact) {
  const { rules, ...meta } = artifact;
  const metaText = Object.entries(meta)
    .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(',\n');
  const ruleText = rules.map((rule) => `    ${JSON.stringify(rule)}`).join(',\n');
  return writeArtifact(path, `{\n${metaText},\n  "rules": [\n${ruleText}\n  ]\n}`);
}
