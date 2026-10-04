import { describe, expect, it } from 'vitest';
import fixture from './fixtures/sentences-extra-2.json';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { parseGraph } from '../src/eval/graphMatch';
import { LanguageInflector } from '../src/engine/language/LanguageInflector';
import { LexicalAnalyzer } from '../src/engine/language/LexicalAnalyzer';
import seedRoots from '../src/knowledge/morphology/seed-roots.json';

type Sentence = {
  id: string;
  text: string;
  tokens: Array<{ form: string; lemma: string; pos: string; feats?: string }>;
  dependencies: Array<{ rel: string; head: number; dep: number }>;
  meaningGraph: string;
  degree?: { modifier: number; head: number };
  ppFrame?: string;
  canonicalPronoun?: { token: number; concept: string };
};

const sentences = (fixture as { sentences: Sentence[] }).sentences;
const nominalPhrases = sentences.filter((sentence) => sentence.id.startsWith('extra2-1.1-'));
const copularSentences = sentences.filter((sentence) => sentence.id.startsWith('extra2-1.2-')).slice(0, 3);
const movementSentences = sentences.filter((sentence) => sentence.id.startsWith('extra2-1.2-')).slice(3);
const subordinateCopulas = sentences.filter((sentence) => sentence.id.startsWith('extra2-1.3-'));
const enumerations = sentences.filter((sentence) => sentence.id.startsWith('extra2-1.4-'));
const adjectiveSentences = sentences.filter((sentence) => sentence.id.startsWith('extra2-1.5-'));
const degreeSentences = sentences.filter((sentence) => sentence.id.startsWith('extra2-1.6-'));
const postInfinitivePps = sentences.filter((sentence) => sentence.id.startsWith('extra2-1.7-'));
const treatmentPronouns = sentences.filter((sentence) => sentence.id.startsWith('extra2-1.8-'));

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

describe('correções da verificação oculta — enumerações', () => {
  it.each(enumerations)('$id: coordena todos os itens sob o primeiro núcleo', (sentence) => {
    const analysis = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence(sentence.text);
    expect(analysis.dependencies.map((arc) => ({ rel: arc.deprel, head: arc.head, dep: arc.id })), sentence.id)
      .toEqual(sentence.dependencies);
    expect(analysis.clause.subject, sentence.id).toEqual((sentence as Sentence & { subject: number[] }).subject);
    expect(analysis.clause.predicate, sentence.id).toEqual((sentence as Sentence & { predicate: number[] }).predicate);
    const expectedGraph = parseGraph(sentence.meaningGraph);
    const expectedCoordination = expectedGraph.nodes.find((node) => node.concept === 'and' || node.concept === 'or')!;
    const actualCoordination = analysis.meaningGraph.nodes.filter((node) => node.concept === 'and' || node.concept === 'or');
    expect(actualCoordination, sentence.id).toHaveLength(1);
    expect(actualCoordination[0].concept, sentence.id).toBe(expectedCoordination.concept);
    expect(analysis.meaningGraph.edges.filter((edge) => edge.from === actualCoordination[0].id && edge.role.startsWith('op')), sentence.id)
      .toHaveLength(expectedGraph.edges.filter((edge) => edge.from === expectedCoordination.id && edge.role.startsWith('op')).length);
  });
});

describe('correções da verificação oculta — paradigmas adjetivais', () => {
  const inflector = new LanguageInflector();
  const lexical = new LexicalAnalyzer();
  const pluralCases: Array<[string, string, string]> = [
    ['bom', 'bons', 'Gender=Masc|Number=Plur'], ['mau', 'maus', 'Gender=Masc|Number=Plur'],
    ['leal', 'leais', 'Number=Plur'], ['legal', 'legais', 'Number=Plur'],
    ['moral', 'morais', 'Number=Plur'], ['normal', 'normais', 'Number=Plur'],
    ['real', 'reais', 'Number=Plur'], ['social', 'sociais', 'Number=Plur'],
    ['especial', 'especiais', 'Number=Plur'], ['gentil', 'gentis', 'Number=Plur'],
    ['igual', 'iguais', 'Number=Plur'], ['cruel', 'cruéis', 'Number=Plur'],
    ['popular', 'populares', 'Number=Plur'], ['melhor', 'melhores', 'Number=Plur'],
    ['pior', 'piores', 'Number=Plur'], ['jovem', 'jovens', 'Number=Plur'],
    ['comum', 'comuns', 'Number=Plur'], ['ruim', 'ruins', 'Number=Plur'],
    ['capaz', 'capazes', 'Number=Plur'], ['feliz', 'felizes', 'Number=Plur'],
    ['veloz', 'velozes', 'Number=Plur'], ['simples', 'simples', 'Number=Plur']
  ];

  it.each(pluralCases)('gera %s → %s e recupera o lema', (lemma, form, features) => {
    const root = (seedRoots as { entries: Array<{ lemma: string; pos: string; inflection?: { paradigmId: string } }> }).entries
      .find((entry) => entry.lemma === lemma && entry.pos === 'ADJECTIVE')!;
    expect(inflector.inflect(lemma, root.inflection!.paradigmId, features), lemma).toContain(form);
    expect(inflector.lemmatize(form), form).toContainEqual(expect.objectContaining({ lemma, features }));
  });

  it('gera as quatro formas de bom e mau a partir dos respectivos paradigmas', () => {
    expect(inflector.inflect('bom', 'ADJ_BOM', 'Gender=Masc|Number=Sing')).toContain('bom');
    expect(inflector.inflect('bom', 'ADJ_BOM', 'Gender=Fem|Number=Sing')).toContain('boa');
    expect(inflector.inflect('bom', 'ADJ_BOM', 'Gender=Masc|Number=Plur')).toContain('bons');
    expect(inflector.inflect('bom', 'ADJ_BOM', 'Gender=Fem|Number=Plur')).toContain('boas');
    expect(inflector.inflect('mau', 'ADJ_AU', 'Gender=Masc|Number=Sing')).toContain('mau');
    expect(inflector.inflect('mau', 'ADJ_AU', 'Gender=Fem|Number=Sing')).toContain('má');
    expect(inflector.inflect('mau', 'ADJ_AU', 'Gender=Masc|Number=Plur')).toContain('maus');
    expect(inflector.inflect('mau', 'ADJ_AU', 'Gender=Fem|Number=Plur')).toContain('más');
  });

  it.each(adjectiveSentences)('$id: mantém lema, traços e conceito no predicativo', (sentence) => {
    const analysis = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence(sentence.text);
    const adjective = sentence.tokens.find((token) => token.pos === 'ADJECTIVE')!;
    const index = sentence.tokens.findIndex((token) => token.form === adjective.form);
    expect(analysis.words[index].selected.lemma, sentence.id).toBe(adjective.lemma);
    const expectedFeatures = Object.entries(Object.fromEntries(adjective.feats!.split('|').map((feature) => feature.split('='))));
    expect(lexical.analyzeSurface(adjective.form).some((reading) => reading.lemma === adjective.lemma &&
      expectedFeatures.every(([key, value]) => reading.feats[key] === value)), sentence.id).toBe(true);
    expect(analysis.meaningGraph.nodes.find((node) => node.id === analysis.meaningGraph.root)?.concept, sentence.id)
      .toBe(adjective.lemma);
  });
});

describe('correções da verificação oculta — advérbios de grau', () => {
  it.each(degreeSentences)('$id: liga o grau ao modificador e não ao verbo', (sentence) => {
    const analysis = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence(sentence.text);
    const degree = sentence.degree!;
    expect(analysis.dependencies[degree.modifier - 1], sentence.id)
      .toMatchObject({ head: degree.head, deprel: 'advmod' });
    const modified = analysis.meaningGraph.nodes.find((node) => node.token === degree.head);
    expect(modified, sentence.id).toBeDefined();
    expect(analysis.meaningGraph.attributes, sentence.id).toContainEqual(expect.objectContaining({
      from: modified!.id, role: 'degree', value: sentence.tokens[degree.modifier - 1].lemma
    }));
  });
});

describe('correções da verificação oculta — PP após complemento infinitivo', () => {
  it.each(postInfinitivePps)('$id: escolhe o verbo pela moldura e pela proximidade', (sentence) => {
    const analysis = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence(sentence.text);
    const expected = sentence.dependencies.find((arc) => arc.rel === 'obl')!;
    expect(analysis.dependencies[expected.dep - 1], sentence.id)
      .toMatchObject({ head: expected.head, deprel: 'obl' });
    expect(analysis.dependencies[expected.dep - 1].rule, sentence.id).toBeTruthy();
    expect(analysis.trace.dependencies[expected.dep - 1].rule, sentence.id)
      .toContain(sentence.ppFrame ?? analysis.dependencies[expected.dep - 1].rule);
  });
});

describe('correções da verificação oculta — pronome de tratamento', () => {
  it.each(treatmentPronouns)('$id: mantém lema, plural e conceito canônico', (sentence) => {
    const analysis = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence(sentence.text);
    const pronoun = sentence.canonicalPronoun!;
    const reading = analysis.words[pronoun.token - 1].selected;
    expect(reading.lemma, sentence.id).toBe(pronoun.concept);
    expect(reading.feats.Number, sentence.id).toBe('Plur');
    expect(analysis.meaningGraph.nodes.find((node) => node.token === pronoun.token)?.concept, sentence.id)
      .toBe(pronoun.concept);
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
