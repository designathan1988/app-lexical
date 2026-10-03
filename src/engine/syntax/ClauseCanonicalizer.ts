import type { SemanticToken } from '../parser/SemanticToken';
import type { OperatorKind } from '../ontology/Concept';

/**
 * Canonicalização da ordem dos constituintes de uma oração.
 *
 * É o primeiro estágio de um parser em cascata no estilo de Abney ("Parsing
 * by chunks", 1991): um chunker reconhece sintagmas por classe (verbo,
 * sintagma preposicional espacial, sintagma nominal, predicado de valor) e o
 * estágio de anexação decide a quem cada um se liga. Aqui, a anexação de
 * sintagmas DESLOCADOS é feita devolvendo-os à posição canônica do português
 * de comando:
 *
 *     [cortesia] [negação] VERBO OBJETO [predicado] [sintagmas espaciais] [cortesia final]
 *
 * Deslocamentos tratados (todos por classe, nenhum por palavra):
 *   - topicalização antes do verbo: "dentro da caixa, crie um botão";
 *   - interposição entre verbo e objeto: "crie, dentro da caixa, um botão",
 *     "mova para depois da caixa o botão", "pinte de azul o botão".
 *
 * Sintagmas espaciais deslocados viram CENA da oração: em CREATE eles se
 * aplicam a todas as entidades criadas no nível superior (não só à última),
 * porque um locativo topicalizado tem escopo sobre a oração inteira.
 */

export interface TokenClasses {
  isVerb(token: SemanticToken | undefined): boolean;
  /** Relação espacial que introduz um sintagma (exclui direções de seletor). */
  isSpatialRelation(token: SemanticToken | undefined): boolean;
  /** Marcador de direção interno ao sintagma nominal ("da direita"). */
  isDirection(token: SemanticToken | undefined): boolean;
  hasOperator(token: SemanticToken | undefined, operator: OperatorKind): boolean;
  isEntity(token: SemanticToken | undefined): boolean;
  isPronoun(token: SemanticToken | undefined): boolean;
  /** Valor (cor, tamanho, adjetivo de valor) ou literal de cor/tamanho. */
  isValue(token: SemanticToken | undefined): boolean;
  /** Cardinal, ordinal ou número literal. */
  isNumeral(token: SemanticToken | undefined): boolean;
}

export interface CanonicalClause {
  tokens: SemanticToken[];
  /**
   * Índice (em `tokens`) do primeiro sintagma espacial de CENA, ou `null`.
   * Do índice em diante, os sintagmas espaciais vieram de topicalização ou
   * interposição.
   */
  sceneStart: number | null;
  /** Houve reordenação (para o trace). */
  moved: Array<{ kind: 'TOPIC' | 'INTERPOSED_PP' | 'INTERPOSED_PREDICATE'; tokens: SemanticToken[] }>;
}

const isComma = (token: SemanticToken | undefined): boolean =>
  Boolean(token && token.rawTokens.every((r) => r.type === 'PUNCT') && token.rawTokens.map((r) => r.raw).join('') === ',');

const isPunct = (token: SemanticToken | undefined): boolean =>
  Boolean(token && token.rawTokens.length > 0 && token.rawTokens.every((r) => r.type === 'PUNCT'));

export class ClauseCanonicalizer {
  constructor(private c: TokenClasses) {}

  canonicalize(tokens: SemanticToken[]): CanonicalClause {
    const unchanged: CanonicalClause = { tokens, sceneStart: null, moved: [] };
    const verbIndex = tokens.findIndex((t) => this.c.isVerb(t));
    if (verbIndex < 0) return unchanged;

    const moved: CanonicalClause['moved'] = [];
    const scene: SemanticToken[] = [];
    const predicates: SemanticToken[] = [];

    // 1. Topicalização: sintagmas espaciais antes do verbo.
    const prefix: SemanticToken[] = [];
    for (let i = 0; i < verbIndex; ) {
      if (this.startsSpatialPhrase(tokens, i)) {
        let j = i;
        while (j < verbIndex && !isComma(tokens[j]) && !this.isClauseOpener(tokens[j])) j++;
        const pp = tokens.slice(i, j);
        if (pp.length > 1) {
          scene.push(...pp);
          moved.push({ kind: 'TOPIC', tokens: pp });
          i = isComma(tokens[j]) ? j + 1 : j;
          continue;
        }
      }
      prefix.push(tokens[i]);
      i++;
    }

    // 2. Interposição entre o verbo e o objeto (com ou sem vírgulas).
    const after = tokens.slice(verbIndex + 1);
    const rest: SemanticToken[] = [];
    let k = 0;
    // Clíticos colados ao verbo ficam no lugar (são o objeto).
    while (k < after.length && after[k].rawTokens.some((r) => r.clitic !== undefined)) rest.push(after[k++]);

    for (;;) {
      const wrapped = isComma(after[k]);
      const start = wrapped ? k + 1 : k;
      const chunk = this.interposedChunk(after, start);
      if (!chunk) break;
      let end = chunk.end;
      if (isComma(after[end])) end++;
      else if (wrapped) {
        // vírgula de abertura sem a de fechamento: não é interposição.
        break;
      }
      if (!this.startsNominal(after, end)) break;
      const tokensOfChunk = after.slice(start, chunk.end);
      if (chunk.kind === 'PP') {
        scene.push(...tokensOfChunk);
        moved.push({ kind: 'INTERPOSED_PP', tokens: tokensOfChunk });
      } else {
        predicates.push(...tokensOfChunk);
        moved.push({ kind: 'INTERPOSED_PREDICATE', tokens: tokensOfChunk });
      }
      k = end;
    }
    rest.push(...after.slice(k));

    if (!moved.length) return unchanged;

    // 3. Reinsere antes da cortesia/pontuação final.
    let tail = rest.length;
    while (
      tail > 0 &&
      (isPunct(rest[tail - 1]) || this.c.hasOperator(rest[tail - 1], 'POLITE_REQUEST'))
    ) {
      tail--;
    }
    const body = rest.slice(0, tail);
    const trailing = rest.slice(tail);

    const head = [...prefix, tokens[verbIndex], ...body, ...predicates];
    const out = [...head, ...scene, ...trailing];
    return {
      tokens: out,
      sceneStart: scene.length ? head.length : null,
      moved
    };
  }

  /** Abre a oração propriamente dita: cortesia, sujeito pronominal, negação. */
  private isClauseOpener(token: SemanticToken | undefined): boolean {
    return (
      this.c.hasOperator(token, 'POLITE_REQUEST') ||
      this.c.hasOperator(token, 'POLITE_DESIRE') ||
      this.c.hasOperator(token, 'SUBJECT_PRONOUN') ||
      this.c.hasOperator(token, 'NEGATION')
    );
  }

  /** "dentro da caixa" ou "para dentro da caixa". */
  private startsSpatialPhrase(tokens: SemanticToken[], i: number): boolean {
    if (this.c.isSpatialRelation(tokens[i])) return true;
    return this.c.hasOperator(tokens[i], 'ALLATIVE') && this.c.isSpatialRelation(tokens[i + 1]);
  }

  /** Sintagma interposto a partir de `i`: espacial ou predicado de valor. */
  private interposedChunk(
    tokens: SemanticToken[],
    i: number
  ): { kind: 'PP' | 'PREDICATE'; end: number } | null {
    if (this.startsSpatialPhrase(tokens, i)) {
      let j = i;
      if (this.c.hasOperator(tokens[j], 'ALLATIVE')) j++;
      j++; // relação
      if (this.c.hasOperator(tokens[j], 'PARTITIVE')) j++;
      const end = this.nominalEnd(tokens, j);
      return end > j ? { kind: 'PP', end } : null;
    }

    const connector =
      this.c.hasOperator(tokens[i], 'ALLATIVE') ||
      this.c.hasOperator(tokens[i], 'PARTITIVE') ||
      this.c.hasOperator(tokens[i], 'COMITATIVE');
    if (connector && this.c.isValue(tokens[i + 1])) {
      let j = i + 1;
      while (j < tokens.length && this.c.isValue(tokens[j])) j++;
      return { kind: 'PREDICATE', end: j };
    }
    // Predicativo sem preposição antes do objeto: "deixe vermelha a caixa".
    // (Só é deslocamento se um sintagma nominal vier em seguida — o chamador
    // verifica.)
    if (this.c.isValue(tokens[i])) {
      let j = i;
      while (j < tokens.length && this.c.isValue(tokens[j])) j++;
      return { kind: 'PREDICATE', end: j };
    }
    return null;
  }

  /** O token em `i` inicia um sintagma nominal (objeto). */
  private startsNominal(tokens: SemanticToken[], i: number): boolean {
    const t = tokens[i];
    if (!t) return false;
    return (
      this.c.hasOperator(t, 'DEFINITE_ARTICLE') ||
      this.c.hasOperator(t, 'INDEFINITE_ARTICLE') ||
      this.c.hasOperator(t, 'UNIVERSAL_QUANTIFIER') ||
      this.c.hasOperator(t, 'ALTERNATIVE_DETERMINER') ||
      this.c.isNumeral(t) ||
      this.c.isEntity(t) ||
      this.c.isPronoun(t)
    );
  }

  /**
   * Fim de um sintagma nominal que começa em `i`: determinantes/numerais,
   * núcleo (entidade ou pronome) e modificadores pós-nominais de valor,
   * texto literal e direção. Um novo determinante encerra o sintagma.
   */
  private nominalEnd(tokens: SemanticToken[], i: number): number {
    let j = i;
    while (
      j < tokens.length &&
      (this.c.hasOperator(tokens[j], 'DEFINITE_ARTICLE') ||
        this.c.hasOperator(tokens[j], 'INDEFINITE_ARTICLE') ||
        this.c.hasOperator(tokens[j], 'UNIVERSAL_QUANTIFIER') ||
        this.c.hasOperator(tokens[j], 'ALTERNATIVE_DETERMINER') ||
        this.c.isNumeral(tokens[j])) &&
      !this.c.isEntity(tokens[j])
    ) {
      j++;
    }
    if (this.c.isEntity(tokens[j]) || this.c.isPronoun(tokens[j])) j++;
    else if (j === i) return i;

    while (j < tokens.length) {
      const t = tokens[j];
      if (this.c.isValue(t) || t.literal?.kind === 'TEXT' || this.c.isDirection(t)) {
        j++;
        continue;
      }
      break;
    }
    return j;
  }
}
