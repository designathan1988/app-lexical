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
  const clauseFailures: string[] = [];
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
    else clauseFailures.push(`${sentence.id}:sujeito ${JSON.stringify(sentence.subject)}→${JSON.stringify(clause.subject)}`);
    if (JSON.stringify(clause.predicate) === JSON.stringify(sentence.predicate)) predicateHit++;
    else clauseFailures.push(`${sentence.id}:predicado ${JSON.stringify(sentence.predicate)}→${JSON.stringify(clause.predicate)}`);
  }
  const metrics = {
    uas: correctHead / total, las: correctArc / total,
    subject: subjectHit / sentences.length, predicate: predicateHit / sentences.length
  };
  console.info('Dependências', JSON.stringify(metrics), 'falhas:', failures.join(', '), 'orações:', clauseFailures.join(', '));
  return metrics;
}

describe('dependências UD e estrutura da oração', () => {
  it('reconhece modo interrogativo e negação pelos traços mesmo sem pontuação', () => {
    const engine = new SemanticEngine(createInitialKnowledgeBase());
    expect(engine.analyzeSentence('Quem chegou').clause.mode).toBe('interrogative');
    expect(engine.analyzeSentence('Ninguém chegou.').clause.polarity).toBe('negative');
  });

  it('registra pela moldura quando o oblíquo é argumento ou adjunto', () => {
    const engine = new SemanticEngine(createInitialKnowledgeBase());
    for (const [text, nominal, rule] of [
      ['Eu gosto de café.', 'café', 'UD_OBL_FRAME_ARGUMENT'],
      ['Ela mora na casa.', 'casa', 'UD_OBL_FRAME_ARGUMENT'],
      ['Eu leio o livro na casa.', 'casa', 'UD_OBL_ADJUNCT']
    ]) {
      const analysis = engine.analyzeSentence(text);
      const index = analysis.words.findIndex((word) => word.form.toLocaleLowerCase('pt-BR') === nominal);
      expect(analysis.dependencies[index], text).toMatchObject({ deprel: 'obl', rule });
    }
  });

  it('liga adjetivos atributivos ao substantivo por amod sem confundir predicativo', () => {
    const analysis = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence('A casa azul é grande.');
    const casa = analysis.words.findIndex((word) => word.form.toLocaleLowerCase('pt-BR') === 'casa') + 1;
    const azul = analysis.words.findIndex((word) => word.form.toLocaleLowerCase('pt-BR') === 'azul') + 1;
    const grande = analysis.words.findIndex((word) => word.form.toLocaleLowerCase('pt-BR') === 'grande') + 1;
    expect(analysis.dependencies[azul - 1]).toMatchObject({ head: casa, deprel: 'amod' });
    expect(analysis.dependencies[grande - 1]).toMatchObject({ head: 0, deprel: 'root' });
  });

  it('marca causal, relativo locativo, tempo sem preposição e cortesia por função', () => {
    const ids = ['sent-066', 'sent-069', 'sent-073', 'sent-079'];
    const expected = new Map([['sent-066', [4, 'advcl']], ['sent-069', [3, 'advmod']],
      ['sent-073', [6, 'obl']], ['sent-079', [4, 'discourse']]] as Array<[string, [number, string]]>);
    for (const sentence of (gold as { sentences: Sentence[] }).sentences.filter((item) => ids.includes(item.id))) {
      const tagged = tagger.tagForms(sentence.tokens.map((token) => token.form));
      const arcs = parser.parse(tagged.words);
      const [index, relation] = expected.get(sentence.id)!;
      expect(arcs[index - 1].deprel, sentence.id).toBe(relation);
    }
  });

  it('usa concordância para escolher sujeito em objeto anteposto', () => {
    const sentence = 'Eu, a casa comprei.';
    const analysis = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence(sentence);
    expect(analysis.clause.subject).toEqual([1]);
    expect(analysis.dependencies[3].deprel).toBe('obj');
  });

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
