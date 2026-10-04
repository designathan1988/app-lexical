import proposedData from '../../knowledge/language/inflection-paradigms.json';
import irregularData from '../../knowledge/language/irregular-verbs.json';
import seedData from '../../knowledge/morphology/seed-roots.json';
import supplementData from '../../knowledge/language/lexical-supplements.json';
import futureSubjunctiveData from '../../knowledge/language/future-subjunctive.json';
import guessData from '../../knowledge/language/guess-rules.json';
import { PARADIGMS, generateForms, type Paradigm, type ParadigmId } from '../../knowledge/paradigms';
import { parseFeatureKey, type FeatureBundle } from '../../knowledge/features';
import type { Lexeme } from '../types';
import type { TeachableRoot } from '../../knowledge/language/teachableRoot';

export interface InflectionReading {
  lemma: string;
  pos: string;
  features: string;
  paradigm: string;
  rule: string;
}

type Seed = { lemma: string; pos: string; gender?: string; inflection?: { paradigmId?: string } };
type Irregular = { id: string; lemma: string; forms: Record<string, string> };
type Supplement = { id: string; lemma: string; variants: Record<string, string[]> };

const proposals = (proposedData as unknown as { paradigms: Paradigm[] }).paradigms;
const irregular = (irregularData as { verbs: Irregular[]; supplementaryParticiples: Supplement[] });
const seeds = (seedData as { entries: Seed[] }).entries;
const lexicalSupplements = (supplementData as { entries: Array<Seed & { paradigmId: string }> }).entries;
const futureSubjunctive = (futureSubjunctiveData as { rules: Array<{ paradigm: string; suffixes: string[] }> }).rules;
const infinitiveEndings = (guessData as unknown as { rules: Array<{ suffix: string; upos: string; feats: { VerbForm?: string } }> }).rules
  .filter((rule) => rule.upos === 'VERB' && rule.feats.VerbForm === 'Inf');
const persons: Array<[1 | 2 | 3, 'Sing' | 'Plur']> = [[1, 'Sing'], [2, 'Sing'], [3, 'Sing'], [1, 'Plur'], [2, 'Plur'], [3, 'Plur']];
const extendedRegularParadigms = Object.fromEntries(futureSubjunctive.flatMap((rule) => Object.values(PARADIGMS)
  .filter((paradigm) => paradigm.id === rule.paradigm || paradigm.id.startsWith(`${rule.paradigm}_`))
  .map((base) => [base.id, { ...base, cells: [...base.cells, ...rule.suffixes.map((suffix, index) => ({
    feats: { Number: persons[index][1], Person: persons[index][0], Mood: 'Sub' as const, VerbForm: 'Fin' as const, Tense: 'Fut' as const },
    suffix
  }))] } satisfies Paradigm])));

export const LANGUAGE_PARADIGMS: Record<ParadigmId, Paradigm> = {
  ...PARADIGMS,
  ...extendedRegularParadigms,
  ...Object.fromEntries(proposals.map((paradigm) => [paradigm.id, paradigm])),
  ...Object.fromEntries(irregular.verbs.map((verb) => [verb.id, {
    id: verb.id,
    pos: 'VERB',
    strip: '',
    fullForm: true,
    cells: Object.entries(verb.forms).map(([features, suffix]) => ({ feats: parseFeatureKey(features), suffix }))
  } satisfies Paradigm]))
};

function normalize(form: string): string {
  return form.normalize('NFC').toLocaleLowerCase('pt-BR');
}

export function suggestParadigm(lemma: string, pos: string): { id: string; rule: string } | undefined {
  const lower = normalize(lemma);
  const matching = proposals.filter((paradigm) => paradigm.pos === pos && paradigm.strip && lower.endsWith(paradigm.strip));
  const example = matching.find((paradigm) => (paradigm as Paradigm & { examples?: string[] }).examples?.includes(lower));
  if (example) return { id: example.id, rule: `EXAMPLE:${example.id}` };
  if (pos === 'VERB') {
    for (const rule of infinitiveEndings) {
      if (lower.endsWith(rule.suffix)) return { id: `V_${rule.suffix.toUpperCase()}`, rule: `ENDING:${rule.suffix}` };
    }
  }
  if (matching.length === 1) return { id: matching[0].id, rule: `ENDING:${matching[0].strip}` };
  if (pos === 'NOUN') return { id: 'N_S', rule: 'DEFAULT:NOUN' };
  if (pos === 'ADJECTIVE') return { id: 'ADJ_UNIFORM', rule: 'DEFAULT:ADJECTIVE' };
  return undefined;
}

export class LanguageInflector {
  readonly reverse = new Map<string, InflectionReading[]>();

  constructor(domainLexemes: Record<string, Lexeme> = {}, languageRoots: TeachableRoot[] = []) {
    const lemmas: Seed[] = [...seeds, ...lexicalSupplements.map((entry) => ({ ...entry, inflection: { paradigmId: entry.paradigmId } })), ...languageRoots.map((root) => ({ lemma: root.lemma, pos: root.pos, inflection: { paradigmId: root.paradigmId } })), ...Object.values(domainLexemes).map((lexeme) => ({
      lemma: lexeme.lemma,
      pos: lexeme.pos,
      inflection: lexeme.paradigmId ? { paradigmId: lexeme.paradigmId } : undefined
    }))];
    for (const paradigm of proposals) {
      for (const lemma of (paradigm as Paradigm & { examples?: string[] }).examples ?? []) {
        lemmas.push({ lemma, pos: paradigm.pos, inflection: { paradigmId: paradigm.id } });
      }
    }
    for (const verb of irregular.verbs) lemmas.push({ lemma: verb.lemma, pos: 'VERB', inflection: { paradigmId: verb.id } });
    const seen = new Set<string>();
    for (const entry of lemmas) {
      const id = entry.inflection?.paradigmId ?? suggestParadigm(entry.lemma, entry.pos)?.id;
      const paradigm = id ? LANGUAGE_PARADIGMS[id] : undefined;
      if (!paradigm) continue;
      const key = `${entry.lemma}|${paradigm.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const baseInfinitive = paradigm.fullForm
        ? paradigm.cells.find((cell) => cell.feats.VerbForm === 'Inf')?.suffix
        : undefined;
      const prefix = baseInfinitive && entry.lemma !== baseInfinitive && entry.lemma.endsWith(baseInfinitive)
        ? entry.lemma.slice(0, -baseInfinitive.length)
        : '';
      const forms = generateForms(key, entry.lemma, paradigm).map((form) => ({
        ...form,
        surface: prefix ? prefix + form.surface : form.surface
      }));
      const supplements = irregular.supplementaryParticiples.find((item) => item.lemma === entry.lemma);
      for (const form of forms) {
        this.add(form.surface, { lemma: entry.lemma, pos: entry.pos, features: form.featureKey, paradigm: paradigm.id, rule: `PARADIGM:${paradigm.id}` });
      }
      for (const [features, variants] of Object.entries(supplements?.variants ?? {})) {
        for (const variant of variants) this.add(variant, {
          lemma: entry.lemma, pos: entry.pos, features, paradigm: paradigm.id, rule: `PARTICIPLE:${paradigm.id}`
        });
      }
    }
  }

  private add(form: string, reading: InflectionReading): void {
    const key = normalize(form);
    const list = this.reverse.get(key) ?? [];
    if (!list.some((item) => item.lemma === reading.lemma && item.features === reading.features && item.pos === reading.pos)) {
      list.push(reading);
      this.reverse.set(key, list);
    }
  }

  inflect(lemma: string, paradigmId: string, features: string): string[] {
    const supplement = irregular.supplementaryParticiples.find((item) => item.id === paradigmId && item.lemma === lemma);
    const effectiveId = LANGUAGE_PARADIGMS[paradigmId] ? paradigmId : suggestParadigm(lemma, 'VERB')?.id;
    const paradigm = effectiveId ? LANGUAGE_PARADIGMS[effectiveId] : undefined;
    if (!paradigm) return [];
    const generated = generateForms(lemma, lemma, paradigm)
      .filter((form) => form.featureKey === features)
      .map((form) => form.surface);
    return [...new Set([...generated, ...(supplement?.variants[features] ?? [])])];
  }

  lemmatize(form: string): InflectionReading[] {
    return this.reverse.get(normalize(form)) ?? [];
  }
}
