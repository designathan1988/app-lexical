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
    | 'CONDITIONAL'
    | 'INFINITIVE'
    | 'GERUND'
    | 'PARTICIPLE';

  /** `IMPERFECT` = pretérito imperfeito; `PAST` = pretérito perfeito. */
  tense?: 'PRESENT' | 'PAST' | 'IMPERFECT' | 'FUTURE';
  person?: 1 | 2 | 3;
  /** Grau do diminutivo produtivo (F2.1). */
  degree?: 'DIMINUTIVE';
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
  /** Chave canônica dos traços (formas geradas por paradigma). */
  features?: string;
  /** `true` quando a forma foi gerada na construção do índice (F2.1). */
  generated?: boolean;
}

export interface Lexeme {
  id: LexemeId;
  lemma: string;
  pos: PartOfSpeech;
  senseConceptIds: ConceptId[];
  /** Classe flexional (F2.1); ausente = sem flexão gerada. */
  paradigmId?: string;
  /** Traços inerentes do lexema (ex.: gênero do substantivo). */
  inherent?: {
    Gender?: 'Masc' | 'Fem' | 'Neut' | 'Inv';
    Number?: 'Sing' | 'Plur' | 'Inv';
  };
  /** Células sobrescritas (irregularidades), por chave canônica de traços. */
  irregular?: Record<string, string | string[]>;
  /** Células desativadas pelo curador. */
  disabledForms?: string[];
  /** Derivação (ex.: criação ← criar). */
  derivedFrom?: LexemeId;
  /** Habilita diminutivos produtivos (F2.1). */
  allowsDiminutive?: boolean;
}

export interface MultiwordEntry {
  id: string;
  phrase: string;
  conceptId: ConceptId;
}
