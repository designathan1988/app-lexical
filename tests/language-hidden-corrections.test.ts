import { describe, expect, it } from 'vitest';
import fixture from './fixtures/sentences-extra-2.json';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { parseGraph } from '../src/eval/graphMatch';

type Sentence = {
  id: string;
  text: string;
  tokens: Array<{ form: string }>;
  dependencies: Array<{ rel: string; head: number; dep: number }>;
  meaningGraph: string;
};

const sentences = (fixture as { sentences: Sentence[] }).sentences;
const nominalPhrases = sentences.filter((sentence) => sentence.id.startsWith('extra2-1.1-'));
const copularSentences = sentences.filter((sentence) => sentence.id.startsWith('extra2-1.2-')).slice(0, 3);
const movementSentences = sentences.filter((sentence) => sentence.id.startsWith('extra2-1.2-')).slice(3);
const subordinateCopulas = sentences.filter((sentence) => sentence.id.startsWith('extra2-1.3-'));

describe('correções da verificação oculta — sintagmas nominais', () => {
  it.each(nominalPhrases)('$id: liga o PP ao nome e preserva a posse no grafo', (sentence) => {
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

describe('correções da verificação oculta — subordinada copular', () => {
  it.each(subordinateCopulas)('$id: preserva a principal e liga o predicativo subordinado', (sentence) => {
    const analysis = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence(sentence.text);
    const root = sentence.dependencies.find((arc) => arc.rel === 'root')!;
    const subordinate = sentence.dependencies.find((arc) => arc.rel === 'advcl')!;
    const copula = sentence.dependencies.find((arc) => arc.rel === 'cop')!;
    const marker = sentence.dependencies.find((arc) => arc.rel === 'mark')!;
    expect(analysis.dependencies[root.dep - 1], sentence.id).toMatchObject({ head: 0, deprel: 'root' });
    expect(analysis.dependencies[subordinate.dep - 1], sentence.id).toMatchObject({ head: subordinate.head, deprel: 'advcl' });
    expect(analysis.dependencies[copula.dep - 1], sentence.id).toMatchObject({ head: copula.head, deprel: 'cop' });
    expect(analysis.dependencies[marker.dep - 1], sentence.id).toMatchObject({ head: marker.head, deprel: 'mark' });
    const expectedRole = parseGraph(sentence.meaningGraph).edges.find((edge) =>
      ['cause', 'condition', 'TIME'].includes(edge.role))!.role;
    const subordinateNode = analysis.meaningGraph.nodes.find((node) => node.token === subordinate.dep);
    expect(subordinateNode, sentence.id).toBeDefined();
    expect(analysis.meaningGraph.edges, sentence.id).toContainEqual(expect.objectContaining({
      from: analysis.meaningGraph.root, role: expectedRole, to: subordinateNode!.id
    }));
  });
});

describe('correções da verificação oculta — cópula e movimento', () => {
  it.each(copularSentences)('$id: escolhe ser e o predicativo após advérbio', (sentence) => {
    const analysis = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence(sentence.text);
    const copula = sentence.dependencies.find((arc) => arc.rel === 'cop')!;
    const root = sentence.dependencies.find((arc) => arc.rel === 'root')!;
    expect(analysis.words[copula.dep - 1].selected).toMatchObject({ lemma: 'ser', upos: 'AUX' });
    expect(analysis.dependencies[copula.dep - 1]).toMatchObject({ head: copula.head, deprel: 'cop' });
    expect(analysis.dependencies[root.dep - 1]).toMatchObject({ head: 0, deprel: 'root' });
  });

  it.each(movementSentences)('$id: escolhe ir em contexto de movimento', (sentence) => {
    const analysis = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence(sentence.text);
    const root = sentence.dependencies.find((arc) => arc.rel === 'root')!;
    expect(analysis.words[root.dep - 1].selected.lemma).toBe('ir');
    expect(analysis.dependencies[root.dep - 1]).toMatchObject({ head: 0, deprel: 'root' });
  });
});
