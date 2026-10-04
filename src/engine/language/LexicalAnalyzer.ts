import guessData from '../../knowledge/language/guess-rules.json';
import contractionsData from '../../knowledge/language/contractions.json';
import seedData from '../../knowledge/morphology/seed-roots.json';
import supplementData from '../../knowledge/language/lexical-supplements.json';
import copulaData from '../../knowledge/language/copulas.json';
import { createDerivationalAnalyzer } from '../../knowledge/morphology';
import type { Lexeme } from '../types';
import type { TeachableRoot } from '../../knowledge/language/teachableRoot';
import { LanguageInflector, LANGUAGE_PARADIGMS } from './LanguageInflector';
import { closedClassReadings } from './ClosedClassLexicon';
import { tokenizeSentence, type LanguageWord, type MultiwordToken } from './Tokenizer';

export type ReadingOrigin = 'CLOSED_CLASS' | 'INFLECTION' | 'DERIVATION' | 'GUESS';

export interface LexicalReading {
  lemma: string;
  upos: string;
  feats: Record<string, string>;
  origin: ReadingOrigin;
  rule: string;
  status?: 'HYPOTHESIS';
}

export interface AnalyzedWord extends LanguageWord {
  readings: LexicalReading[];
}

export interface LexicalAnalysis {
  words: AnalyzedWord[];
  multiwords: MultiwordToken[];
}

const seeds = [...(seedData as { entries: Array<{ lemma: string; gender?: string }> }).entries,
  ...(supplementData as { entries: Array<{ lemma: string; gender?: string }> }).entries];
const genderByLemma = new Map(seeds.filter((entry) => entry.gender).map((entry) => [entry.lemma, entry.gender!]));
const guessRules = (guessData as unknown as { rules: Array<{ id: string; suffix: string; paradigm?: string; upos: string; feats: Record<string, string> }> }).rules;
const contractions = new Map((contractionsData as { entries: Array<{ form: string; parts: string[] }> }).entries.map((entry) => [entry.form, entry.parts] as const));
const copulaClass = copulaData as { id: string; lemmas: string[]; upos: string };

const uposByProjectPos: Record<string, string> = {
  ADJECTIVE: 'ADJ', ADVERB: 'ADV', CONJUNCTION: 'CCONJ', DETERMINER: 'DET',
  NOUN: 'NOUN', NUMERAL: 'NUM', PREPOSITION: 'ADP', PRONOUN: 'PRON', VERB: 'VERB'
};

function posToUpos(pos: string): string {
  return uposByProjectPos[pos] ?? pos;
}

function features(key: string): Record<string, string> {
  return Object.fromEntries(key.split('|').filter(Boolean).map((part) => part.split('=')));
}

export class LexicalAnalyzer {
  private inflector: LanguageInflector;
  private derivations;

  constructor(domainLexemes: Record<string, Lexeme> = {}, languageRoots: TeachableRoot[] = []) {
    this.inflector = new LanguageInflector(domainLexemes, languageRoots);
    this.derivations = createDerivationalAnalyzer(domainLexemes, languageRoots);
  }

  analyzeSurface(form: string): LexicalReading[] {
    const closed = closedClassReadings(form);
    if (form.includes(' ') && closed.length) {
      return closed.map((entry) => ({ lemma: entry.lemma, upos: entry.upos, feats: entry.feats, origin: 'CLOSED_CLASS', rule: `CLOSED_CLASS:${entry.form}` }));
    }
    if (form.includes(' ') && !closed.length && /^\p{Lu}/u.test(form)) {
      return [{ lemma: form, upos: 'NOUN', feats: {}, origin: 'GUESS', rule: 'GUESS_MULTIWORD_NAME' },
        { lemma: form, upos: 'PROPN', feats: {}, origin: 'GUESS', rule: 'GUESS_MULTIWORD_NAME' }];
    }
    const parts = contractions.get(form.normalize('NFC').toLocaleLowerCase('pt-BR'));
    if (parts) {
      const partReadings = parts.map((part, index) => {
        const readings = closedClassReadings(part);
        return index === 0
          ? (readings.find((reading) => reading.upos === 'ADP') ?? readings[0])
          : (readings.find((reading) => reading.upos === 'DET') ?? readings[0]);
      });
      if (partReadings.every(Boolean)) {
        return [{
          lemma: partReadings.map((reading) => reading.lemma).join('+'),
          upos: partReadings[0].upos,
          feats: { ...partReadings[partReadings.length - 1].feats },
          origin: 'CLOSED_CLASS',
          rule: `CONTRACTION:${form}`
        }];
      }
    }
    const readings = this.analyze(form).words[0]?.readings ?? [];
    if (/^\p{Lu}\p{L}+$/u.test(form) && !readings.some((reading) => reading.upos === 'PROPN')) {
      return [...readings, { lemma: form, upos: 'PROPN', feats: {}, origin: 'GUESS', rule: 'GUESS_CAPITALIZED_NAME' }];
    }
    return readings;
  }

  analyze(text: string): LexicalAnalysis {
    const tokenization = tokenizeSentence(text);
    const words = tokenization.words.map((word): AnalyzedWord => {
      const readings: LexicalReading[] = [];
      for (const entry of closedClassReadings(word.form)) {
        readings.push({ lemma: entry.lemma, upos: entry.upos, feats: entry.feats, origin: 'CLOSED_CLASS', rule: `CLOSED_CLASS:${entry.form}` });
      }
      for (const entry of this.inflector.lemmatize(word.form)) {
        const feats = features(entry.features);
        const gender = genderByLemma.get(entry.lemma);
        if (gender && !feats.Gender) feats.Gender = gender;
        readings.push({ lemma: entry.lemma, upos: posToUpos(entry.pos), feats, origin: 'INFLECTION', rule: entry.rule });
        if (entry.pos === 'VERB' && copulaClass.lemmas.includes(entry.lemma)) {
          readings.push({ lemma: entry.lemma, upos: copulaClass.upos, feats, origin: 'INFLECTION', rule: copulaClass.id });
        }
      }
      if (!readings.length && /\p{L}/u.test(word.form)) {
        for (const entry of this.derivations.analyze(word.form)) {
          if (entry.status === 'HYPOTHESIS_BLOCKED') continue;
          readings.push({
            lemma: entry.word, upos: posToUpos(entry.pos),
            feats: entry.inflection ? features(entry.inflection) : {},
            origin: 'DERIVATION', rule: entry.chain.map((step) => step.rule).join('+'), status: 'HYPOTHESIS'
          });
        }
      }
      if (!readings.length) {
        const normalized = word.form.normalize('NFC').toLocaleLowerCase('pt-BR');
        const guesses = guessRules.filter((rule) => normalized.endsWith(rule.suffix));
        for (const guess of guesses) {
          const paradigm = guess.paradigm ? LANGUAGE_PARADIGMS[guess.paradigm] : undefined;
          const lemma = paradigm?.strip ? normalized.slice(0, -guess.suffix.length) + paradigm.strip : normalized;
          readings.push({ lemma, upos: guess.upos, feats: guess.feats, origin: 'GUESS', rule: guess.id });
        }
        if (!guesses.length) readings.push({ lemma: normalized, upos: /\p{L}/u.test(normalized) ? 'NOUN' : 'PUNCT', feats: {}, origin: 'GUESS', rule: 'GUESS_DEFAULT' });
      }
      return { ...word, readings };
    });
    return { words, multiwords: tokenization.multiwords };
  }
}
