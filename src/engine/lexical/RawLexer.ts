/**
 * Lexer não destrutivo.
 *
 * Preserva acentos, offsets no texto original, strings entre aspas, números,
 * valores negativos, decimais, medidas CSS, porcentagens, cores hexadecimais e
 * identificadores. O lexer NÃO decide semântica: apenas identifica unidades.
 */
export type RawTokenType =
  | 'WORD'
  | 'STRING'
  | 'NUMBER'
  | 'CSS_UNIT'
  | 'COLOR_HEX'
  | 'PUNCT';

export interface RawToken {
  type: RawTokenType;
  raw: string;
  normalized?: string;
  start: number;
  end: number;
  value?: string | number;
  unit?: string;
  /**
   * Marca de clítico (3.B): o token foi produzido pela segmentação de uma
   * ênclise ("deixe-a" → "deixe" + "a") e deve ser analisado como pronome.
   */
  clitic?: {
    pronoun: string;
    gender?: 'Masc' | 'Fem';
    number?: 'Sing' | 'Plur';
    restoreInfinitiveR?: boolean;
  };
}

export class RawLexer {
  /** Normalização Unicode + remoção de diacríticos, apenas como chave de indexação. */
  static normalize(text: string): string {
    return text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase();
  }

  lex(input: string): RawToken[] {
    const tokens: RawToken[] = [];
    let i = 0;

    while (i < input.length) {
      const char = input[i];

      if (/\s/u.test(char)) {
        i++;
        continue;
      }

      const rest = input.slice(i);

      if (char === '"' || char === "'") {
        const quote = char;
        let j = i + 1;
        let escaped = false;
        while (j < input.length) {
          if (!escaped && input[j] === quote) break;
          escaped = !escaped && input[j] === '\\';
          if (input[j] !== '\\') escaped = false;
          j++;
        }
        const close = j < input.length ? j : input.length - 1;
        const raw = input.slice(i, close + 1);
        const value = input.slice(i + 1, close);
        tokens.push({ type: 'STRING', raw, value, start: i, end: close + 1 });
        i = close + 1;
        continue;
      }

      const hex = rest.match(/^#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/);
      if (hex) {
        tokens.push({
          type: 'COLOR_HEX',
          raw: hex[0],
          value: hex[0],
          start: i,
          end: i + hex[0].length
        });
        i += hex[0].length;
        continue;
      }

      const unit = rest.match(
        /^-?(?:\d+(?:\.\d+)?|\.\d+)(px|rem|em|%|vh|vw|vmin|vmax|ch|ex)(?![a-zA-Z])/i
      );
      if (unit) {
        const amount = Number.parseFloat(unit[0]);
        tokens.push({
          type: 'CSS_UNIT',
          raw: unit[0],
          value: amount,
          unit: unit[1].toLowerCase(),
          start: i,
          end: i + unit[0].length
        });
        i += unit[0].length;
        continue;
      }

      const number = rest.match(/^-?(?:\d+(?:\.\d+)?|\.\d+)/);
      if (number) {
        tokens.push({
          type: 'NUMBER',
          raw: number[0],
          value: Number.parseFloat(number[0]),
          start: i,
          end: i + number[0].length
        });
        i += number[0].length;
        continue;
      }

      const word = rest.match(/^[\p{L}\p{M}][\p{L}\p{M}\d_-]*/u);
      if (word) {
        tokens.push({
          type: 'WORD',
          raw: word[0],
          normalized: RawLexer.normalize(word[0]),
          start: i,
          end: i + word[0].length
        });
        i += word[0].length;
        continue;
      }

      tokens.push({ type: 'PUNCT', raw: char, value: char, start: i, end: i + 1 });
      i++;
    }

    return tokens;
  }
}
