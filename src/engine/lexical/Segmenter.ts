import type { RawToken } from './RawLexer';
import type { Diagnostic } from '../diagnostics';
import { diagnostic } from '../diagnostics';

/**
 * 3.B — Segmentação de contrações e clíticos.
 *
 * Nenhuma dessas formas vira conceito da ontologia: o segmentador as
 * decompõe em unidades que o resto do pipeline já entende. Cada subtoken
 * guarda o span do ORIGINAL (start/end do token de origem) e a posição
 * relativa, para que diagnósticos apontem o trecho certo.
 */

/** Contrações (dados): forma → partes. */
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
  nele: ['em', 'ele'],
  nela: ['em', 'ela'],
  neles: ['em', 'eles'],
  nelas: ['em', 'elas'],

  deste: ['de', 'este'],
  desta: ['de', 'esta'],
  destes: ['de', 'estes'],
  destas: ['de', 'estas'],
  desse: ['de', 'esse'],
  dessa: ['de', 'essa'],
  desses: ['de', 'esses'],
  dessas: ['de', 'essas'],
  daquele: ['de', 'aquele'],
  daquela: ['de', 'aquela'],
  daqueles: ['de', 'aqueles'],
  daquelas: ['de', 'aquelas'],

  neste: ['em', 'este'],
  nesta: ['em', 'esta'],
  nestes: ['em', 'estes'],
  nestas: ['em', 'estas'],
  nesse: ['em', 'esse'],
  nessa: ['em', 'essa'],
  nesses: ['em', 'esses'],
  nessas: ['em', 'essas'],
  naquele: ['em', 'aquele'],
  naquela: ['em', 'aquela'],
  naqueles: ['em', 'aqueles'],
  naquelas: ['em', 'aquelas'],

  ao: ['a', 'o'],
  aos: ['a', 'os'],
  à: ['a', 'a'],
  às: ['a', 'as']
};

/** Clíticos de ênclise (dados): forma pronominal → traços. */
export interface CliticInfo {
  /** Pronome acusativo/dativo restaurado ("-o", "-a", "-lhe"…). */
  pronoun: string;
  gender?: 'Masc' | 'Fem';
  number?: 'Sing' | 'Plur';
  /** Exige restaurar o -r do infinitivo ("deixá-la" → deixar + a). */
  restoreInfinitiveR?: boolean;
}

export const ENCLITICS: Record<string, CliticInfo> = {
  o: { pronoun: 'o', gender: 'Masc', number: 'Sing' },
  a: { pronoun: 'a', gender: 'Fem', number: 'Sing' },
  os: { pronoun: 'os', gender: 'Masc', number: 'Plur' },
  as: { pronoun: 'as', gender: 'Fem', number: 'Plur' },
  lo: { pronoun: 'o', gender: 'Masc', number: 'Sing', restoreInfinitiveR: true },
  la: { pronoun: 'a', gender: 'Fem', number: 'Sing', restoreInfinitiveR: true },
  los: { pronoun: 'os', gender: 'Masc', number: 'Plur', restoreInfinitiveR: true },
  las: { pronoun: 'as', gender: 'Fem', number: 'Plur', restoreInfinitiveR: true },
  // Depois de nasal, o pronome recebe um -n eufônico: "põe-no" → põe + o.
  no: { pronoun: 'o', gender: 'Masc', number: 'Sing' },
  na: { pronoun: 'a', gender: 'Fem', number: 'Sing' },
  nos: { pronoun: 'os', gender: 'Masc', number: 'Plur' },
  nas: { pronoun: 'as', gender: 'Fem', number: 'Plur' },
  lhe: { pronoun: 'lhe' },
  lhes: { pronoun: 'lhes', number: 'Plur' },
  me: { pronoun: 'me' },
  se: { pronoun: 'se' }
};

/** Mesóclise: "colocá-lo-ei" (não suportada — nunca é comando direto). */
const MESOCLISIS = /^([\p{L}\p{M}]+)-(l[oa]s?|[oa]s?)-(ei|ás|á|emos|eis|ão)$/u;

const ACCENTED_INFINITIVE = /(á|ê|í)$/u;

function withClitic(
  token: RawToken,
  raw: string,
  info: CliticInfo
): RawToken {
  return {
    type: 'WORD',
    raw,
    normalized: raw.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase(),
    start: token.start,
    end: token.end,
    clitic: info
  };
}

function withWord(token: RawToken, raw: string): RawToken {
  return {
    type: 'WORD',
    raw,
    normalized: raw.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase(),
    start: token.start,
    end: token.end
  };
}

export interface SegmentResult {
  tokens: RawToken[];
  diagnostics: Diagnostic[];
}

/**
 * Decompõe contrações e ênclise. Determinístico e não destrutivo: tokens
 * sem contração/clítico passam intactos, e todo subtoken preserva o span do
 * original.
 */
export function segmentTokens(tokens: RawToken[]): SegmentResult {
  const out: RawToken[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const token of tokens) {
    if (token.type !== 'WORD' || !token.normalized) {
      out.push(token);
      continue;
    }

    const normalized = token.normalized;

    // Mesóclise: reconhecida e recusada com span (nunca vira comando).
    if (MESOCLISIS.test(normalized)) {
      diagnostics.push(
        diagnostic(
          'segmenter',
          'ERROR',
          'UNSUPPORTED_OPERATION',
          `A forma mesoclítica "${token.raw}" não é suportada; ` +
            'escreva o verbo no imperativo com o pronome depois ("coloca-o").',
          { start: token.start, end: token.end },
          { subcode: 'MESOCLISIS' }
        )
      );
      out.push(token);
      continue;
    }

    // Ênclise com hífen: verbo-pronome.
    const hyphen = token.raw.lastIndexOf('-');
    if (hyphen > 0) {
      const head = token.raw.slice(0, hyphen);
      const tail = token.normalized.slice(hyphen + 1);
      const info = ENCLITICS[tail];
      if (info) {
        let verb = head;
        if (info.restoreInfinitiveR && ACCENTED_INFINITIVE.test(verb)) {
          // "deixá-la" → deixar  ("colocá-lo" → colocar)
          verb = verb.slice(0, -1) + 'r';
        }
        out.push(withWord(token, verb));
        out.push(withClitic(token, info.pronoun, info));
        continue;
      }
    }

    const expansion = CONTRACTIONS[normalized];
    if (expansion) {
      for (const part of expansion) out.push(withWord(token, part));
      continue;
    }

    out.push(token);
  }

  return { tokens: out, diagnostics };
}
