import type { ConceptId, PartOfSpeech } from '../types';
import type { ConceptNode, OperatorKind } from '../ontology/Concept';
import type { SemanticToken, ConceptCandidate } from '../parser/SemanticToken';

/**
 * Desambiguação morfossintática por restrições, no estilo Constraint Grammar
 * (VISL CG-3: https://edu.visl.dk/cg3/chunked/).
 *
 * Cada token chega como uma COORTE de leituras (candidatos). Regras em DADOS
 * removem (REMOVE) ou selecionam (SELECT) leituras conforme o contexto. As
 * regras são aplicadas em ordem, repetidamente, até o ponto fixo (com teto de
 * iterações). Duas garantias do formalismo:
 *   - a última leitura de um token nunca é removida;
 *   - cada aplicação fica registrada no trace (id da regra, token, leituras
 *     removidas), para auditoria.
 */

export type ConceptKindName = ConceptNode['kind'];

/** Teste sobre UMA leitura (candidato). Todos os campos presentes precisam casar. */
export interface ReadingTest {
  pos?: PartOfSpeech[];
  conceptKind?: ConceptKindName[];
  operator?: OperatorKind[];
  mood?: string[];
}

/** Teste sobre um TOKEN da vizinhança. */
export interface TokenTest extends ReadingTest {
  /** O token veio da segmentação de uma ênclise ("deixe-a"). */
  clitic?: boolean;
  /** Pontuação exata (",", ";", "?"). */
  punct?: string[];
  /** Fora da sentença: antes do primeiro token ou depois do último. */
  boundary?: 'START' | 'END';
}

export interface ContextCondition {
  /** Posição relativa ao token-alvo (0 = o próprio token). */
  offset: number;
  test: TokenTest;
  /** Condição negada: o teste NÃO pode valer. */
  negate?: boolean;
  /** CG "careful": TODAS as leituras do token precisam satisfazer o teste. */
  careful?: boolean;
}

export interface DisambiguationRule {
  id: string;
  action: 'SELECT' | 'REMOVE';
  /** Leituras afetadas no token-alvo. */
  target: ReadingTest;
  conditions: ContextCondition[];
  note?: string;
}

export interface DisambiguationApplication {
  ruleId: string;
  tokenIndex: number;
  removed: number;
}

export interface DisambiguationResult {
  tokens: SemanticToken[];
  applications: DisambiguationApplication[];
  iterations: number;
}

export const MAX_DISAMBIGUATION_ITERATIONS = 50;

export class Disambiguator {
  constructor(
    private rules: DisambiguationRule[],
    private concepts: Record<ConceptId, ConceptNode>
  ) {}

  run(input: SemanticToken[]): DisambiguationResult {
    // Cópia rasa por token: a coorte original (no trace léxico) não muda.
    const tokens = input.map((t) => ({ ...t, candidates: [...t.candidates] }));
    const applications: DisambiguationApplication[] = [];

    let iterations = 0;
    let changed = true;
    while (changed && iterations < MAX_DISAMBIGUATION_ITERATIONS) {
      changed = false;
      iterations++;
      for (const rule of this.rules) {
        for (let i = 0; i < tokens.length; i++) {
          const removed = this.apply(rule, tokens, i);
          if (removed > 0) {
            applications.push({ ruleId: rule.id, tokenIndex: i, removed });
            changed = true;
          }
        }
      }
    }

    return { tokens, applications, iterations };
  }

  /** Aplica a regra ao token `i`; devolve quantas leituras removeu. */
  private apply(rule: DisambiguationRule, tokens: SemanticToken[], i: number): number {
    const token = tokens[i];
    if (token.candidates.length < 2) return 0;

    const matching = token.candidates.filter((c) => this.readingMatches(c, rule.target));
    if (!matching.length) return 0;
    if (!rule.conditions.every((cond) => this.conditionHolds(cond, tokens, i))) return 0;

    let kept: ConceptCandidate[];
    if (rule.action === 'SELECT') {
      if (matching.length === token.candidates.length) return 0;
      kept = matching;
    } else {
      kept = token.candidates.filter((c) => !matching.includes(c));
      // A última leitura nunca é removida.
      if (!kept.length) return 0;
    }

    const removed = token.candidates.length - kept.length;
    token.candidates = kept;
    return removed;
  }

  private conditionHolds(cond: ContextCondition, tokens: SemanticToken[], i: number): boolean {
    const position = i + cond.offset;
    const result = this.tokenMatches(tokens[position], position, tokens.length, cond.test, cond.careful);
    return cond.negate ? !result : result;
  }

  private tokenMatches(
    token: SemanticToken | undefined,
    position: number,
    length: number,
    test: TokenTest,
    careful = false
  ): boolean {
    if (test.boundary === 'START') return position < 0;
    if (test.boundary === 'END') return position >= length;
    if (!token) return false;

    if (test.clitic !== undefined) {
      const isClitic = token.rawTokens.some((r) => r.clitic !== undefined);
      if (isClitic !== test.clitic) return false;
    }

    if (test.punct) {
      const raw = token.rawTokens.map((r) => r.raw).join('');
      const isPunct = token.rawTokens.every((r) => r.type === 'PUNCT');
      if (!isPunct || !test.punct.includes(raw)) return false;
    }

    const hasReadingTest =
      test.pos !== undefined ||
      test.conceptKind !== undefined ||
      test.operator !== undefined ||
      test.mood !== undefined;
    if (!hasReadingTest) return true;

    if (!token.candidates.length) return false;
    return careful
      ? token.candidates.every((c) => this.readingMatches(c, test))
      : token.candidates.some((c) => this.readingMatches(c, test));
  }

  private readingMatches(candidate: ConceptCandidate, test: ReadingTest): boolean {
    if (test.pos && !(candidate.pos && test.pos.includes(candidate.pos))) return false;

    const concept = this.concepts[candidate.conceptId];
    if (test.conceptKind && !(concept && test.conceptKind.includes(concept.kind))) return false;

    if (test.operator) {
      if (concept?.kind !== 'OPERATOR' || !test.operator.includes(concept.operator)) return false;
    }

    if (test.mood) {
      const mood = candidate.morphology?.mood;
      if (!mood || !test.mood.includes(mood)) return false;
    }

    return true;
  }
}
