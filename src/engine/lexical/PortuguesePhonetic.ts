import { RawLexer } from './RawLexer';

/**
 * Recuperação fonética para o português.
 *
 * Gera apenas CANDIDATOS. Jamais decide sozinha o significado de uma palavra.
 * Pode ser substituída por um algoritmo mais sofisticado sem afetar as demais
 * camadas, pois a interface é uma única função `key(input: string): string`.
 */
export class PortuguesePhonetic {
  static key(input: string): string {
    let s = RawLexer.normalize(input);

    s = s
      .replace(/nh/g, 'N')
      .replace(/lh/g, 'L')
      .replace(/ch/g, 'X')
      .replace(/sh/g, 'X')
      .replace(/ph/g, 'F');

    s = s
      .replace(/qu(?=[ei])/g, 'K')
      .replace(/gu(?=[ei])/g, 'G');

    s = s
      .replace(/ç/g, 's')
      .replace(/c(?=[ei])/g, 's')
      .replace(/c/g, 'k')
      .replace(/q/g, 'k')
      .replace(/z/g, 's')
      .replace(/x/g, 's')
      .replace(/g(?=[ei])/g, 'j')
      .replace(/h/g, '');

    s = s
      .replace(/[aeiou]+/g, 'A')
      .replace(/(.)\1+/g, '$1');

    return s.toUpperCase();
  }
}
