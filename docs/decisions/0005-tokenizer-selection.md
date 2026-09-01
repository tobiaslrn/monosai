# 0005 — Japanese tokenizer selection

Date: 2026-08-18
Status: Accepted

## Context

The language specification lets the implementation agent choose the tokenizer and
fixes the gates it must pass: fully offline in current Chrome and Android Chrome,
runnable inside a Web Worker, surface plus lemma, reading and part of speech,
offsets against the original text, inflection support good enough for known-form
matching, initialization within a mobile budget, redistribution permitted with
attribution, and a pass on the golden corpus. The default selection rule is the
smallest maintained browser-compatible tokenizer that passes every gate, with
Kuromoji.js as the fallback candidate.

## Decision

Use **`lindera-wasm-web-ipadic` 2.0.0** (Lindera compiled to WebAssembly with
IPADIC embedded), wrapped behind the domain `Tokenizer` port.

The library is imported by exactly one file,
`src/workers/language/lindera-tokenizer.ts`, which converts its output into the
library-neutral `RawToken`. No domain or feature file can see its types, and the
ESLint zone rules keep it that way.

### Gates

| Gate                                   | Evidence                                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Offline in current Chrome              | One `.wasm` file with the dictionary embedded; no network access at runtime, no CDN, no `eval`               |
| Runs in a Web Worker                   | Instantiated with `initSync` from verified bytes inside the language worker                                  |
| Surface, lemma, reading, part of speech | IPADIC features: surface, base form, katakana reading, and four part-of-speech columns                       |
| Offsets against the original text      | UTF-8 byte offsets converted to UTF-16 in `token-mapping.ts`, verified against the source slice per token    |
| Inflection support                     | Base forms and conjugation classes let `食べました` resolve to `食べる`; covered by the golden corpus         |
| Initialization budget                  | 6.5 ms to instantiate the module, 136 ms to build the tokenizer, measured locally when this decision was taken |
| Redistribution with attribution        | Lindera is MIT; IPADIC is BSD 3-clause. Both notices ship in the asset manifest                              |
| Golden corpus                          | `golden-corpus.spec.ts` passes against the shipped artifact                                                  |

### Rejected alternatives

- **Kuromoji.js 0.1.2** (the specification's fallback). Last published in 2018,
  41 MB unpacked, and it loads a dozen gzipped dictionary files through
  XMLHttpRequest, which means a browser-specific loading path and a slower,
  JavaScript-side dictionary build at startup. Maintained forks
  (`@sglkc/kuromoji`, `@patdx/kuromoji`) fix packaging but not the unmaintained
  upstream analyzer. Rejected because a maintained option passes every gate.
- **`lindera-wasm` 2.1.0 without an embedded dictionary.** Smaller (1.8 MB), but
  it needs a dictionary supplied at runtime, which would mean building and
  shipping an IPADIC artifact ourselves for no benefit over the embedded build.
- **`lindera-wasm-web-unidic`.** Better morphology, but 46 MB unpacked, which
  fails the mobile budget for a beginner reading application.
- **`mecab-wasm`.** 56 MB unpacked and last published in 2022.
- **BudouX and TinySegmenter.** Both segment only: no lemma, reading, or part of
  speech, so known-form matching would be impossible. They fail the gates
  outright.

## Consequences

- The tokenizer runtime is a 13.07 MB WebAssembly file. It is the single largest
  asset and is fetched lazily, verified against its digest, and cached under an
  immutable versioned URL. Basic navigation never waits for it.
- The runtime is not committed to the repository: it ships from the locked npm
  package and the Angular builder copies it into
  `assets/language/1/tokenizer/`. `npm run assets:verify` proves that the file in
  `node_modules` still matches the digest recorded in the manifest.
- IPADIC tags are mapped to Monosai's bounded `PartOfSpeech` enum in
  `ipadic-mapping.ts`. Two mappings are deliberate rather than literal: a
  non-independent verb becomes `auxiliary`, and a numeric counter suffix becomes
  `counter`, because those are the distinctions the structural baseline matches
  on.
- Replacing the tokenizer later means rewriting one wrapper file, one mapping
  file, bumping `ANALYZER_VERSION`, and reviewing the golden corpus by hand.
