import { describe, expect, it } from 'vitest';
import gold from '../research/morfologia/tests-sentences.json';
import extra from './fixtures/sentences-extra.json';
import { LanguageTagger } from '../src/engine/language/Tagger';
import { DependencyParser } from '../src/engine/language/DependencyParser';
import { ClauseAnalyzer } from '../src/engine/language/ClauseAnalyzer';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';

type Sentence = {
  id: string; text: string;
  tokens: Array<{ form: string }>;
  dependencies: Array<{ rel: string; head: number; dep: number }>;
  subject: number[]; predicate: number[];
};

const tagger = new LanguageTagger();
const parser = new DependencyParser();
const clauses = new ClauseAnalyzer();

function measure(sentences: Sentence[]) {
  let correctHead = 0;
  let correctArc = 0;
  let total = 0;
  let subjectHit = 0;
  let predicateHit = 0;
  const failures: string[] = [];
  for (const sentence of sentences) {
    const tagged = tagger.tagForms(sentence.tokens.map((token) => token.form));
    const parsed = parser.parse(tagged.words);
    const clause = clauses.analyze(tagged.words, parsed);
    for (const expected of sentence.dependencies) {
      total++;
      const actual = parsed[expected.dep - 1];
      if (actual.head === expected.head) correctHead++;
      if (actual.head === expected.head && actual.deprel === expected.rel) correctArc++;
      else failures.push(`${sentence.id}:${expected.dep} ${expected.head}/${expected.rel}→${actual.head}/${actual.deprel}`);
    }
    if (JSON.stringify(clause.subject) === JSON.stringify(sentence.subject)) subjectHit++;
    if (JSON.stringify(clause.predicate) === JSON.stringify(sentence.predicate)) predicateHit++;
  }
  const metrics = {
    uas: correctHead / total, las: correctArc / total,
    subject: subjectHit / sentences.length, predicate: predicateHit / sentences.length
  };
  console.info('Dependências', JSON.stringify(metrics), 'falhas:', failures.join(', '));
  return metrics;
}

describe('dependências UD e estrutura da oração', () => {
  it('atinge UAS, LAS, sujeito e predicado no gabarito', () => {
    const m = measure((gold as { sentences: Sentence[] }).sentences);
    expect(m.uas).toBeGreaterThanOrEqual(0.90);
    expect(m.las).toBeGreaterThanOrEqual(0.85);
    expect(m.subject).toBeGreaterThanOrEqual(0.90);
    expect(m.predicate).toBeGreaterThanOrEqual(0.90);
  });

  it('atinge UAS de 85% nas frases extras', () => {
    const m = measure((extra as { sentences: Sentence[] }).sentences);
    expect(m.uas).toBeGreaterThanOrEqual(0.85);
  });

  it('expõe análise de frase sem alterar o documento e exporta CoNLL-U válido', () => {
    const engine = new SemanticEngine(createInitialKnowledgeBase());
    const before = engine.store.document.nodes.size;
    const analysis = engine.analyzeSentence('Eu quero tomar café.');
    expect(engine.store.document.nodes.size).toBe(before);
    expect(analysis.clause.subject).toEqual([1]);
    expect(analysis.clause.predicate).toEqual([2, 3]);
    const lines = analysis.conllu.trim().split('\n').filter((line) => !line.startsWith('#'));
    expect(lines.every((line) => line.split('\t').length === 10)).toBe(true);
    expect(lines.some((line) => line.includes('\tquerer\tVERB\t'))).toBe(true);
  });

  it('usa faixa de multiword para contração', () => {
    const analysis = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence('Ela está na casa.');
    expect(analysis.conllu).toMatch(/^\d+-\d+\tna\t_/m);
  });
});
