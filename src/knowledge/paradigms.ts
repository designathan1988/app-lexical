/**
 * Léxico por paradigma (F2.1/F2.2).
 *
 * Em vez de cadastrar cada flexão à mão, cadastra-se lema + paradigma
 * (raiz + regras de afixo, no modelo de Hunspell/Apertium/LMF/UniMorph) e as
 * formas são GERADAS na construção do índice.
 *
 * SurfaceForms manuais ficam só para MISSPELLING, COLLOQUIAL, ABBREVIATION e
 * exceções que o paradigma não cobre.
 *
 * Ordem das células: forma canônica, não-finitas, indicativo (presente,
 * pretérito perfeito, imperfeito, futuro, condicional), imperativo,
 * subjuntivo. A ordem define a leitura-por-defeito (candidato #1) em caso de
 * homografia: "cria" → indicativo 3sg; "crie"/"criem" → imperativo.
 */
import type { LexemeId, PartOfSpeech, Morphology } from '../engine/types';
import type { FeatureBundle, FeatureKey } from './features';
import { featureKey, featuresToMorphology } from './features';

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
  /**
   * Paradigma irregular: as células trazem a forma plena (raiz vazia).
   * Diferente de `strip: ''`, em que a raiz é o próprio lema (ex.: N_S).
   */
  fullForm?: boolean;
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

// ---------------------------------------------------------------------------
// Células base
// ---------------------------------------------------------------------------

const cell = (feats: FeatureBundle, suffix: string): ParadigmCell => ({ feats, suffix });

const PERSONS: Array<{ person: 1 | 2 | 3; number: 'Sing' | 'Plur' }> = [
  { person: 1, number: 'Sing' },
  { person: 2, number: 'Sing' },
  { person: 3, number: 'Sing' },
  { person: 1, number: 'Plur' },
  { person: 2, number: 'Plur' },
  { person: 3, number: 'Plur' }
];

/** Células de um tempo/modo finito: sufixos por pessoa [1s,2s,3s,1p,2p,3p]. */
function finite(
  mood: FeatureBundle['Mood'],
  tense: FeatureBundle['Tense'],
  suffixes: [string, string, string, string, string, string]
): ParadigmCell[] {
  return PERSONS.map(({ person, number }, i) =>
    cell({ Number: number, Person: person, Mood: mood, VerbForm: 'Fin', ...(tense ? { Tense: tense } : {}) }, suffixes[i])
  );
}

function imperative(
  suffixes: [string, string, string, string, string]
): ParadigmCell[] {
  return [
    cell({ Number: 'Sing', Person: 2, Mood: 'Imp', VerbForm: 'Fin' }, suffixes[0]),
    cell({ Number: 'Sing', Person: 3, Mood: 'Imp', VerbForm: 'Fin' }, suffixes[1]),
    cell({ Number: 'Plur', Person: 1, Mood: 'Imp', VerbForm: 'Fin' }, suffixes[2]),
    cell({ Number: 'Plur', Person: 2, Mood: 'Imp', VerbForm: 'Fin' }, suffixes[3]),
    cell({ Number: 'Plur', Person: 3, Mood: 'Imp', VerbForm: 'Fin' }, suffixes[4])
  ];
}

function participles(theme: string): ParadigmCell[] {
  return [
    cell({ Gender: 'Masc', Number: 'Sing', VerbForm: 'Part' }, `${theme}o`),
    cell({ Gender: 'Fem', Number: 'Sing', VerbForm: 'Part' }, `${theme}a`),
    cell({ Gender: 'Masc', Number: 'Plur', VerbForm: 'Part' }, `${theme}os`),
    cell({ Gender: 'Fem', Number: 'Plur', VerbForm: 'Part' }, `${theme}as`)
  ];
}

/** Conjugação regular -ar (sufixos sobre a raiz sem o 'ar'). */
function cellsAR(): ParadigmCell[] {
  return [
    cell({ VerbForm: 'Inf' }, 'ar'),
    cell({ VerbForm: 'Ger' }, 'ando'),
    ...participles('ad'),
    ...finite('Ind', 'Pres', ['o', 'as', 'a', 'amos', 'ais', 'am']),
    ...finite('Ind', 'Past', ['ei', 'aste', 'ou', 'amos', 'astes', 'aram']),
    ...finite('Ind', 'Imp', ['ava', 'avas', 'ava', 'ávamos', 'áveis', 'avam']),
    ...finite('Ind', 'Fut', ['arei', 'arás', 'ará', 'aremos', 'areis', 'arão']),
    ...finite('Cnd', 'Fut', ['aria', 'arias', 'aria', 'aríamos', 'aríeis', 'ariam']),
    ...imperative(['a', 'e', 'emos', 'ai', 'em']),
    ...finite('Sub', 'Pres', ['e', 'es', 'e', 'emos', 'eis', 'em'])
  ];
}

/** Conjugação regular -er. */
function cellsER(): ParadigmCell[] {
  return [
    cell({ VerbForm: 'Inf' }, 'er'),
    cell({ VerbForm: 'Ger' }, 'endo'),
    ...participles('id'),
    ...finite('Ind', 'Pres', ['o', 'es', 'e', 'emos', 'eis', 'em']),
    ...finite('Ind', 'Past', ['i', 'este', 'eu', 'emos', 'estes', 'eram']),
    ...finite('Ind', 'Imp', ['ia', 'ias', 'ia', 'íamos', 'íeis', 'iam']),
    ...finite('Ind', 'Fut', ['erei', 'erás', 'erá', 'eremos', 'ereis', 'erão']),
    ...finite('Cnd', 'Fut', ['eria', 'erias', 'eria', 'eríamos', 'eríeis', 'eriam']),
    ...imperative(['e', 'a', 'amos', 'ei', 'am']),
    ...finite('Sub', 'Pres', ['a', 'as', 'a', 'amos', 'ais', 'am'])
  ];
}

/** Conjugação regular -ir. */
function cellsIR(): ParadigmCell[] {
  return [
    cell({ VerbForm: 'Inf' }, 'ir'),
    cell({ VerbForm: 'Ger' }, 'indo'),
    ...participles('id'),
    ...finite('Ind', 'Pres', ['o', 'es', 'e', 'imos', 'is', 'em']),
    ...finite('Ind', 'Past', ['i', 'iste', 'iu', 'imos', 'istes', 'iram']),
    ...finite('Ind', 'Imp', ['ia', 'ias', 'ia', 'íamos', 'íeis', 'iam']),
    ...finite('Ind', 'Fut', ['irei', 'irás', 'irá', 'iremos', 'ireis', 'irão']),
    ...finite('Cnd', 'Fut', ['iria', 'irias', 'iria', 'iríamos', 'iríeis', 'iriam']),
    ...imperative(['e', 'a', 'amos', 'i', 'am']),
    ...finite('Sub', 'Pres', ['a', 'as', 'a', 'amos', 'ais', 'am'])
  ];
}

/** Paradigma irregular com formas plenas (strip vazio, sufixo = forma). */
function fullForms(cells: Array<[FeatureBundle, string]>): ParadigmCell[] {
  return cells.map(([feats, surface]) => cell(feats, surface));
}

// ---------------------------------------------------------------------------
// Paradigmas
// ---------------------------------------------------------------------------

export function buildParadigms(): Record<ParadigmId, Paradigm> {
  return {
    V_AR: { id: 'V_AR', pos: 'VERB', strip: 'ar', cells: cellsAR() },
    V_AR_GAR: { id: 'V_AR_GAR', pos: 'VERB', strip: 'ar', cells: cellsAR(), orthography: ['G_TO_GU'] },
    V_AR_CAR: { id: 'V_AR_CAR', pos: 'VERB', strip: 'ar', cells: cellsAR(), orthography: ['C_TO_QU'] },
    V_AR_CED: { id: 'V_AR_CED', pos: 'VERB', strip: 'ar', cells: cellsAR(), orthography: ['CEDILLA_TO_C'] },
    V_ER: { id: 'V_ER', pos: 'VERB', strip: 'er', cells: cellsER() },
    V_ER_GER: { id: 'V_ER_GER', pos: 'VERB', strip: 'er', cells: cellsER(), orthography: ['G_TO_GU'] },
    V_IR: { id: 'V_IR', pos: 'VERB', strip: 'ir', cells: cellsIR() },

    V_FAZER: {
      id: 'V_FAZER',
      pos: 'VERB',
      strip: '',
      fullForm: true,
      cells: fullForms([
        [{ VerbForm: 'Inf' }, 'fazer'],
        [{ VerbForm: 'Ger' }, 'fazendo'],
        [{ Gender: 'Masc', Number: 'Sing', VerbForm: 'Part' }, 'feito'],
        [{ Gender: 'Fem', Number: 'Sing', VerbForm: 'Part' }, 'feita'],
        [{ Gender: 'Masc', Number: 'Plur', VerbForm: 'Part' }, 'feitos'],
        [{ Gender: 'Fem', Number: 'Plur', VerbForm: 'Part' }, 'feitas'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'faço'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'fazes'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'faz'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'fazemos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'fazeis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'fazem'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'fiz'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'fizeste'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'fez'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'fizemos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'fizestes'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'fizeram'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'fazia'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'fazias'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'fazia'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'fazíamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'fazíeis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'faziam'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'farei'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'farás'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'fará'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'faremos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'fareis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'farão'],
        [{ Number: 'Sing', Person: 1, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'faria'],
        [{ Number: 'Sing', Person: 2, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'farias'],
        [{ Number: 'Sing', Person: 3, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'faria'],
        [{ Number: 'Plur', Person: 1, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'faríamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'faríeis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'fariam'],
        [{ Number: 'Sing', Person: 2, Mood: 'Imp', VerbForm: 'Fin' }, 'faze'],
        [{ Number: 'Sing', Person: 3, Mood: 'Imp', VerbForm: 'Fin' }, 'faça'],
        [{ Number: 'Plur', Person: 1, Mood: 'Imp', VerbForm: 'Fin' }, 'façamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Imp', VerbForm: 'Fin' }, 'fazei'],
        [{ Number: 'Plur', Person: 3, Mood: 'Imp', VerbForm: 'Fin' }, 'façam'],
        [{ Number: 'Sing', Person: 1, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'faça'],
        [{ Number: 'Sing', Person: 2, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'faças'],
        [{ Number: 'Sing', Person: 3, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'faça'],
        [{ Number: 'Plur', Person: 1, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'façamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'façais'],
        [{ Number: 'Plur', Person: 3, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'façam']
      ])
    },

    V_POR: {
      id: 'V_POR',
      pos: 'VERB',
      strip: '',
      fullForm: true,
      cells: fullForms([
        [{ VerbForm: 'Inf' }, 'pôr'],
        [{ VerbForm: 'Ger' }, 'pondo'],
        [{ Gender: 'Masc', Number: 'Sing', VerbForm: 'Part' }, 'posto'],
        [{ Gender: 'Fem', Number: 'Sing', VerbForm: 'Part' }, 'posta'],
        [{ Gender: 'Masc', Number: 'Plur', VerbForm: 'Part' }, 'postos'],
        [{ Gender: 'Fem', Number: 'Plur', VerbForm: 'Part' }, 'postas'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'ponho'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'pões'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'põe'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'pomos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'pondes'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'põem'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'pus'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'puseste'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'pôs'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'pusemos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'pusestes'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'puseram'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'punha'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'punhas'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'punha'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'púnhamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'púnheis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'punham'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'porei'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'porás'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'porá'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'poremos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'poreis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'porão'],
        [{ Number: 'Sing', Person: 1, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'poria'],
        [{ Number: 'Sing', Person: 2, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'porias'],
        [{ Number: 'Sing', Person: 3, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'poria'],
        [{ Number: 'Plur', Person: 1, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'poríamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'poríeis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'poriam'],
        [{ Number: 'Sing', Person: 2, Mood: 'Imp', VerbForm: 'Fin' }, 'põe'],
        [{ Number: 'Sing', Person: 3, Mood: 'Imp', VerbForm: 'Fin' }, 'ponha'],
        [{ Number: 'Plur', Person: 1, Mood: 'Imp', VerbForm: 'Fin' }, 'ponhamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Imp', VerbForm: 'Fin' }, 'ponde'],
        [{ Number: 'Plur', Person: 3, Mood: 'Imp', VerbForm: 'Fin' }, 'ponham'],
        [{ Number: 'Sing', Person: 1, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'ponha'],
        [{ Number: 'Sing', Person: 2, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'ponhas'],
        [{ Number: 'Sing', Person: 3, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'ponha'],
        [{ Number: 'Plur', Person: 1, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'ponhamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'ponhais'],
        [{ Number: 'Plur', Person: 3, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'ponham']
      ])
    },

    V_TER: {
      id: 'V_TER',
      pos: 'VERB',
      strip: '',
      fullForm: true,
      cells: fullForms([
        [{ VerbForm: 'Inf' }, 'ter'],
        [{ VerbForm: 'Ger' }, 'tendo'],
        [{ Gender: 'Masc', Number: 'Sing', VerbForm: 'Part' }, 'tido'],
        [{ Gender: 'Fem', Number: 'Sing', VerbForm: 'Part' }, 'tida'],
        [{ Gender: 'Masc', Number: 'Plur', VerbForm: 'Part' }, 'tidos'],
        [{ Gender: 'Fem', Number: 'Plur', VerbForm: 'Part' }, 'tidas'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'tenho'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'tens'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'tem'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'temos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'tendes'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'têm'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'tive'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'tiveste'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'teve'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'tivemos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'tivestes'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'tiveram'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'tinha'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'tinhas'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'tinha'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'tínhamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'tínheis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'tinham'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'terei'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'terás'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'terá'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'teremos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'tereis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'terão'],
        [{ Number: 'Sing', Person: 1, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'teria'],
        [{ Number: 'Sing', Person: 2, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'terias'],
        [{ Number: 'Sing', Person: 3, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'teria'],
        [{ Number: 'Plur', Person: 1, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'teríamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'teríeis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'teriam'],
        [{ Number: 'Sing', Person: 2, Mood: 'Imp', VerbForm: 'Fin' }, 'tem'],
        [{ Number: 'Sing', Person: 3, Mood: 'Imp', VerbForm: 'Fin' }, 'tenha'],
        [{ Number: 'Plur', Person: 1, Mood: 'Imp', VerbForm: 'Fin' }, 'tenhamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Imp', VerbForm: 'Fin' }, 'tende'],
        [{ Number: 'Plur', Person: 3, Mood: 'Imp', VerbForm: 'Fin' }, 'tenham'],
        [{ Number: 'Sing', Person: 1, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'tenha'],
        [{ Number: 'Sing', Person: 2, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'tenhas'],
        [{ Number: 'Sing', Person: 3, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'tenha'],
        [{ Number: 'Plur', Person: 1, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'tenhamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'tenhais'],
        [{ Number: 'Plur', Person: 3, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'tenham']
      ])
    },

    V_ESTAR: {
      id: 'V_ESTAR',
      pos: 'VERB',
      strip: '',
      fullForm: true,
      cells: fullForms([
        [{ VerbForm: 'Inf' }, 'estar'],
        [{ VerbForm: 'Ger' }, 'estando'],
        [{ Gender: 'Masc', Number: 'Sing', VerbForm: 'Part' }, 'estado'],
        [{ Gender: 'Fem', Number: 'Sing', VerbForm: 'Part' }, 'estada'],
        [{ Gender: 'Masc', Number: 'Plur', VerbForm: 'Part' }, 'estados'],
        [{ Gender: 'Fem', Number: 'Plur', VerbForm: 'Part' }, 'estadas'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'estou'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'estás'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'está'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'estamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'estais'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'estão'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'estive'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'estiveste'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'esteve'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'estivemos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'estivestes'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'estiveram'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'estava'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'estavas'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'estava'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'estávamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'estáveis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'estavam'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'estarei'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'estarás'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'estará'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'estaremos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'estareis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'estarão'],
        [{ Number: 'Sing', Person: 1, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'estaria'],
        [{ Number: 'Sing', Person: 2, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'estarias'],
        [{ Number: 'Sing', Person: 3, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'estaria'],
        [{ Number: 'Plur', Person: 1, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'estaríamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'estaríeis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'estariam'],
        [{ Number: 'Sing', Person: 2, Mood: 'Imp', VerbForm: 'Fin' }, 'está'],
        [{ Number: 'Sing', Person: 3, Mood: 'Imp', VerbForm: 'Fin' }, 'esteja'],
        [{ Number: 'Plur', Person: 1, Mood: 'Imp', VerbForm: 'Fin' }, 'estejamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Imp', VerbForm: 'Fin' }, 'estai'],
        [{ Number: 'Plur', Person: 3, Mood: 'Imp', VerbForm: 'Fin' }, 'estejam'],
        [{ Number: 'Sing', Person: 1, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'esteja'],
        [{ Number: 'Sing', Person: 2, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'estejas'],
        [{ Number: 'Sing', Person: 3, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'esteja'],
        [{ Number: 'Plur', Person: 1, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'estejamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'estejais'],
        [{ Number: 'Plur', Person: 3, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'estejam']
      ])
    },

    V_SER: {
      id: 'V_SER',
      pos: 'VERB',
      strip: '',
      fullForm: true,
      cells: fullForms([
        [{ VerbForm: 'Inf' }, 'ser'],
        [{ VerbForm: 'Ger' }, 'sendo'],
        [{ Gender: 'Masc', Number: 'Sing', VerbForm: 'Part' }, 'sido'],
        [{ Gender: 'Fem', Number: 'Sing', VerbForm: 'Part' }, 'sida'],
        [{ Gender: 'Masc', Number: 'Plur', VerbForm: 'Part' }, 'sidos'],
        [{ Gender: 'Fem', Number: 'Plur', VerbForm: 'Part' }, 'sidas'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'sou'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'és'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'é'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'somos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'sois'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'são'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'fui'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'foste'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'foi'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'fomos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'fostes'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'foram'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'era'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'eras'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'era'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'éramos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'éreis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'eram'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'serei'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'serás'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'será'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'seremos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'sereis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'serão'],
        [{ Number: 'Sing', Person: 1, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'seria'],
        [{ Number: 'Sing', Person: 2, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'serias'],
        [{ Number: 'Sing', Person: 3, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'seria'],
        [{ Number: 'Plur', Person: 1, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'seríamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'seríeis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'seriam'],
        [{ Number: 'Sing', Person: 2, Mood: 'Imp', VerbForm: 'Fin' }, 'sê'],
        [{ Number: 'Sing', Person: 3, Mood: 'Imp', VerbForm: 'Fin' }, 'seja'],
        [{ Number: 'Plur', Person: 1, Mood: 'Imp', VerbForm: 'Fin' }, 'sejamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Imp', VerbForm: 'Fin' }, 'sede'],
        [{ Number: 'Plur', Person: 3, Mood: 'Imp', VerbForm: 'Fin' }, 'sejam'],
        [{ Number: 'Sing', Person: 1, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'seja'],
        [{ Number: 'Sing', Person: 2, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'sejas'],
        [{ Number: 'Sing', Person: 3, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'seja'],
        [{ Number: 'Plur', Person: 1, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'sejamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'sejais'],
        [{ Number: 'Plur', Person: 3, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'sejam']
      ])
    },

    V_PODER: {
      id: 'V_PODER',
      pos: 'VERB',
      strip: '',
      fullForm: true,
      cells: fullForms([
        [{ VerbForm: 'Inf' }, 'poder'],
        [{ VerbForm: 'Ger' }, 'podendo'],
        [{ Gender: 'Masc', Number: 'Sing', VerbForm: 'Part' }, 'podido'],
        [{ Gender: 'Fem', Number: 'Sing', VerbForm: 'Part' }, 'podida'],
        [{ Gender: 'Masc', Number: 'Plur', VerbForm: 'Part' }, 'podidos'],
        [{ Gender: 'Fem', Number: 'Plur', VerbForm: 'Part' }, 'podidas'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'posso'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'podes'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'pode'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'podemos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'podeis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'podem'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'pude'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'pudeste'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'pôde'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'pudemos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'pudestes'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'puderam'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'podia'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'podias'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'podia'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'podíamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'podíeis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'podiam'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'poderei'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'poderás'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'poderá'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'poderemos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'podereis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'poderão'],
        [{ Number: 'Sing', Person: 1, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'poderia'],
        [{ Number: 'Sing', Person: 2, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'poderias'],
        [{ Number: 'Sing', Person: 3, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'poderia'],
        [{ Number: 'Plur', Person: 1, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'poderíamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'poderíeis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'poderiam'],
        [{ Number: 'Sing', Person: 1, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'possa'],
        [{ Number: 'Sing', Person: 2, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'possas'],
        [{ Number: 'Sing', Person: 3, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'possa'],
        [{ Number: 'Plur', Person: 1, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'possamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'possais'],
        [{ Number: 'Plur', Person: 3, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'possam']
      ])
    },

    V_QUERER: {
      id: 'V_QUERER',
      pos: 'VERB',
      strip: '',
      fullForm: true,
      cells: fullForms([
        [{ VerbForm: 'Inf' }, 'querer'],
        [{ VerbForm: 'Ger' }, 'querendo'],
        [{ Gender: 'Masc', Number: 'Sing', VerbForm: 'Part' }, 'querido'],
        [{ Gender: 'Fem', Number: 'Sing', VerbForm: 'Part' }, 'querida'],
        [{ Gender: 'Masc', Number: 'Plur', VerbForm: 'Part' }, 'queridos'],
        [{ Gender: 'Fem', Number: 'Plur', VerbForm: 'Part' }, 'queridas'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'quero'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'queres'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'quer'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'queremos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'quereis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'querem'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'quis'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'quiseste'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'quis'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'quisemos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'quisestes'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'quiseram'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'queria'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'querias'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'queria'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'queríamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'queríeis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'queriam'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'quererei'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'quererás'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'quererá'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'quereremos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'querereis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'quererão'],
        [{ Number: 'Sing', Person: 1, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'quereria'],
        [{ Number: 'Sing', Person: 2, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'quererias'],
        [{ Number: 'Sing', Person: 3, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'quereria'],
        [{ Number: 'Plur', Person: 1, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'quereríamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'quereríeis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'quereriam'],
        [{ Number: 'Sing', Person: 2, Mood: 'Imp', VerbForm: 'Fin' }, 'quere'],
        [{ Number: 'Sing', Person: 3, Mood: 'Imp', VerbForm: 'Fin' }, 'queira'],
        [{ Number: 'Plur', Person: 1, Mood: 'Imp', VerbForm: 'Fin' }, 'queiramos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Imp', VerbForm: 'Fin' }, 'querei'],
        [{ Number: 'Plur', Person: 3, Mood: 'Imp', VerbForm: 'Fin' }, 'queiram'],
        [{ Number: 'Sing', Person: 1, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'queira'],
        [{ Number: 'Sing', Person: 2, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'queiras'],
        [{ Number: 'Sing', Person: 3, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'queira'],
        [{ Number: 'Plur', Person: 1, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'queiramos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'queirais'],
        [{ Number: 'Plur', Person: 3, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'queiram']
      ])
    },

    V_TRAZER: {
      id: 'V_TRAZER',
      pos: 'VERB',
      strip: '',
      fullForm: true,
      cells: fullForms([
        [{ VerbForm: 'Inf' }, 'trazer'],
        [{ VerbForm: 'Ger' }, 'trazendo'],
        [{ Gender: 'Masc', Number: 'Sing', VerbForm: 'Part' }, 'trazido'],
        [{ Gender: 'Fem', Number: 'Sing', VerbForm: 'Part' }, 'trazida'],
        [{ Gender: 'Masc', Number: 'Plur', VerbForm: 'Part' }, 'trazidos'],
        [{ Gender: 'Fem', Number: 'Plur', VerbForm: 'Part' }, 'trazidas'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'trago'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'trazes'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'traz'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'trazemos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'trazeis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'trazem'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'trouxe'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'trouxeste'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'trouxe'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'trouxemos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'trouxestes'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'trouxeram'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'trazia'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'trazias'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'trazia'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'trazíamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'trazíeis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'traziam'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'trarei'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'trarás'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'trará'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'traremos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'trareis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'trarão'],
        [{ Number: 'Sing', Person: 1, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'traria'],
        [{ Number: 'Sing', Person: 2, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'trarias'],
        [{ Number: 'Sing', Person: 3, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'traria'],
        [{ Number: 'Plur', Person: 1, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'traríamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'traríeis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'trariam'],
        [{ Number: 'Sing', Person: 2, Mood: 'Imp', VerbForm: 'Fin' }, 'traze'],
        [{ Number: 'Sing', Person: 3, Mood: 'Imp', VerbForm: 'Fin' }, 'traga'],
        [{ Number: 'Plur', Person: 1, Mood: 'Imp', VerbForm: 'Fin' }, 'tragamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Imp', VerbForm: 'Fin' }, 'trazei'],
        [{ Number: 'Plur', Person: 3, Mood: 'Imp', VerbForm: 'Fin' }, 'tragam'],
        [{ Number: 'Sing', Person: 1, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'traga'],
        [{ Number: 'Sing', Person: 2, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'tragas'],
        [{ Number: 'Sing', Person: 3, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'traga'],
        [{ Number: 'Plur', Person: 1, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'tragamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'tragais'],
        [{ Number: 'Plur', Person: 3, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'tragam']
      ])
    },

    V_IR_VERB: {
      id: 'V_IR_VERB',
      pos: 'VERB',
      strip: '',
      fullForm: true,
      cells: fullForms([
        [{ VerbForm: 'Inf' }, 'ir'],
        [{ VerbForm: 'Ger' }, 'indo'],
        [{ Gender: 'Masc', Number: 'Sing', VerbForm: 'Part' }, 'ido'],
        [{ Gender: 'Fem', Number: 'Sing', VerbForm: 'Part' }, 'ida'],
        [{ Gender: 'Masc', Number: 'Plur', VerbForm: 'Part' }, 'idos'],
        [{ Gender: 'Fem', Number: 'Plur', VerbForm: 'Part' }, 'idas'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'vou'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'vais'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'vai'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'vamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'ides'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Pres' }, 'vão'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'fui'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'foste'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'foi'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'fomos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'fostes'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Past' }, 'foram'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'ia'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'ias'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'ia'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'íamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'íeis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Imp' }, 'iam'],
        [{ Number: 'Sing', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'irei'],
        [{ Number: 'Sing', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'irás'],
        [{ Number: 'Sing', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'irá'],
        [{ Number: 'Plur', Person: 1, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'iremos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'ireis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Ind', VerbForm: 'Fin', Tense: 'Fut' }, 'irão'],
        [{ Number: 'Sing', Person: 1, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'iria'],
        [{ Number: 'Sing', Person: 2, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'irias'],
        [{ Number: 'Sing', Person: 3, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'iria'],
        [{ Number: 'Plur', Person: 1, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'iríamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'iríeis'],
        [{ Number: 'Plur', Person: 3, Mood: 'Cnd', VerbForm: 'Fin', Tense: 'Fut' }, 'iriam'],
        [{ Number: 'Sing', Person: 2, Mood: 'Imp', VerbForm: 'Fin' }, 'vai'],
        [{ Number: 'Sing', Person: 3, Mood: 'Imp', VerbForm: 'Fin' }, 'vá'],
        [{ Number: 'Plur', Person: 1, Mood: 'Imp', VerbForm: 'Fin' }, 'vamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Imp', VerbForm: 'Fin' }, 'ide'],
        [{ Number: 'Plur', Person: 3, Mood: 'Imp', VerbForm: 'Fin' }, 'vão'],
        [{ Number: 'Sing', Person: 1, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'vá'],
        [{ Number: 'Sing', Person: 2, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'vás'],
        [{ Number: 'Sing', Person: 3, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'vá'],
        [{ Number: 'Plur', Person: 1, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'vamos'],
        [{ Number: 'Plur', Person: 2, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'vades'],
        [{ Number: 'Plur', Person: 3, Mood: 'Sub', VerbForm: 'Fin', Tense: 'Pres' }, 'vão']
      ])
    },

    // --- Substantivos --------------------------------------------------------
    N_S: {
      id: 'N_S',
      pos: 'NOUN',
      strip: '',
      cells: [cell({ Number: 'Sing' }, ''), cell({ Number: 'Plur' }, 's')]
    },
    N_AO_OES: {
      id: 'N_AO_OES',
      pos: 'NOUN',
      strip: 'ão',
      cells: [cell({ Number: 'Sing' }, 'ão'), cell({ Number: 'Plur' }, 'ões')]
    },
    N_AO_AES: {
      id: 'N_AO_AES',
      pos: 'NOUN',
      strip: 'ão',
      cells: [cell({ Number: 'Sing' }, 'ão'), cell({ Number: 'Plur' }, 'ães')]
    },
    N_AO_AOS: {
      id: 'N_AO_AOS',
      pos: 'NOUN',
      strip: 'ão',
      cells: [cell({ Number: 'Sing' }, 'ão'), cell({ Number: 'Plur' }, 'ãos')]
    },
    N_L_IS: {
      id: 'N_L_IS',
      pos: 'NOUN',
      strip: 'l',
      cells: [cell({ Number: 'Sing' }, 'l'), cell({ Number: 'Plur' }, 'is')]
    },
    N_R_Z_ES: {
      id: 'N_R_Z_ES',
      pos: 'NOUN',
      strip: '',
      cells: [cell({ Number: 'Sing' }, ''), cell({ Number: 'Plur' }, 'es')]
    },
    N_INVARIANT: {
      id: 'N_INVARIANT',
      pos: 'NOUN',
      strip: '',
      cells: [cell({ Number: 'Sing' }, ''), cell({ Number: 'Plur' }, '')]
    },

    // --- Adjetivos -------------------------------------------------------------
    ADJ_O: {
      id: 'ADJ_O',
      pos: 'ADJECTIVE',
      strip: 'o',
      cells: [
        cell({ Gender: 'Masc', Number: 'Sing' }, 'o'),
        cell({ Gender: 'Fem', Number: 'Sing' }, 'a'),
        cell({ Gender: 'Masc', Number: 'Plur' }, 'os'),
        cell({ Gender: 'Fem', Number: 'Plur' }, 'as')
      ]
    },
    /** Uniforme em gênero com -l → -is (azul/azuis). */
    ADJ_L: {
      id: 'ADJ_L',
      pos: 'ADJECTIVE',
      strip: 'l',
      cells: [cell({ Number: 'Sing' }, 'l'), cell({ Number: 'Plur' }, 'is')]
    },
    // --- Determinantes e pronomes (classes fechadas, mesmas regras) ------------
    /** -e/-a/-es/-as: esse, este, aquele, ele. */
    DET_E: {
      id: 'DET_E',
      pos: 'DETERMINER',
      strip: 'e',
      cells: [
        cell({ Gender: 'Masc', Number: 'Sing' }, 'e'),
        cell({ Gender: 'Fem', Number: 'Sing' }, 'a'),
        cell({ Gender: 'Masc', Number: 'Plur' }, 'es'),
        cell({ Gender: 'Fem', Number: 'Plur' }, 'as')
      ]
    },
    /** -um/-uma/-uns/-umas: um, algum. */
    DET_UM: {
      id: 'DET_UM',
      pos: 'DETERMINER',
      strip: 'um',
      cells: [
        cell({ Gender: 'Masc', Number: 'Sing' }, 'um'),
        cell({ Gender: 'Fem', Number: 'Sing' }, 'uma'),
        cell({ Gender: 'Masc', Number: 'Plur' }, 'uns'),
        cell({ Gender: 'Fem', Number: 'Plur' }, 'umas')
      ]
    },

    // Uniforme em gênero, variável em número: "verde/verdes".
    ADJ_UNIFORM: {
      id: 'ADJ_UNIFORM',
      pos: 'ADJECTIVE',
      strip: '',
      cells: [cell({ Number: 'Sing' }, ''), cell({ Number: 'Plur' }, 's')]
    },
    ADJ_INVARIANT: {
      id: 'ADJ_INVARIANT',
      pos: 'ADJECTIVE',
      strip: '',
      // Cores-substantivo ("cinza", "rosa", "laranja") são invariáveis na
      // norma ("textos cinza"); a forma com -s é aceita como variante.
      cells: [cell({ Number: 'Inv' }, ''), cell({ Number: 'Plur' }, 's')]
    }
  };
}

/** Paradigmas do domínio (construídos uma única vez na carga do módulo). */
export const PARADIGMS: Record<ParadigmId, Paradigm> = buildParadigms();

// ---------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------

function applyOrthography(stem: string, suffix: string, rules?: OrthographyRule[]): string {
  if (!rules?.length || !/^[ei]/.test(suffix)) return stem + suffix;
  let adjusted = stem;
  for (const rule of rules) {
    if (rule === 'C_TO_QU' && /c$/.test(adjusted)) adjusted = adjusted.slice(0, -1) + 'qu';
    else if (rule === 'G_TO_GU' && /g$/.test(adjusted)) adjusted = adjusted.slice(0, -1) + 'gu';
    else if (rule === 'CEDILLA_TO_C' && /ç$/.test(adjusted)) adjusted = adjusted.slice(0, -1) + 'c';
  }
  return adjusted + suffix;
}

/**
 * Gera as formas de um lexema pelo seu paradigma.
 *
 * `options.inherent` injeta traços do lexema nas células que não os trazem
 * (gênero do substantivo); `options.irregular` sobrepõe células inteiras pelo
 * FeatureKey; `options.disabledForms` desativa células.
 */
export function generateForms(
  lexemeId: LexemeId,
  lemma: string,
  paradigm: Paradigm,
  options?: {
    inherent?: FeatureBundle;
    irregular?: Record<FeatureKey, string | string[]>;
    disabledForms?: FeatureKey[];
  }
): GeneratedForm[] {
  const stem = paradigm.fullForm
    ? ''
    : paradigm.strip && lemma.endsWith(paradigm.strip)
      ? lemma.slice(0, lemma.length - paradigm.strip.length)
      : lemma;

  const forms: GeneratedForm[] = [];
  const disabled = new Set(options?.disabledForms ?? []);

  for (const c of paradigm.cells) {
    const feats: FeatureBundle = { ...options?.inherent, ...c.feats };
    const key = featureKey(feats);
    if (disabled.has(key)) continue;

    const override = options?.irregular?.[key];
    const surfaces = override === undefined ? [applyOrthography(stem, c.suffix, paradigm.orthography)] : override;
    for (const surface of Array.isArray(surfaces) ? surfaces : [surfaces]) {
      forms.push({
        surface,
        featureKey: key,
        feats,
        morphology: featuresToMorphology(feats),
        formType: surface === lemma ? 'CANONICAL' : 'INFLECTION'
      });
    }
  }

  void lexemeId;
  return forms;
}

// ---------------------------------------------------------------------------
// Derivação (diminutivo)
// ---------------------------------------------------------------------------

/**
 * Diminutivos produtivos (Degree=Dim), sempre do MESMO lexema base:
 *   -ão  → botão + zinho   / botõe + zinhos
 *   vogal final → caix(a) + inha / pret(o) + inho (+ s no plural)
 */
export function generateDiminutives(
  lemma: string,
  gender: 'Masc' | 'Fem',
  number: 'Sing' | 'Plur'
): GeneratedForm[] {
  const suffix = gender === 'Masc' ? 'inho' : 'inha';
  const plural = number === 'Plur';
  let surface: string;

  if (/ão$/.test(lemma)) {
    surface = plural
      ? lemma.replace(/ão$/, 'õe') + (gender === 'Masc' ? 'zinhos' : 'zinhas')
      : lemma + (gender === 'Masc' ? 'zinho' : 'zinha');
  } else {
    const base = lemma.replace(/[aeo]$/, '');
    surface = base + (plural ? `${suffix}s` : suffix);
  }

  const feats: FeatureBundle = {
    Gender: gender,
    Number: plural ? 'Plur' : 'Sing',
    Degree: 'Dim'
  };
  return [
    {
      surface,
      featureKey: featureKey(feats),
      feats,
      morphology: featuresToMorphology(feats),
      formType: 'INFLECTION'
    }
  ];
}
