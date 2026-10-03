import type {
  ConceptId,
  GrammaticalGender,
  GrammaticalNumber,
  Lexeme,
  LexemeId,
  SurfaceForm
} from '../types';
import type { ConceptNode, OperatorKind } from '../ontology/Concept';

/**
 * Gramática derivada DOS DADOS.
 *
 * `Grammar.ts` (as classes fechadas) não é mais escrito à mão: é construído a
 * partir dos lexemas e conceitos da base de conhecimento. Adicionar "salvo"
 * como forma de EXCEPT, um novo ordinal ou uma nova preposição espacial é uma
 * alteração de DADOS — o parser não muda.
 */
export interface GrammarEntry {
  lexemeId: LexemeId;
  lemma: string;
  conceptId?: ConceptId;
  operator?: OperatorKind;
  /** Valor ordinal (índice 0-based; negativo conta do fim). */
  ordinalValue?: number;
  /** Valor cardinal. */
  cardinalValue?: number;
  gender?: GrammaticalGender;
  number?: GrammaticalNumber;
}

export interface GrammarIndex {
  /** palavra normalizada → entradas gramaticais */
  byWord: Map<string, GrammarEntry[]>;
  /** operador → palavras registradas (para diagnósticos e testes) */
  wordsByOperator: Map<OperatorKind, string[]>;
  /** conceito espacial → palavras */
  wordsBySpatial: Map<ConceptId, string[]>;
}

function normalize(word: string): string {
  return word
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

export function buildGrammarIndex(
  concepts: Record<ConceptId, ConceptNode>,
  lexemes: Record<LexemeId, Lexeme>,
  surfaceForms: SurfaceForm[]
): GrammarIndex {
  const byWord = new Map<string, GrammarEntry[]>();
  const wordsByOperator = new Map<OperatorKind, string[]>();
  const wordsBySpatial = new Map<ConceptId, string[]>();

  for (const surface of surfaceForms) {
    const lexeme = lexemes[surface.lexemeId];
    if (!lexeme) continue;

    const isGrammatical =
      lexeme.pos === 'DETERMINER' ||
      lexeme.pos === 'PRONOUN' ||
      lexeme.pos === 'CONJUNCTION' ||
      lexeme.pos === 'PREPOSITION' ||
      lexeme.pos === 'NUMERAL' ||
      lexeme.senseConceptIds.some((id) => concepts[id]?.kind === 'OPERATOR');

    if (!isGrammatical) continue;

    const key = normalize(surface.rawText);

    for (const conceptId of lexeme.senseConceptIds.length ? lexeme.senseConceptIds : [undefined]) {
      const concept = conceptId ? concepts[conceptId] : undefined;
      const entry: GrammarEntry = {
        lexemeId: lexeme.id,
        lemma: lexeme.lemma,
        conceptId,
        // A morfologia é da FORMA, não do lexema: "uns" é plural, "um" é
        // singular, embora ambos pertençam a LEX_UM.
        gender: surface.morphology?.gender,
        number: surface.morphology?.number
      };

      if (concept?.kind === 'OPERATOR') {
        entry.operator = concept.operator;
        const list = wordsByOperator.get(concept.operator) ?? [];
        if (!list.includes(key)) list.push(key);
        wordsByOperator.set(concept.operator, list);
      } else if (concept?.kind === 'VALUE' && concept.valueCategory === 'ORDINAL') {
        entry.ordinalValue = Number(concept.literal);
      } else if (concept?.kind === 'VALUE' && concept.valueCategory === 'CARDINAL') {
        entry.cardinalValue = Number(concept.literal);
      } else if (concept?.kind === 'SPATIAL') {
        const list = wordsBySpatial.get(concept.id) ?? [];
        if (!list.includes(key)) list.push(key);
        wordsBySpatial.set(concept.id, list);
      }

      const bucket = byWord.get(key) ?? [];
      // Evita duplicatas idênticas (mesma palavra, mesmo conceito).
      if (!bucket.some((e) => e.lexemeId === entry.lexemeId && e.conceptId === entry.conceptId)) {
        bucket.push(entry);
      }
      byWord.set(key, bucket);
    }
  }

  return { byWord, wordsByOperator, wordsBySpatial };
}

export function entriesFor(index: GrammarIndex, word: string | null): GrammarEntry[] {
  if (!word) return [];
  return index.byWord.get(normalize(word)) ?? [];
}

export function hasOperator(index: GrammarIndex, word: string | null, operator: OperatorKind): boolean {
  return entriesFor(index, word).some((e) => e.operator === operator);
}

export function firstOperatorEntry(
  index: GrammarIndex,
  word: string | null,
  operator: OperatorKind
): GrammarEntry | undefined {
  return entriesFor(index, word).find((e) => e.operator === operator);
}

export function hasSpatial(index: GrammarIndex, word: string | null): boolean {
  return entriesFor(index, word).some((e) => e.conceptId !== undefined && e.ordinalValue === undefined && e.cardinalValue === undefined);
}

export function spatialEntryFor(
  index: GrammarIndex,
  word: string | null,
  concepts: Record<ConceptId, ConceptNode>
): GrammarEntry | undefined {
  return entriesFor(index, word).find((e) => e.conceptId && concepts[e.conceptId]?.kind === 'SPATIAL');
}
