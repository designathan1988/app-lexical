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

  /** Span que cobre do token em `from` até o atual. */
  spanFrom(from: number): Span | undefined {
    const first = this.tokens[from];
    const last = this.tokens[Math.max(from, this.index - 1)];
    if (!first) return undefined;
    return { start: first.span.start, end: (last ?? first).span.end };
  }
}
