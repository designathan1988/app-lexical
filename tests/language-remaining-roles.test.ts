import { describe, expect, it } from 'vitest';
import fixture from './fixtures/sentences-extra-2.json';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { parseGraph } from '../src/eval/graphMatch';

const engine = new SemanticEngine(createInitialKnowledgeBase());
const ids = new Set(['extra2-1.1-04', 'extra2-1.1-06', 'extra2-1.7-04', 'extra2-1.7-06']);

describe('papéis semânticos restantes com expectativa consistente', () => {
  for (const sentence of fixture.sentences.filter((entry) => ids.has(entry.id))) {
    it(`${sentence.id}: liga conceito e argumento esperados`, () => {
      const actual = parseGraph(engine.analyzeSentence(sentence.text).meaningGraph.penman);
      const expected = parseGraph(sentence.meaningGraph);
      const actualConcepts = new Map(actual.nodes.map((node) => [node.id, node.concept]));
      const expectedConcepts = new Map(expected.nodes.map((node) => [node.id, node.concept]));
      const actualTriples = actual.edges.map((edge) => JSON.stringify([actualConcepts.get(edge.from), edge.role, actualConcepts.get(edge.to)]));
      for (const edge of expected.edges) {
        expect(actualTriples, sentence.id).toContain(JSON.stringify([expectedConcepts.get(edge.from), edge.role, expectedConcepts.get(edge.to)]));
      }
    });
  }

  it('preserva o sentido da moldura no gabarito para começar + infinitivo', () => {
    const graph = engine.analyzeSentence('Eu começo a trabalhar cedo.').meaningGraph;
    expect(graph.nodes.find((node) => node.id === graph.root)?.concept).toBe('começar.INICIAR');
  });

  for (const [text, source, role, target] of [
    ['A notícia chegou.', 'chegar.CHEGAR', 'ARG0', 'notícia'],
    ['Isso chega.', 'chegar.BASTAR', 'ARG1', 'isso'],
    ['Nós gostamos da escola.', 'gostar.GOSTAR', 'ARG1', 'escola'],
    ['Ela voltou para a escola.', 'voltar.VOLTAR', 'LOC', 'escola'],
    ['O professor ensina a escrever para a criança.', 'ensinar.ENSINAR', 'ARG2', 'criança']
  ]) {
    it(`generaliza a atribuição de papel: ${text}`, () => {
      const graph = engine.analyzeSentence(text).meaningGraph;
      const concepts = new Map(graph.nodes.map((node) => [node.id, node.concept]));
      expect(graph.edges.some((edge) => concepts.get(edge.from) === source && edge.role === role && concepts.get(edge.to) === target),
        graph.penman).toBe(true);
    });
  }
});
