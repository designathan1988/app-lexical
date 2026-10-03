import type { ConceptId, ValueCategory } from '../types';
import type { ConceptNode, ActionConcept } from '../ontology/Concept';
import type { LexicalIndex, SurfaceCandidate } from '../lexical/LexicalIndex';
import type { SemanticToken, ConceptCandidate } from './SemanticToken';
import { entriesFor, type GrammarIndex } from './GrammarIndex';
import type { Diagnostic } from '../diagnostics';
import { diagnostic } from '../diagnostics';
import type { EngineSettings } from '../EngineSettings';

/** Categoria esperada numa posição, derivada da estrutura (não de palavras). */
export type ExpectedSlot =
  | 'ACTION'
  | 'ENTITY'
  | 'VALUE'
  | 'PROPERTY'
  | 'SPATIAL'
  | 'ANY';

const GRAMMATICAL_VALUE_CATEGORIES = new Set<ValueCategory>(['ORDINAL', 'CARDINAL']);

/** Candidato aproximado já pontuado pelo contexto gramatical. */
interface RecoveredCandidate extends SurfaceCandidate {
  candidates: ConceptCandidate[];
}

/**
 * Recuperação aproximada com política explícita (§D4).
 *
 * Fluxo: entrada desconhecida → candidatos por índice → compatibilidade
 * lexical (similaridade normalizada) → compatibilidade gramatical (classe
 * esperada na posição) → compatibilidade semântica → decisão.
 *
 * NUNCA resolve `matches[0]`. Ações destrutivas jamais são resolvidas por
 * aproximação. Toda decisão é registrada com forma, lexema, score e
 * componentes do score.
 */
export class LexicalRecovery {
  constructor(
    private concepts: Record<ConceptId, ConceptNode>,
    private lexicalIndex: LexicalIndex,
    private grammar: GrammarIndex,
    private settings: EngineSettings
  ) {}

  apply(tokens: SemanticToken[], diagnostics: Diagnostic[]): SemanticToken[] {
    const actionSlot = this.actionSlotIndex(tokens);

    return tokens.map((token, index) => {
      if (token.literal || token.candidates.length) return token;

      const rawToken = token.rawTokens[0];
      if (!rawToken || rawToken.type !== 'WORD') return token;
      const word = rawToken.normalized;
      if (!word) return token;

      // Palavra de função conhecida: nada a recuperar.
      if (this.isGrammarWord(word)) return token;

      const slot = this.expectedSlot(tokens, index, actionSlot);
      const raw = this.lexicalIndex.approximateCandidates(word);

      if (!this.settings.approximateEnabled) {
        diagnostics.push(this.unknownDiagnostic(word, token, raw));
        return token;
      }

      // Compatibilidade gramatical é um PORTÃO, não um bônus: um candidato que
      // não cabe na categoria esperada não é aceito. A similaridade de
      // superfície é o critério de aceitação — palavras curtas precisam ser
      // proporcionalmente mais próximas.
      const scored = raw
        .map((candidate) => this.withContextScore(candidate, slot))
        .filter((candidate) => candidate.components.morphology > 0)
        .filter((candidate) => candidate.components.similarity >= this.settings.approximateMinSimilarity)
        .sort((a, b) => b.score - a.score);

      if (!scored.length) {
        diagnostics.push(this.unknownDiagnostic(word, token, raw));
        return token;
      }

      // Ação destrutiva nunca é aproximada.
      if (index === actionSlot && this.settings.destructiveRequiresExact) {
        const allDestructive = scored.every((s) =>
          s.candidates.every((c) => {
            const concept = this.concepts[c.conceptId];
            return concept?.kind === 'ACTION' && concept.destructive;
          })
        );
        if (allDestructive) {
          diagnostics.push(
            diagnostic('morphology', 'ERROR', 'UNKNOWN_WORD',
              `"${word}" parece uma ação destrutiva (${scored
                .map((s) => s.lexeme.lemma)
                .join(', ')}); ações destrutivas exigem forma cadastrada exata. ` +
                'Cadastre a forma ou escreva o verbo corretamente.',
              token.span, {
                candidates: scored.map((s) => s.lexeme.id),
                scores: scored.map((s) => s.score)
              })
          );
          return token;
        }
      }

      const distinctConcepts = new Set(
        scored.flatMap((s) => s.candidates.map((c) => c.conceptId))
      );

      // Sentidos incompatíveis: entre candidatos empatados (gap pequeno) ou
      // dentro de um único candidato cuja forma casa com mais de um conceito.
      const ambiguousSense =
        distinctConcepts.size > 1 &&
        (scored.length === 1 || scored[0].score - scored[1].score < 0.05);
      if (ambiguousSense) {
        diagnostics.push(
          diagnostic('morphology', 'ERROR', 'AMBIGUOUS_SENSE',
            `"${word}" é ambíguo: pode ser ${scored
              .map((s) => `${s.lexeme.lemma} (${s.score.toFixed(2)})`)
              .join(', ')}. Escreva a forma correta.`,
            token.span, {
              candidates: Array.from(distinctConcepts),
              scores: scored.map((s) => s.score)
            })
        );
        return token;
      }

      const best = scored[0];
      diagnostics.push(
        diagnostic('morphology', 'WARNING', 'PHONETIC_MATCH',
          `"${word}" não está cadastrada; interpretada como "${best.matchedForm}" ` +
            `(${best.lexeme.id} → ${best.candidates.map((c) => c.conceptId).join('/')}, ` +
            `score ${best.score.toFixed(2)}: similaridade ${best.components.similarity.toFixed(2)}, ` +
            `fonética ${best.components.phonetic.toFixed(2)}, ` +
            `gramática ${best.components.morphology.toFixed(2)}).`,
          token.span, {
            candidates: best.candidates.map((c) => c.conceptId),
            scores: [best.score]
          })
      );

      return { ...token, candidates: best.candidates };
    });
  }

  private unknownDiagnostic(
    word: string,
    token: SemanticToken,
    raw: Array<SurfaceCandidate & { candidates?: Array<{ conceptId: ConceptId }> }>
  ): Diagnostic {
    const suggestions = raw.slice(0, 3);
    return diagnostic(
      'morphology',
      'ERROR',
      'UNKNOWN_WORD',
      `"${word}" não está no vocabulário do domínio.` +
        (suggestions.length
          ? ` Você quis dizer ${suggestions
              .map((s) => `"${s.matchedForm}" (${s.lexeme.lemma}, ${s.score.toFixed(2)})`)
              .join(', ')}?`
          : ''),
      token.span,
      {
        candidates: suggestions.map((s) => s.lexeme.id),
        scores: suggestions.map((s) => s.score)
      }
    );
  }

  private isGrammarWord(word: string): boolean {
    return entriesFor(this.grammar, word).length > 0;
  }

  /** Posição do verbo: primeiro token de conteúdo após negação opcional. */
  private actionSlotIndex(tokens: SemanticToken[]): number {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.literal) continue;
      const word = token.rawTokens[0]?.normalized;
      if (!word) continue;

      if (token.candidates.length) {
        return token.candidates.some((c) => this.concepts[c.conceptId]?.kind === 'ACTION')
          ? i
          : -1;
      }
      if (this.isGrammarWord(word)) continue;
      return i;
    }
    return -1;
  }

  /** Categoria esperada na posição, inferida da estrutura do contexto. */
  private expectedSlot(
    tokens: SemanticToken[],
    index: number,
    actionSlotIndex: number
  ): ExpectedSlot {
    if (index === actionSlotIndex) return 'ACTION';

    const previous = tokens[index - 1];
    if (!previous) return 'ANY';

    const previousRaw = previous.rawTokens.map((t) => t.raw).join('');
    if (previousRaw === ';') return 'ANY';

    const previousWord = previous.rawTokens[0]?.normalized ?? '';
    const entries = entriesFor(this.grammar, previousWord);

    if (entries.length && !previous.candidates.length) {
      const operator = entries.find((e) => e.operator)?.operator;
      switch (operator) {
        case 'DEFINITE_ARTICLE':
        case 'INDEFINITE_ARTICLE':
        case 'UNIVERSAL_QUANTIFIER':
        case 'ALTERNATIVE_DETERMINER':
          return 'ENTITY';
        case 'PARTITIVE':
        case 'ALLATIVE':
        case 'COMITATIVE':
          return 'PROPERTY';
        default:
          return 'ANY';
      }
    }

    const previousConceptId = previous.candidates[0]?.conceptId;
    const previousKind = previousConceptId
      ? this.concepts[previousConceptId]?.kind
      : undefined;

    switch (previousKind) {
      case 'ACTION':
        return 'ENTITY';
      case 'PROPERTY':
      case 'PROPERTY_GROUP':
        return 'VALUE';
      case 'ENTITY':
        return 'VALUE';
      case 'VALUE':
        return 'PROPERTY';
      case 'SPATIAL':
        return 'ENTITY';
      default:
        // Numeral e operadores gramaticais precedem um núcleo nominal.
        if (entries.some((e) => e.ordinalValue !== undefined || e.cardinalValue !== undefined)) {
          return 'ENTITY';
        }
        return 'ANY';
    }
  }

  private withContextScore(
    candidate: SurfaceCandidate,
    slot: ExpectedSlot
  ): RecoveredCandidate {
    const concepts = candidate.lexeme.senseConceptIds
      .map((id) => this.concepts[id])
      .filter((c): c is ConceptNode => Boolean(c));

    const fits = slot === 'ANY' || concepts.some((c) => this.kindFitsSlot(c, slot));
    const grammarScore = fits ? 1 : 0;

    // Score composto para ORDENAÇÃO e registro; a aceitação usa `similarity`.
    const finalScore =
      candidate.components.similarity * 0.7 +
      candidate.components.phonetic * 0.2 +
      grammarScore * 0.1;

    return {
      ...candidate,
      score: finalScore,
      components: {
        similarity: candidate.components.similarity,
        phonetic: candidate.components.phonetic,
        morphology: grammarScore,
        context: 0
      },
      candidates: concepts.map((c) => ({
        conceptId: c.id,
        lexemeId: candidate.lexeme.id,
        score: finalScore,
        source: (candidate.source === 'PHONETIC' ? 'PHONETIC' : 'APPROXIMATE') as
          | 'PHONETIC'
          | 'APPROXIMATE',
        morphology: candidate.morphology,
        pos: candidate.lexeme.pos,
        matchedForm: candidate.matchedForm,
        components: candidate.components
      }))
    };
  }

  private kindFitsSlot(concept: ConceptNode, slot: ExpectedSlot): boolean {
    switch (slot) {
      case 'ACTION':
        return concept.kind === 'ACTION';
      case 'ENTITY':
        return concept.kind === 'ENTITY';
      case 'VALUE':
        return (
          concept.kind === 'VALUE' && !GRAMMATICAL_VALUE_CATEGORIES.has(concept.valueCategory)
        );
      case 'PROPERTY':
        return concept.kind === 'PROPERTY' || concept.kind === 'PROPERTY_GROUP';
      case 'SPATIAL':
        return concept.kind === 'SPATIAL';
      case 'ANY':
        return true;
    }
  }
}

export type { ActionConcept };
