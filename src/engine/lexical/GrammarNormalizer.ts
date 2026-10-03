import type { RawToken } from './RawLexer';

/**
 * Contrações portuguesas são uma característica gramatical, não conceitos da
 * ontologia. Elas são expandidas em palavras simples sem poluir a ontologia.
 */
export const CONTRACTIONS: Record<string, string[]> = {
  do: ['de', 'o'],
  da: ['de', 'a'],
  dos: ['de', 'os'],
  das: ['de', 'as'],
  dum: ['de', 'um'],
  duma: ['de', 'uma'],
  duns: ['de', 'uns'],
  dumas: ['de', 'umas'],

  no: ['em', 'o'],
  na: ['em', 'a'],
  nos: ['em', 'os'],
  nas: ['em', 'as'],
  num: ['em', 'um'],
  numa: ['em', 'uma'],
  nuns: ['em', 'uns'],
  numas: ['em', 'umas'],

  pelo: ['por', 'o'],
  pela: ['por', 'a'],
  pelos: ['por', 'os'],
  pelas: ['por', 'as'],

  dele: ['de', 'ele'],
  dela: ['de', 'ela'],
  deles: ['de', 'eles'],
  delas: ['de', 'elas'],

  à: ['a', 'a'],
  ao: ['a', 'o'],
  àquele: ['a', 'aquele'],
  àquela: ['a', 'aquela']
};

export function expandContractions(tokens: RawToken[]): RawToken[] {
  const result: RawToken[] = [];

  for (const token of tokens) {
    if (token.type !== 'WORD' || !token.normalized) {
      result.push(token);
      continue;
    }

    const expansion = CONTRACTIONS[token.normalized];
    if (!expansion) {
      result.push(token);
      continue;
    }

    for (const word of expansion) {
      result.push({
        type: 'WORD',
        raw: word,
        normalized: word,
        start: token.start,
        end: token.end
      });
    }
  }

  return result;
}
