import { describe, expect, it } from 'vitest';
import gold from '../research/morfologia/tests-sentences.json';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { smatchF1 } from '../src/eval/graphMatch';

const sentences = (gold as { sentences: Array<{ id: string; text: string; meaningGraph: string }> }).sentences;

describe('comparação de grafos por triplas', () => {
  it('ignora nomes de variáveis e parênteses opcionais em folhas', () => {
    expect(smatchF1('(x / querer.DESEJAR :ARG0 (y / eu))', '(a / querer.DESEJAR :ARG0 (b / eu))')).toBe(1);
    expect(smatchF1('(x :ARG0 café)', '(x :ARG0 (café))')).toBe(1);
  });

  it('reduz F1 quando o papel muda', () => {
    const score = smatchF1('(x / beber.INGERIR :ARG0 (a / ela) :ARG1 (b / água))',
      '(x / beber.INGERIR :ARG0 (a / ela) :ARG2 (b / água))');
    expect(score).toBeLessThan(1);
    expect(score).toBeGreaterThan(0);
  });
});

describe('grafo de significado', () => {
  it('reutiliza o nó do sujeito no complemento de controle', () => {
    const analysis = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence('Eu quero tomar café.');
    const graph = analysis.meaningGraph;
    const eu = graph.nodes.find((node) => node.concept === 'eu');
    const querer = graph.nodes.find((node) => node.concept === 'querer.DESEJAR');
    const tomar = graph.nodes.find((node) => node.concept === 'tomar.INGERIR');
    expect(eu && querer && tomar).toBeTruthy();
    expect(graph.edges).toContainEqual(expect.objectContaining({ from: querer!.id, to: eu!.id, role: 'ARG0' }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ from: tomar!.id, to: eu!.id, role: 'ARG0' }));
    expect(graph.penman).toContain(':ARG0');
  });

  it('atinge F1 médio, grafos exatos e sentidos no gabarito', () => {
    const engine = new SemanticEngine(createInitialKnowledgeBase());
    let sum = 0;
    let exact = 0;
    let senses = 0;
    const failures: string[] = [];
    for (const sentence of sentences) {
      const actual = engine.analyzeSentence(sentence.text).meaningGraph;
      const f1 = smatchF1(actual.penman, sentence.meaningGraph);
      sum += f1;
      if (f1 === 1) exact++;
      else failures.push(`${sentence.id}:${f1.toFixed(3)}`);
      const expectedSense = sentence.meaningGraph.match(/[\p{L}]+\.[A-Z_]+/u)?.[0];
      if (!expectedSense || actual.nodes.some((node) => node.concept === expectedSense)) senses++;
    }
    console.info('Grafo', 'Smatch médio', sum / sentences.length, 'exatos', exact, '/', sentences.length,
      'sentidos', senses, '/', sentences.length, 'falhas:', failures.join(', '));
    expect(sum / sentences.length).toBeGreaterThanOrEqual(0.85);
    expect(exact / sentences.length).toBeGreaterThanOrEqual(0.70);
    expect(senses / sentences.length).toBeGreaterThanOrEqual(0.90);
  });
});
