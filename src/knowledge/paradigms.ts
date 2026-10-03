/**
 * Léxico por paradigma (F2.1/F2.2).
 *
 * Em vez de cadastrar cada flexão à mão, cadastra-se lema + paradigma
 * (raiz + regras de afixo, no modelo de Hunspell/Apertium/LMF/UniMorph) e as
 * formas são GERADAS na construção do índice.
 *
 * SurfaceForms manuais ficam só para MISSPELLING, COLLOQUIAL, ABBREVIATION e
 * exceções que o paradigma não cobre.
 */
import type { LexemeId, PartOfSpeech, Morphology } from '../engine/types';
import type { FeatureBundle, FeatureKey } from './features';

export type ParadigmId = string;

/** Regras ortográficas de fronteira raiz+sufixo (dados). */
export type OrthographyRule =
  /** c → qu antes de e/i (colocar → coloque). */
  | 'C_TO_QU'
  /** g → gu antes de e/i (apagar → apague). */
  | 'G_TO_GU'
  /** ç → c antes de e/i (começar → comece). */
  | 'CEDILLA_TO_C';

export interface ParadigmCell {
  feats: FeatureBundle;
  /** Sufixo aplicado à raiz. */
  suffix: string;
}

export interface Paradigm {
  id: ParadigmId;
  pos: PartOfSpeech;
  /** Terminação removida do lema para obter a raiz (ex.: 'ar'). */
  strip: string;
  cells: ParadigmCell[];
  orthography?: OrthographyRule[];
}

export interface GeneratedForm {
  surface: string;
  featureKey: FeatureKey;
  feats: FeatureBundle;
  morphology: Morphology;
  formType: 'CANONICAL' | 'INFLECTION';
}

/** Paradigmas do domínio. Preenchido por `buildParadigms()`. */
export const PARADIGMS: Record<ParadigmId, Paradigm> = buildParadigms();

export function buildParadigms(): Record<ParadigmId, Paradigm> {
  throw new Error('paradigmas ainda não construídos (F2.1)');
}

/** Gera as formas flexionadas de um lexema pelo seu paradigma. */
export function generateForms(
  _lexemeId: LexemeId,
  _lemma: string,
  _paradigm: Paradigm,
  _options?: {
    irregular?: Record<FeatureKey, string | string[]>;
    disabledForms?: FeatureKey[];
  }
): GeneratedForm[] {
  throw new Error('gerador de formas ainda não implementado (F2.1)');
}

/** Formas derivadas de diminutivo (Degree=Dim), mesmo lexema base. */
export function generateDiminutives(
  _lemma: string,
  _gender: 'Masc' | 'Fem',
  _number: 'Sing' | 'Plur'
): GeneratedForm[] {
  throw new Error('derivação de diminutivo ainda não implementada (F2.1)');
}
