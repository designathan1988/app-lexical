import { describe, expect, it } from 'vitest';
import fixture from './fixtures/sentences-extra-2.json';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';

type Sentence = {
  id: string;
  text: string;
  tokens: Array<{ form: string }>;
  dependencies: Array<{ rel: string; head: number; dep: number }>;
};

const sentences = (fixture as { sentences: Sentence[] }).sentences;

describe('correções da verificação oculta — sintagmas nominais', () => {
  it.each(sentences)('$id: liga o PP ao nome e preserva a posse no grafo', (sentence) => {
    const analysis = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence(sentence.text);
    expect(analysis.words.map((word) => word.form), sentence.id).toEqual(sentence.tokens.map((token) => token.form));
    expect(analysis.dependencies.map((arc) => ({ rel: arc.deprel, head: arc.head, dep: arc.id })), sentence.id)
      .toEqual(sentence.dependencies);

    const expectedModifier = sentence.dependencies.find((arc) => arc.rel === 'nmod')!;
    const holder = analysis.meaningGraph.nodes.find((node) => node.token === expectedModifier.head);
    const owner = analysis.meaningGraph.nodes.find((node) => node.token === expectedModifier.dep);
    expect(holder && owner, sentence.id).toBeTruthy();
    expect(analysis.meaningGraph.edges, sentence.id).toContainEqual(expect.objectContaining({
      from: holder!.id, role: 'poss', to: owner!.id
    }));
  });
});
