# 0015 — The structural baseline stays curated, not derived from part-of-speech tags

Date: 2026-08-18
Status: Accepted
Supplements: [0007](0007-grammar-catalog-and-structural-baseline.md), which
created the structural baseline but recorded no evidence for curating it rather
than deriving it. This decision supplies that evidence and records the reader
change it justifies.

## Context

The structural baseline is 177 hand-authored entries that stop grammar from
being counted as missing vocabulary. Every entry needs review before release, so
it is fair to ask whether the tokenizer's own part-of-speech tags could replace
it: 161 of the 177 declare only tags that are never ordinary vocabulary
(`particle`, `auxiliary`, `suffix`, `prefix`, `conjunction`, `counter`,
`symbol`). On that reading, 91% of the dataset looks redundant with a tag the
tokenizer already produces, and only the 16 formal nouns — こと, もの, とき,
ところ, はず, わけ, よう, ほう, うち, まま, ため, つもり, とおり, かぎり, 一方,
の, all tagged `noun` — would need to survive as data.

**That reading is wrong, and the 91% figure is what makes it look right.** It
counts entries whose tag is reproducible. It does not count what the list
*excludes*. The measurements below were run to settle it before acting.

## Measurement

Reproduce from the repository root with the committed bundle in place.

### A and B — the dataset and the whole dictionary

Exhaustive, not sampled. **A** asks how many baseline entries declare only
free-pass tags. **B** asks how many entries in the shipped dictionary — the
learner's entire vocabulary universe — carry only those tags and are *not*
baseline forms. Each one of those is a real word a tag rule would wave through
with no marker.

```js
import { readFileSync } from 'node:fs';

const BUNDLE = 'public/assets/language/1';
const FREE_PASS = new Set([
  'particle', 'auxiliary', 'suffix', 'prefix', 'conjunction', 'counter', 'symbol',
]);
const readJson = (name) => JSON.parse(readFileSync(`${BUNDLE}/${name}`, 'utf8'));

const baseline = readJson('structural-baseline.json');
const dictionary = readJson('dictionary.json');

// A. How much of the dataset is reproducible from a tag alone?
const covered = baseline.entries.filter((e) => e.partsOfSpeech.every((p) => FREE_PASS.has(p)));
console.log(`A: ${covered.length} of ${baseline.entries.length} entries use only free-pass tags`);
for (const entry of baseline.entries.filter((e) => !covered.includes(e))) {
  console.log(`   not reproducible: ${entry.forms.join('/')}  ${entry.nameEn}`);
}

// B. What real vocabulary would a tag rule swallow?
const baselineForms = new Set(
  baseline.entries.flatMap((e) => [...e.forms, ...(e.readings ?? [])]),
);
const swallowed = dictionary.entries.filter((entry) => {
  const tags = new Set(entry.s.flatMap((sense) => sense.p));
  // Only entries whose every sense is a free-pass tag; a word with one noun
  // sense still reaches the vocabulary matcher as a noun.
  return tags.size > 0 && [...tags].every((tag) => FREE_PASS.has(tag));
});
// Kana-only entries carry no `w`, so both lists feed the surface check.
const newLoss = swallowed.filter(
  (entry) => ![...(entry.w ?? []), ...(entry.k ?? [])].some((form) => baselineForms.has(form)),
);
console.log(`B: ${swallowed.length} of ${dictionary.entryCount} dictionary entries are free-pass`);
console.log(`   ${newLoss.length} of those are not baseline forms`);
```

```
A: 161 of 177 entries use only free-pass tags
B: 201 of 22629 dictionary entries are free-pass
   122 of those are not baseline forms
```

### C — the tokenizer that actually decides

A and B read part-of-speech from JMdict. Classification at runtime reads it from
Lindera/IPADIC through `src/workers/language/ipadic-mapping.ts`, and **the two
taggers disagree**, so A and B cannot settle the question on their own. C runs
the shipped Lindera build with the app's builder settings and mapping, over
candidate words embedded in ordinary sentences.

```js
import { readFileSync } from 'node:fs';
import init, { TokenizerBuilder } from 'lindera-wasm-web-ipadic/lindera_wasm.js';

await init({
  module_or_path: readFileSync('node_modules/lindera-wasm-web-ipadic/lindera_wasm_bg.wasm'),
});

// Same three settings as `src/workers/language/lindera-tokenizer.ts`.
const builder = new TokenizerBuilder();
builder.setDictionary('embedded://ipadic');
builder.setMode('normal');
builder.setKeepWhitespace(true);
const tokenizer = builder.build();

/** `ipadic-mapping.ts` reproduced, including 動詞,非自立 -> auxiliary. */
function mapPos(token) {
  const read = (raw) => (typeof raw === 'string' && raw !== '*' ? raw : '');
  const top = read(token.partOfSpeech);
  const sub1 = read(token.partOfSpeechSubcategory1);
  const sub2 = read(token.partOfSpeechSubcategory2);
  const SIMPLE = {
    助詞: 'particle', 助動詞: 'auxiliary', 副詞: 'adverb', 連体詞: 'determiner',
    接続詞: 'conjunction', 接頭詞: 'prefix', 感動詞: 'interjection',
    フィラー: 'interjection', 記号: 'symbol', その他: 'other',
  };
  if (top === '名詞') {
    if (sub1 === '固有名詞') return 'proper-noun';
    if (sub1 === '代名詞') return 'pronoun';
    if (sub1 === '数') return 'number';
    if (sub1 === '形容動詞語幹') return 'adjective-na';
    if (sub1 === '接尾') return sub2 === '助数詞' ? 'counter' : 'suffix';
    return 'noun';
  }
  if (top === '動詞') {
    if (sub1 === '非自立') return 'auxiliary';
    return sub1 === '接尾' ? 'suffix' : 'verb';
  }
  if (top === '形容詞') return sub1 === '接尾' ? 'suffix' : 'adjective-i';
  return SIMPLE[top] ?? 'other';
}

const PROBES = [
  ['従って', '結果が出た。従って計画を見直す。'],
  ['及び', '田中及び佐藤が出席した。'],
  ['故に', '彼は正直だ。故に信頼できる。'],
  ['以外', '私以外は全員来ました。'],
  ['向け', 'これは子供向けの本です。'],
  ['だらけ', '部屋は埃だらけだった。'],
  ['つつ', '音楽を聴きつつ勉強した。'],
  ['かしら', '明日は晴れるかしら。'],
  ['だけど', '行きたい。だけど時間がない。'],
  ['因みに', '因みに明日は休みです。'],
  ['街', '商店街を歩いた。'],
  ['各', '各学校に配布した。'],
  ['みる', '一度食べてみる。'],
  ['おく', '準備しておく。'],
  ['猫', '猫が窓辺で寝ている。'],
  ['勉強', '毎日日本語を勉強します。'],
  ['美しい', 'とても美しい景色でした。'],
];

const FREE_PASS = new Set([
  'particle', 'auxiliary', 'suffix', 'prefix', 'conjunction', 'counter', 'symbol',
]);
for (const [word, sentence] of PROBES) {
  const hits = [...tokenizer.tokenize(sentence)]
    .map((token) => ({ surface: String(token.surface ?? ''), pos: mapPos(token) }))
    .filter((token) => token.surface === word);
  const swallowed = hits.some((token) => FREE_PASS.has(token.pos));
  console.log(`  ${word}\t${hits.map((t) => t.pos).join(',') || '(not a token)'}\t${swallowed ? 'SWALLOWED' : 'ok'}`);
}
```

| Word | Gloss | Tokenizer tag | Swallowed? |
| --- | --- | --- | --- |
| 従って | therefore | conjunction | **yes** |
| 及び | and | conjunction | **yes** |
| 故に | therefore | conjunction | **yes** |
| だけど | but | conjunction | **yes** |
| 因みに | by the way | conjunction | **yes** |
| 向け | intended for | suffix | **yes** |
| だらけ | full of | suffix | **yes** |
| 街 | street (suffix) | suffix | **yes** |
| つつ | while | particle | **yes** |
| かしら | I wonder | particle | **yes** |
| 各 | each | prefix | **yes** |
| みる | try (て-form) | auxiliary | yes, and correct — already a baseline entry |
| おく | in advance (て-form) | auxiliary | yes, and correct — already a baseline entry |
| 以外 | excluding | **noun** | no — JMdict says suffix, IPADIC says noun |
| 猫 / 勉強 / 美しい | controls | noun / noun / adjective-i | no |

## The finding

The baseline is deliberately **narrower** than the tag class it sits inside.

- **Baseline conjunctions (14):** そして　しかし　でも　だから　また　または
  それで　それから　つまり　ところが　なぜなら　が　それに　すると
- **Also `接続詞` to IPADIC, deliberately absent:** 従って　及び　故に　因みに
  だけど　其れとも

The first group is what a learner meets in the first weeks and would never hold
as an Anki card. The second is ordinary vocabulary they are expected to learn.
IPADIC gives both the identical tag, so no rule over tags can separate them. The
separation exists only because fourteen editorial judgements were made.

`以外` also shows why C was necessary: JMdict tags it `suffix`, so B counted it
as at risk, but IPADIC tags it `noun` and it was never in danger. B's 122 is an
upper bound, not a count.

## Decision

**Keep the structural baseline curated.** It is not redundant with
part-of-speech tagging, and the 91% coverage figure must not be used to argue
that it is. What the list leaves out is doing as much work as what it contains.

**Do not trim the 38 counters and 23 punctuation entries either.** `助数詞` and
`記号` are far narrower subcategories than `接続詞`, so the argument above
probably does not apply to them — but "probably" is the wrong standard for a
check that also gates story acceptance, and the review those 61 rows cost is
already committed.

**Wire the matched entry through to the reader.** `TokenValidation` has always
carried `ruleId` on a `structural-baseline` match and the reader always discarded
it, showing one generic sentence for all 177 forms. `presentStatus` now takes an
optional resolved entry and attaches a `structuralForm` detail, which the word
inspector renders as the form's name, description, and Japanese example. This
adds no data: the entries are already in memory via
`LanguageStore.structuralBaseline`.

## Consequences

- The failure mode this avoids is the dangerous one. An unreviewed 従って under a
  tag rule renders with **no marker**, telling the learner they can read a word
  they cannot; and because the same classification gates generated stories
  (`isAcceptedCategory` passes everything except `unknown`), a generated story
  containing 従って would be **accepted**. Both failures are silent.
- The editorial content of the baseline now reaches the learner. Before this,
  every `nameEn`, `descriptionEn`, and `exampleJa` was validated, digested,
  shipped, and never displayed outside the read-only list on the Grammar screen.
- **The reader change is not yet observable in the running app.** Token statuses
  exist only when classification succeeds, which needs an active Anki vocabulary
  snapshot; until Milestone 5 supplies one the inspector shows its
  "Connect Anki" hint and no status section at all. The wiring is therefore
  proven by `token-presentation.spec.ts` and `word-inspector.store.spec.ts`
  rather than by inspection in the browser, and it should be looked at in the
  rendered app as part of Milestone 5's first real snapshot.
- That list gains a purpose beyond disclosure: it is the index of forms the
  reader now names.
- A `ruleId` the current bundle no longer defines falls back to the generic
  explanation rather than erroring, so an analysis stored under an older bundle
  still reads correctly.
- Adding a genuinely-vocabulary word to the baseline remains an easy mistake with
  silent consequences. The release-gate language review of the 177 entries, which
  ADR 0007 already requires, is what catches it; this decision does not add an
  automated guard, because the property is editorial rather than structural.
