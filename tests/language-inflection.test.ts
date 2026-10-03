import { describe, expect, it } from 'vitest';
import gold from '../research/morfologia/tests-inflection.json';
import sentences from '../research/morfologia/tests-sentences.json';
import { LanguageInflector } from '../src/engine/language/LanguageInflector';
import { LexicalAnalyzer } from '../src/engine/language/LexicalAnalyzer';

type InflectionCase = {
  id: string;
  op: string;
  lemma?: string;
  paradigm?: string;
  features?: string;
  form?: string;
  expected: { form?: string; lemma?: string; features?: string };
};

const cases = (gold as { tests: InflectionCase[] }).tests;

describe('flexão e índice inverso', () => {
  const inflector = new LanguageInflector();

  it('acerta os 258 casos de flexão do projeto', () => {
    let hits = 0;
    const failures: string[] = [];
    for (const item of cases) {
      const correct = item.op === 'inflect'
        ? inflector.inflect(item.lemma!, item.paradigm!, item.features!).includes(item.expected.form!)
        : inflector.lemmatize(item.form!).some((reading) =>
            reading.lemma === item.expected.lemma && reading.features === item.expected.features
          );
      if (correct) hits++;
      else failures.push(item.id);
    }
    console.info('Flexão', hits, '/', cases.length, 'falhas:', failures.join(', '));
    expect(cases.length).toBe(258);
    expect(failures).toEqual([]);
  });

  it('inclui a leitura correta entre as candidatas do gabarito', () => {
    const analyzer = new LexicalAnalyzer();
    let total = 0;
    let hits = 0;
    const failures: string[] = [];
    for (const sentence of (sentences as { sentences: Array<{ id: string; text: string; tokens: Array<{ form: string; lemma: string; pos: string; feats?: string }> }> }).sentences) {
      const words = analyzer.analyze(sentence.text).words;
      for (let index = 0; index < sentence.tokens.length; index++) {
        const expected = sentence.tokens[index];
        if (expected.pos === 'PUNCT') continue;
        total++;
        const correct = words[index]?.readings.some((reading) => reading.lemma === expected.lemma &&
          (!expected.feats || Object.entries(Object.fromEntries(expected.feats.split('|').map((feature) => feature.split('=')))).every(([key, value]) => reading.feats[key] === value)));
        if (correct) hits++;
        else failures.push(`${sentence.id}:${expected.form}`);
      }
    }
    console.info('Leitura lexical no gabarito', hits, '/', total, 'falhas:', failures.join(', '));
    expect(hits / total).toBeGreaterThanOrEqual(0.99);
  });
});
