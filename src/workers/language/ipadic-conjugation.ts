import type { VerbConjugationFamily } from '../../app/domain/reading/token';
import type { RawToken } from './tokenizer-runtime';

/** Maps IPADIC 活用型 onto the family shared with the compact JMdict asset. */
export function mapVerbConjugationFamily(token: RawToken): VerbConjugationFamily | undefined {
  if (token.partOfSpeech !== '動詞') {
    return undefined;
  }
  if (token.conjugationClass.startsWith('一段')) {
    return 'ichidan';
  }
  if (token.conjugationClass.startsWith('五段')) {
    return 'godan';
  }
  if (
    token.conjugationClass.startsWith('サ変') ||
    token.conjugationClass.startsWith('カ変') ||
    token.conjugationClass.startsWith('ザ変')
  ) {
    return 'irregular';
  }
  return undefined;
}
