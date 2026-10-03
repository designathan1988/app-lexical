import { RawLexer, type RawToken } from './RawLexer';
import { segmentTokens } from './Segmenter';
import type { MultiwordEntry } from '../types';

interface TrieNode {
  children: Map<string, TrieNode>;
  entry?: MultiwordEntry;
}

/**
 * Trie verdadeiro para expressões multiword, com longest-match.
 * Orientado pelos dados: adicionar milhares de expressões não altera o parser.
 *
 * Cada expressão é expandida gramaticalmente (contrações) antes da inserção,
 * para casar com o fluxo de tokens também expandido (ex.: "cor do texto" →
 * "cor de o texto").
 */
export class MultiwordTrie {
  private root: TrieNode = { children: new Map() };
  private lexer = new RawLexer();

  constructor(entries: MultiwordEntry[]) {
    for (const entry of entries) this.insert(entry);
  }

  private phraseWords(phrase: string): string[] {
    const tokens = this.lexer.lex(phrase);
    const expanded = segmentTokens(tokens).tokens;
    return expanded
      .filter((t) => t.normalized)
      .map((t) => t.normalized!);
  }

  private insert(entry: MultiwordEntry): void {
    const parts = this.phraseWords(entry.phrase);
    let node = this.root;
    for (const part of parts) {
      let child = node.children.get(part);
      if (!child) {
        child = { children: new Map() };
        node.children.set(part, child);
      }
      node = child;
    }
    node.entry = entry;
  }

  /**
   * Longest-match sobre os tokens. `lemmaOf` (opcional) devolve os lemas das
   * leituras de um token: a MWE casa por lema também, tolerando flexão —
   * "cores de fundo" casa com o padrão "cor de fundo" (3.E).
   */
  match(
    tokens: RawToken[],
    start: number,
    lemmaOf?: (token: RawToken) => string[]
  ): { entry: MultiwordEntry; length: number } | null {
    let node = this.root;
    let best: { entry: MultiwordEntry; length: number } | null = null;

    for (let i = start; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type !== 'WORD' || !token.normalized) break;

      let child = node.children.get(token.normalized);
      if (!child && lemmaOf) {
        for (const lemma of lemmaOf(token)) {
          const byLemma = node.children.get(lemma);
          if (byLemma) {
            child = byLemma;
            break;
          }
        }
      }
      if (!child) break;
      node = child;
      if (node.entry) best = { entry: node.entry, length: i - start + 1 };
    }

    return best;
  }
}
