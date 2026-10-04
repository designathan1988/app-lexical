import { describe, expect, it } from 'vitest';
import fixture from './fixtures/sentences-extra-3.json';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';

const engine = new SemanticEngine(createInitialKnowledgeBase());
const participles = fixture.sentences.filter((sentence) => sentence.id.startsWith('extra3-2.1-'));

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
