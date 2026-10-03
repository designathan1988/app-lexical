/**
 * Tipos fundamentais do compilador semântico.
 *
 * A regra estrutural canônica é:
 *
 *   SurfaceForm ≠ Lexeme ≠ Concept ≠ Mention ≠ DocumentInstance
 *   SemanticAST ≠ ExecutionPlan ≠ RuntimeMutation
 *
 * Nenhuma dessas camadas pode voltar a ser fundida em um único objeto universal.
 */

export type SurfaceFormId = string;
export type LexemeId = string;
export type ConceptId = string;
export type DocumentNodeId = string;
export type TempNodeId = string;
export type RuleId = string;

export type PartOfSpeech =
  | 'NOUN'
  | 'VERB'
  | 'ADJECTIVE'
  | 'ADVERB'
  | 'PREPOSITION'
  | 'PRONOUN'
  | 'NUMERAL'
  | 'CONJUNCTION'
  | 'DETERMINER';

export type GrammaticalGender =
  | 'MASC'
  | 'FEM'
  | 'NEUTER'
  | 'INVARIANT';

export type GrammaticalNumber =
  | 'SINGULAR'
  | 'PLURAL'
  | 'INVARIANT';

export type ValueCategory =
  | 'COLOR'
  | 'SIZE'
  | 'NUMBER'
  | 'TEXT'
  | 'BOOLEAN'
  | 'ALIGNMENT'
  | 'WEIGHT'
  | 'DISPLAY'
  | 'ENUM'
  /** Numeral ordinal (valor = índice 0-based; negativo conta do fim). */
  | 'ORDINAL'
  /** Numeral cardinal (valor = quantidade). */
  | 'CARDINAL';

/** Categorias que nunca alimentam propriedades de renderização. */
export const GRAMMATICAL_CATEGORIES: ValueCategory[] = ['ORDINAL', 'CARDINAL'];

export interface Morphology {
  gender?: GrammaticalGender;
  number?: GrammaticalNumber;

  mood?:
    | 'INDICATIVE'
    | 'SUBJUNCTIVE'
    | 'IMPERATIVE'
    | 'INFINITIVE'
    | 'GERUND'
    | 'PARTICIPLE';

  tense?: 'PRESENT' | 'PAST' | 'FUTURE';
  person?: 1 | 2 | 3;
}

export type FormType =
  | 'CANONICAL'
  | 'INFLECTION'
  | 'COLLOQUIAL'
  | 'MISSPELLING'
  | 'ABBREVIATION';

export interface SurfaceForm {
  id: SurfaceFormId;
  rawText: string;
  lexemeId: LexemeId;
  formType: FormType;
  morphology?: Morphology;
}

export interface Lexeme {
  id: LexemeId;
  lemma: string;
  pos: PartOfSpeech;
  senseConceptIds: ConceptId[];
}

export interface MultiwordEntry {
  id: string;
  phrase: string;
  conceptId: ConceptId;
}
