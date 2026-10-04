import { describe, expect, it } from 'vitest';
import gold from '../research/morfologia/tests-inflection.json';
import sentences from '../research/morfologia/tests-sentences.json';
import extraSentences from './fixtures/sentences-extra.json';
import { LanguageInflector } from '../src/engine/language/LanguageInflector';
import { LexicalAnalyzer } from '../src/engine/language/LexicalAnalyzer';
import seedRoots from '../src/knowledge/morphology/seed-roots.json';
import { closedClassReadings } from '../src/engine/language/ClosedClassLexicon';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';

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

  it('indexa todas as raízes iniciais pela forma do lema', () => {
    const entries = (seedRoots as { entries: Array<{ lemma: string; pos: string }> }).entries;
    const missing = entries.filter((entry) =>
      !inflector.lemmatize(entry.lemma).some((reading) => reading.lemma === entry.lemma) &&
      !closedClassReadings(entry.lemma).length
    );
    console.info('Raízes indexadas', entries.length - missing.length, '/', entries.length,
      'ausentes:', missing.map((entry) => `${entry.lemma}/${entry.pos}`).join(', '));
    expect(missing.map((entry) => `${entry.lemma}/${entry.pos}`)).toEqual([]);
  });

  it('indexa também todos os lexemas do construtor pela forma do lema', () => {
    const lexemes = Object.values(createInitialKnowledgeBase().lexemes);
    const domainInflector = new LanguageInflector(createInitialKnowledgeBase().lexemes);
    const missing = lexemes.filter((entry) => !domainInflector.lemmatize(entry.lemma)
      .some((reading) => reading.lemma === entry.lemma));
    console.info('Lexemas do construtor indexados', lexemes.length - missing.length, '/', lexemes.length,
      'ausentes:', missing.map((entry) => entry.lemma).join(', '));
    expect(missing.map((entry) => entry.lemma)).toEqual([]);
  });

  it('expõe palpite verbal com traços para formas finitas desconhecidas', () => {
    const analyzer = new LexicalAnalyzer();
    for (const [form, person, number, tense] of [
      ['frandelamos', '1', 'Plur', 'Pres'],
      ['zorbirei', '1', 'Sing', 'Fut'],
      ['murlou', '3', 'Sing', 'Past']
    ]) {
      expect(analyzer.analyzeSurface(form), form).toContainEqual(expect.objectContaining({
        upos: 'VERB', origin: 'GUESS',
        feats: expect.objectContaining({ Person: person, Number: number, Mood: 'Ind', Tense: tense, VerbForm: 'Fin' })
      }));
    }
  });

  it('gera leituras com traços para raízes com paradigma declarado', () => {
    const entries = (seedRoots as { entries: Array<{ lemma: string; pos: string; inflection?: { paradigmId: string } }> }).entries;
    const missing = entries.filter((entry) => entry.inflection && !inflector.lemmatize(entry.lemma)
      .some((reading) => reading.lemma === entry.lemma && reading.pos === entry.pos && reading.features));
    console.info('Paradigmas declarados sem leitura flexional:', missing.map((entry) => `${entry.lemma}/${entry.inflection?.paradigmId}`).join(', '));
    expect(missing.map((entry) => `${entry.lemma}/${entry.inflection?.paradigmId}`)).toEqual([]);
  });

  it.each([
    ['exponho', 'expor'], ['percebo', 'perceber'], ['avôs', 'avô'],
    ['más', 'mau'], ['minhas', 'meu'], ['tuas', 'teu'], ['suas', 'seu'],
    ['várias', 'vários'], ['duas', 'dois'], ['duzentas', 'duzentos']
  ])('gera a família flexional de %s', (form, lemma) => {
    expect(inflector.lemmatize(form).some((reading) => reading.lemma === lemma && reading.features)).toBe(true);
  });

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
    let lemmaHits = 0;
    let featureHits = 0;
    let featureTotal = 0;
    const failures: string[] = [];
    for (const sentence of (sentences as { sentences: Array<{ id: string; text: string; tokens: Array<{ form: string; lemma: string; pos: string; feats?: string }> }> }).sentences) {
      for (let index = 0; index < sentence.tokens.length; index++) {
        const expected = sentence.tokens[index];
        if (expected.pos === 'PUNCT') continue;
        total++;
        const candidates = analyzer.analyzeSurface(expected.form);
        if (candidates.some((reading) => reading.lemma === expected.lemma)) lemmaHits++;
        if (expected.feats) {
          featureTotal++;
          if (candidates.some((reading) => Object.entries(Object.fromEntries(expected.feats!.split('|').map((feature) => feature.split('=')))).every(([key, value]) => reading.feats[key] === value))) featureHits++;
        }
        const correct = candidates.some((reading) => reading.lemma === expected.lemma &&
          (!expected.feats || Object.entries(Object.fromEntries(expected.feats.split('|').map((feature) => feature.split('=')))).every(([key, value]) => reading.feats[key] === value)));
        if (correct) hits++;
        else failures.push(`${sentence.id}:${expected.form} → ${candidates.map((reading) => `${reading.lemma}/${reading.upos}/${JSON.stringify(reading.feats)}`).join(';')}`);
      }
    }
    console.info('Leitura lexical no gabarito', hits, '/', total, 'falhas:', failures.join(', '));
    console.info('Lema gabarito', lemmaHits, '/', total, 'traços gabarito', featureHits, '/', featureTotal);
    expect(hits / total).toBeGreaterThanOrEqual(0.99);
  });

  it('mede lema e traços disponíveis nas frases extras', () => {
    const analyzer = new LexicalAnalyzer();
    let total = 0;
    let lemmaHits = 0;
    let featureTotal = 0;
    let featureHits = 0;
    const featureFailures: string[] = [];
    for (const sentence of (extraSentences as { sentences: Array<{ tokens: Array<{ form: string; lemma: string; pos: string; feats?: string }> }> }).sentences) {
      for (const expected of sentence.tokens) {
        if (expected.pos === 'PUNCT') continue;
        total++;
        const candidates = analyzer.analyzeSurface(expected.form);
        if (candidates.some((reading) => reading.lemma === expected.lemma)) lemmaHits++;
        if (expected.feats) {
          featureTotal++;
          if (candidates.some((reading) => Object.entries(Object.fromEntries(expected.feats!.split('|').map((feature) => feature.split('=')))).every(([key, value]) => reading.feats[key] === value))) featureHits++;
          else featureFailures.push(`${expected.form}:${expected.feats}`);
        }
      }
    }
    console.info('Lema extras', lemmaHits, '/', total, 'traços extras', featureHits, '/', featureTotal, 'falhas:', featureFailures.join(', '));
    expect(total).toBeGreaterThan(0);
  });

  it('preserva a flexão irregular de sorrir e o gênero nominal de aluno', () => {
    const analyzer = new LexicalAnalyzer();
    expect(analyzer.analyzeSurface('sorri')).toContainEqual(expect.objectContaining({
      lemma: 'sorrir', feats: expect.objectContaining({ Number: 'Sing', Person: '3', Mood: 'Ind', Tense: 'Pres' })
    }));
    expect(analyzer.analyzeSurface('aluno')).toContainEqual(expect.objectContaining({
      lemma: 'aluno', feats: expect.objectContaining({ Gender: 'Masc', Number: 'Sing' })
    }));
  });
});
