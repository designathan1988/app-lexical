import type { ConceptId } from '../types';
import type { ConceptNode } from '../ontology/Concept';
import type { RawToken } from '../lexical/RawLexer';
import type { LexicalIndex } from '../lexical/LexicalIndex';
import type { MultiwordTrie } from '../lexical/MultiwordTrie';
import { GRAMMATICAL_CONCEPT, type SemanticToken, type ConceptCandidate } from './SemanticToken';
import type { Span } from '../diagnostics';

function spanOfTokens(tokens: RawToken[]): Span {
  return {
    start: tokens[0]?.start ?? 0,
    end: tokens[tokens.length - 1]?.end ?? 0
  };
}

/**
 * Converte tokens brutos em tokens semânticos:
 *  - longest-match de expressões multiword (Trie);
 *  - literais (texto, cor, tamanho, número);
 *  - resolução lexical EXATA.
 *
 * A recuperação aproximada NÃO acontece aqui: o parser a solicita quando
 * conhece a categoria esperada na posição (camada de política).
 */
export class SemanticTokenBuilder {
  constructor(
    private concepts: Record<ConceptId, ConceptNode>,
    private lexicalIndex: LexicalIndex,
    private trie: MultiwordTrie
  ) {}

  build(tokens: RawToken[]): SemanticToken[] {
    const output: SemanticToken[] = [];

    for (let i = 0; i < tokens.length; ) {
      const token = tokens[i];

      const mwe = this.trie.match(tokens, i);
      if (mwe) {
        const rawTokens = tokens.slice(i, i + mwe.length);
        output.push({
          rawTokens,
          span: spanOfTokens(rawTokens),
          candidates: [
            {
              conceptId: mwe.entry.conceptId,
              score: 1,
              source: 'MULTIWORD'
            }
          ]
        });
        i += mwe.length;
        continue;
      }

      if (token.type === 'STRING') {
        output.push({
          rawTokens: [token],
          span: spanOfTokens([token]),
          candidates: [],
          literal: { kind: 'TEXT', value: String(token.value) }
        });
        i++;
        continue;
      }

      if (token.type === 'COLOR_HEX') {
        output.push({
          rawTokens: [token],
          span: spanOfTokens([token]),
          candidates: [],
          literal: { kind: 'COLOR', value: String(token.value) }
        });
        i++;
        continue;
      }

      if (token.type === 'CSS_UNIT') {
        output.push({
          rawTokens: [token],
          span: spanOfTokens([token]),
          candidates: [],
          literal: { kind: 'SIZE', value: Number(token.value), unit: token.unit! }
        });
        i++;
        continue;
      }

      if (token.type === 'NUMBER') {
        output.push({
          rawTokens: [token],
          span: spanOfTokens([token]),
          candidates: [],
          literal: { kind: 'NUMBER', value: Number(token.value) }
        });
        i++;
        continue;
      }

      if (token.type === 'WORD') {
        const lexical = this.lexicalIndex.resolve(token.raw);
        const candidates: ConceptCandidate[] = [];

        for (const candidate of lexical) {
          const senses = candidate.lexeme.senseConceptIds.filter((id) => this.concepts[id]);

          if (!senses.length) {
            // Lexema puramente gramatical (pronome, conjunção): sem sentido
            // ontológico, mas com classe gramatical e morfologia.
            candidates.push({
              conceptId: GRAMMATICAL_CONCEPT,
              lexemeId: candidate.lexeme.id,
              score: candidate.score,
              source: candidate.source,
              morphology: candidate.morphology,
              pos: candidate.lexeme.pos,
              matchedForm: candidate.surfaceForm.rawText,
              components: candidate.components
            });
            continue;
          }

          for (const conceptId of senses) {
            candidates.push({
              conceptId,
              lexemeId: candidate.lexeme.id,
              score: candidate.score,
              source: candidate.source,
              morphology: candidate.morphology,
              pos: candidate.lexeme.pos,
              matchedForm: candidate.surfaceForm.rawText,
              components: candidate.components
            });
          }
        }

        output.push({ rawTokens: [token], span: spanOfTokens([token]), candidates });
        i++;
        continue;
      }

      output.push({ rawTokens: [token], span: spanOfTokens([token]), candidates: [] });
      i++;
    }

    return output;
  }
}
