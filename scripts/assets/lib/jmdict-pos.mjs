/**
 * Maps JMdict part-of-speech codes onto Monosai's bounded `PartOfSpeech` enum.
 *
 * The mapping runs at build time so no JMdict-specific code reaches the
 * application. Codes that only qualify a word (transitivity, conjugation class)
 * resolve to their base category; anything unmapped becomes `other` and is
 * reported by the build so new upstream codes are reviewed rather than silently
 * flattened.
 */
const EXACT = new Map(
  Object.entries({
    n: 'noun',
    'n-adv': 'noun',
    'n-t': 'noun',
    'n-pr': 'proper-noun',
    'n-pref': 'prefix',
    'n-suf': 'suffix',
    pn: 'pronoun',
    vk: 'verb',
    vs: 'verb',
    'vs-c': 'verb',
    'vs-i': 'verb',
    'vs-s': 'verb',
    vz: 'verb',
    vi: 'verb',
    vt: 'verb',
    vn: 'verb',
    vr: 'verb',
    iv: 'verb',
    'adj-i': 'adjective-i',
    'adj-ix': 'adjective-i',
    'adj-na': 'adjective-na',
    'adj-no': 'noun',
    'adj-pn': 'determiner',
    'adj-t': 'other',
    'adj-f': 'other',
    'adj-nari': 'other',
    'adj-kari': 'other',
    'adj-ku': 'other',
    'adj-shiku': 'other',
    adv: 'adverb',
    'adv-to': 'adverb',
    aux: 'auxiliary',
    'aux-v': 'auxiliary',
    'aux-adj': 'auxiliary',
    cop: 'auxiliary',
    'cop-da': 'auxiliary',
    conj: 'conjunction',
    ctr: 'counter',
    num: 'number',
    prt: 'particle',
    pref: 'prefix',
    suf: 'suffix',
    int: 'interjection',
    exp: 'other',
    unc: 'other',
  }),
);

/** Godan/nidan/yodan verb classes all start with a conjugation-class prefix. */
const VERB_CLASS_PATTERN = /^v[1245]/;

export function mapJmdictPos(code) {
  const exact = EXACT.get(code);
  if (exact !== undefined) {
    return { partOfSpeech: exact, known: true };
  }
  if (VERB_CLASS_PATTERN.test(code)) {
    return { partOfSpeech: 'verb', known: true };
  }
  return { partOfSpeech: 'other', known: false };
}
