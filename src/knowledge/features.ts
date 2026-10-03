/**
 * Modelo de traços morfológicos (F2.1).
 *
 * Os nomes seguem o Universal Dependencies (Gender, Number, Person, Mood,
 * VerbForm, Tense, Degree). A chave canônica é a forma ordenada dos traços,
 * com a ordem fixa: Gender, Number, Person, Mood, VerbForm, Tense, Degree.
 *
 * A chave canônica é o identificador de célula do paradigma e do
 * `FeatureKey` das SurfaceForms geradas (`${lexemeId}#${FeatureKey}`).
 */
import type { Morphology } from '../engine/types';

export interface FeatureBundle {
  Gender?: 'Masc' | 'Fem' | 'Neut' | 'Inv';
  Number?: 'Sing' | 'Plur' | 'Inv';
  Person?: 1 | 2 | 3;
  Mood?: 'Ind' | 'Sub' | 'Imp' | 'Cnd';
  VerbForm?: 'Fin' | 'Inf' | 'Ger' | 'Part';
  Tense?: 'Pres' | 'Past' | 'Imp' | 'Fut';
  Degree?: 'Dim';
}

export type FeatureKey = string;

/** Ordem canônica dos traços na chave. */
const FEATURE_ORDER: Array<keyof FeatureBundle> = [
  'Gender',
  'Number',
  'Person',
  'Mood',
  'VerbForm',
  'Tense',
  'Degree'
];

export function featureKey(features: FeatureBundle): FeatureKey {
  const parts: string[] = [];
  for (const name of FEATURE_ORDER) {
    const value = features[name];
    if (value !== undefined) parts.push(`${name}=${value}`);
  }
  return parts.join('|');
}

export function parseFeatureKey(key: FeatureKey): FeatureBundle {
  const bundle: FeatureBundle = {};
  if (!key) return bundle;
  for (const part of key.split('|')) {
    const [name, value] = part.split('=') as [keyof FeatureBundle, string];
    if (!name || value === undefined) continue;
    if (name === 'Person') {
      const n = Number(value);
      if (n === 1 || n === 2 || n === 3) bundle.Person = n;
    } else {
      (bundle as Record<string, string>)[name] = value;
    }
  }
  return bundle;
}

const GENDER: Record<NonNullable<FeatureBundle['Gender']>, Morphology['gender']> = {
  Masc: 'MASC',
  Fem: 'FEM',
  Neut: 'NEUTER',
  Inv: 'INVARIANT'
};

const NUMBER: Record<NonNullable<FeatureBundle['Number']>, Morphology['number']> = {
  Sing: 'SINGULAR',
  Plur: 'PLURAL',
  Inv: 'INVARIANT'
};

const MOOD: Record<NonNullable<FeatureBundle['Mood']>, Morphology['mood']> = {
  Ind: 'INDICATIVE',
  Sub: 'SUBJUNCTIVE',
  Imp: 'IMPERATIVE',
  Cnd: 'CONDITIONAL'
};

const VERB_FORM_MOOD: Partial<Record<NonNullable<FeatureBundle['VerbForm']>, Morphology['mood']>> = {
  Inf: 'INFINITIVE',
  Ger: 'GERUND',
  Part: 'PARTICIPLE'
};

const TENSE: Record<NonNullable<FeatureBundle['Tense']>, Morphology['tense']> = {
  Pres: 'PRESENT',
  Past: 'PAST',
  Imp: 'IMPERFECT',
  Fut: 'FUTURE'
};

/** Converte o feixe canônico para a `Morphology` usada pelo motor. */
export function featuresToMorphology(features: FeatureBundle): Morphology {
  const morphology: Morphology = {};
  if (features.Gender) morphology.gender = GENDER[features.Gender];
  if (features.Number) morphology.number = NUMBER[features.Number];
  if (features.Person) morphology.person = features.Person;
  if (features.Mood) morphology.mood = MOOD[features.Mood];
  else if (features.VerbForm && VERB_FORM_MOOD[features.VerbForm]) {
    morphology.mood = VERB_FORM_MOOD[features.VerbForm];
  }
  if (features.Tense) morphology.tense = TENSE[features.Tense];
  if (features.Degree === 'Dim') morphology.degree = 'DIMINUTIVE';
  return morphology;
}
