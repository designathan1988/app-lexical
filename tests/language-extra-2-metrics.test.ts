import { describe, expect, it } from 'vitest';
import fixture from './fixtures/sentences-extra-2.json';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { parseGraph, type ParsedGraph } from '../src/eval/graphMatch';

function roleTriples(graph: ParsedGraph): string[] {
  const concepts = new Map(graph.nodes.map((node) => [node.id, node.concept]));
  return graph.edges.map((edge) => JSON.stringify([concepts.get(edge.from), edge.role, concepts.get(edge.to)]));
}

describe('métricas independentes das frases extras-2', () => {
  it('mede todas as ligações UD e papéis semânticos anotados', () => {
    const engine = new SemanticEngine(createInitialKnowledgeBase());
    let correctArcs = 0;
    let totalArcs = 0;
    let correctRoles = 0;
    let totalRoles = 0;
    const arcFailures: string[] = [];
    const roleFailures: string[] = [];

    for (const sentence of fixture.sentences) {
      const analysis = engine.analyzeSentence(sentence.text);
      expect(analysis.words.map((word) => word.form), sentence.id).toEqual(sentence.tokens.map((token) => token.form));
      for (const expected of sentence.dependencies) {
        const actual = analysis.dependencies[expected.dep - 1];
        totalArcs++;
        if (actual.head === expected.head && actual.deprel === expected.rel) correctArcs++;
        else arcFailures.push(`${sentence.id}:${expected.dep} ${expected.head}/${expected.rel}→${actual.head}/${actual.deprel}`);
      }
      const actualRoles = roleTriples(parseGraph(analysis.meaningGraph.penman));
      for (const expected of roleTriples(parseGraph(sentence.meaningGraph))) {
        totalRoles++;
        const index = actualRoles.indexOf(expected);
        if (index >= 0) {
          correctRoles++;
          actualRoles.splice(index, 1);
        } else roleFailures.push(`${sentence.id}:${expected} → ${analysis.meaningGraph.penman}`);
      }
    }

    console.info(`Extras-2: LAS ${correctArcs}/${totalArcs} (${(100 * correctArcs / totalArcs).toFixed(2)}%); papéis ${correctRoles}/${totalRoles} (${(100 * correctRoles / totalRoles).toFixed(2)}%)`);
    console.info('Ligações divergentes:', arcFailures.join(', '));
    console.info('Papéis divergentes:', roleFailures.join(', '));
    expect(correctArcs / totalArcs).toBeGreaterThanOrEqual(0.95);
    expect(correctRoles / totalRoles).toBeGreaterThanOrEqual(0.95);
  });
});
