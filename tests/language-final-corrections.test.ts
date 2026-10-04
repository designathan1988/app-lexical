import { describe, expect, it } from 'vitest';
import fixture from './fixtures/sentences-extra-3.json';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { LexicalAnalyzer } from '../src/engine/language/LexicalAnalyzer';

const engine = new SemanticEngine(createInitialKnowledgeBase());
const participles = fixture.sentences.filter((sentence) => sentence.id.startsWith('extra3-2.1-'));
const degreePhrases = fixture.sentences.filter((sentence) => sentence.id.startsWith('extra3-2.2-')) as Array<{
  id: string; text: string; degree: { modifier: number; head: number };
}>;
const quantifierPhrases = fixture.sentences.filter((sentence) => sentence.id.startsWith('extra3-2.3-')) as Array<{
  id: string; text: string; target: { token: number; upos: string };
}>;
const nominalizedAdjectives = fixture.sentences.filter((sentence) => sentence.id.startsWith('extra3-2.4-')) as Array<{
  id: string; text: string; nominal: { token: number; relation: string };
}>;

describe('correção final — particípios predicativos e passiva', () => {
  it('cobre seis frases inéditas com classes, subordinação e passiva', () => {
    expect(participles).toHaveLength(6);
  });

  it.each(participles)('$id: mantém particípio como núcleo e distingue cópula de passiva', (sentence) => {
    const analysis = engine.analyzeSentence(sentence.text);
    expect(analysis.words.map((word) => word.form), sentence.id).toEqual(sentence.tokens.map((token) => token.form));
    const participle = sentence.tokens.findIndex((token) => 'feats' in token && token.feats === 'VerbForm=Part');
    expect(analysis.words[participle]?.selected.upos, sentence.id).toBe('VERB');
    expect(analysis.words[participle]?.selected.feats.VerbForm, sentence.id).toBe('Part');
    expect(analysis.dependencies.map((arc) => ({ rel: arc.deprel, head: arc.head, dep: arc.id })), sentence.id)
      .toEqual(sentence.dependencies);
  });
});

describe('correção final — adjetivo como núcleo nominal', () => {
  it('cobre seis frases com sujeito, objeto e oblíquo', () => {
    expect(nominalizedAdjectives).toHaveLength(6);
  });

  it.each(nominalizedAdjectives)('$id: conserva ADJ e atribui relação de argumento', (sentence) => {
    const analysis = engine.analyzeSentence(sentence.text);
    const index = sentence.nominal.token - 1;
    expect(analysis.words[index]?.selected.upos, sentence.id).toBe('ADJ');
    expect(analysis.dependencies[index]?.deprel, sentence.id).toBe(sentence.nominal.relation);
    const node = analysis.meaningGraph.nodes.find((item) => item.token === sentence.nominal.token);
    expect(node, sentence.id).toBeDefined();
    expect(analysis.meaningGraph.edges.some((edge) => edge.to === node!.id), sentence.id).toBe(true);
  });
});

describe('correção final — advérbios e quantificadores de grau', () => {
  it('cobre seis frases com usos adverbiais e determinantes', () => {
    expect(quantifierPhrases).toHaveLength(6);
  });

  it.each(quantifierPhrases)('$id: escolhe a classe pela função no sintagma', (sentence) => {
    const analysis = engine.analyzeSentence(sentence.text);
    expect(analysis.words[sentence.target.token - 1]?.selected.upos, sentence.id).toBe(sentence.target.upos);
  });

  it('oferece leitura adverbial às nove formas de grau e determinante aos quantificadores nominais', () => {
    const lexical = new LexicalAnalyzer();
    for (const form of ['bastante', 'demais', 'tão', 'tanto', 'meio', 'bem', 'quase', 'pouco', 'mais', 'menos']) {
      expect(lexical.analyzeSurface(form).some((reading) => reading.upos === 'ADV'), form).toBe(true);
    }
    for (const form of ['bastante', 'tanto', 'pouco', 'mais', 'menos']) {
      expect(lexical.analyzeSurface(form).some((reading) => reading.upos === 'DET'), form).toBe(true);
    }
  });
});

describe('correção final — grau e graduabilidade', () => {
  it('cobre seis frases com tempo, lugar e advérbios graduáveis', () => {
    expect(degreePhrases).toHaveLength(6);
  });

  it.each(degreePhrases)('$id: liga o grau ao alvo semântico correto', (sentence) => {
    const analysis = engine.analyzeSentence(sentence.text);
    expect(analysis.dependencies[sentence.degree.modifier - 1], sentence.id)
      .toMatchObject({ head: sentence.degree.head, deprel: 'advmod' });
    const head = analysis.meaningGraph.nodes.find((node) => node.token === sentence.degree.head);
    const degree = analysis.words[sentence.degree.modifier - 1].selected.lemma;
    expect(head, sentence.id).toBeDefined();
    expect(analysis.meaningGraph.attributes, sentence.id)
      .toContainEqual(expect.objectContaining({ from: head!.id, role: 'degree', value: degree }));
  });
});
