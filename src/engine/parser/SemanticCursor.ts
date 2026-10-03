import type { SemanticToken } from './SemanticToken';
import { RawLexer } from '../lexical/RawLexer';
import type { Span } from '../diagnostics';

export class SemanticCursor {
  index = 0;
  /** Tokens efetivamente consumidos, na ordem (base da invariante de consumo). */
  readonly consumed: SemanticToken[] = [];

  constructor(public tokens: SemanticToken[]) {}

  eof(): boolean {
    return this.index >= this.tokens.length;
  }

  peek(offset = 0): SemanticToken | undefined {
    return this.tokens[this.index + offset];
  }

  consume(): SemanticToken | undefined {
    const token = this.tokens[this.index++];
    if (token) this.consumed.push(token);
    return token;
  }

  rawWord(offset = 0): string | null {
    const token = this.peek(offset);
    if (!token) return null;
    const raw = token.rawTokens.map((x) => x.raw).join(' ');
    return RawLexer.normalize(raw);
  }

  consumeWord(expected: string): boolean {
    if (this.rawWord() !== expected) return false;
    this.consume();
    return true;
  }

  /** Span do último token consumido (útil para diagnósticos do binder). */
  previousSpan(): Span | undefined {
    const token = this.tokens[this.index - 1] ?? this.tokens[0];
    return token?.span;
  }

  /**
   * Consome todo o restante do grupo: usado quando um nó do AST assume o
   * comando inteiro (recusa por verbo desconhecido ou por tempo de relato).
   */
  consumeRest(): void {
    while (!this.eof()) this.consume();
  }

  /** Span do grupo inteiro de tokens deste cursor. */
  fullSpan(): Span | undefined {
    if (!this.tokens.length) return undefined;
    return {
      start: Math.min(...this.tokens.map((t) => t.span.start)),
      end: Math.max(...this.tokens.map((t) => t.span.end))
    };
  }

  /**
   * Span que cobre os tokens de `from` até o atual. Usa mínimo/máximo porque,
   * após a canonicalização da ordem dos constituintes, tokens adjacentes no
   * cursor podem vir de posições não adjacentes da entrada.
   */
  spanFrom(from: number): Span | undefined {
    const slice = this.tokens.slice(from, Math.max(from + 1, this.index));
    if (!slice.length) return undefined;
    return {
      start: Math.min(...slice.map((t) => t.span.start)),
      end: Math.max(...slice.map((t) => t.span.end))
    };
  }
}
