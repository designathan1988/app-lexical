import { describe, expect, it } from 'vitest';
import fixture from './fixtures/sentences-extra-3.json';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';

const engine = new SemanticEngine(createInitialKnowledgeBase());
const participles = fixture.sentences.filter((sentence) => sentence.id.startsWith('extra3-2.1-'));
const degreePhrases = fixture.sentences.filter((sentence) => sentence.id.startsWith('extra3-2.2-')) as Array<{
  id: string; text: string; degree: { modifier: number; head: number };
}>;

describe('correção final — particípios predicativos e passiva', () => {
  it('cobre seis frases inéditas com classes, subordinação e passiva', () => {
    expect(participles).toHaveLength(6);
  });

  it.each(participles)('$id: mantém particípio como núcleo e distingue cópula de passiva', (sentence) => {
    const analysis = engine.analyzeSentence(sentence.text);
    expect(analysis.words.map((word) => word.form), sentence.id).toEqual(sentence.tokens.map((token) => token.form));
    const participle = sentence.tokens.findIndex((token) => token.feats === 'VerbForm=Part');
    expect(analysis.words[participle]?.selected.upos, sentence.id).toBe('VERB');
    expect(analysis.words[participle]?.selected.feats.VerbForm, sentence.id).toBe('Part');
    expect(analysis.dependencies.map((arc) => ({ rel: arc.deprel, head: arc.head, dep: arc.id })), sentence.id)
      .toEqual(sentence.dependencies);
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
