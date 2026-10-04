import { describe, expect, it } from 'vitest';
import gold from '../research/morfologia/tests-sentences.json';
import extras from './fixtures/sentences-extra.json';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { parseGraph, smatchF1 } from '../src/eval/graphMatch';

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

  it('reconhece repetição do antecedente como reentrância sem fundir irmãos', () => {
    expect(smatchF1('(livro :mod (ler.LER :ARG1 (livro)))', '(x / livro :mod (l / ler.LER :ARG1 x))')).toBe(1);
    expect(parseGraph('(and (menino) (menino))').nodes.filter((node) => node.concept === 'menino')).toHaveLength(2);
  });
});

describe('grafo de significado', () => {
  it('mantém nome próprio composto como um lugar na análise geral', () => {
    const analysis = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence('Ela mora em São Paulo.');
    const graph = analysis.meaningGraph;
    const root = graph.nodes.find((node) => node.id === graph.root);
    const place = graph.nodes.find((node) => node.concept === 'São Paulo');
    expect(root?.concept, JSON.stringify({ words: analysis.words.map((word) => `${word.form}/${word.selected.lemma}/${word.selected.upos}`), arcs: analysis.dependencies })).toBe('morar.MORAR');
    expect(place).toBeDefined();
    expect(graph.edges).toContainEqual(expect.objectContaining({ from: graph.root, to: place!.id, role: 'LOC' }));
  });

  it('reutiliza antecedente nominal dentro da oração relativa', () => {
    const graph = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence('O livro que eu li é bom.').meaningGraph;
    const book = graph.nodes.find((node) => node.concept === 'livro');
    const read = graph.nodes.find((node) => node.concept === 'ler.LER');
    expect(book && read).toBeTruthy();
    expect(graph.edges).toContainEqual(expect.objectContaining({ from: book!.id, to: read!.id, role: 'mod' }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ from: read!.id, to: book!.id, role: 'ARG1' }));
  });

  it('recupera sujeito oculto pessoal da oração relativa e causal', () => {
    for (const text of ['A casa onde moro é grande.', 'Eu leio porque gosto.']) {
      const graph = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence(text).meaningGraph;
      const subordinate = graph.nodes.find((node) => node.concept.startsWith(text.startsWith('A casa') ? 'morar.' : 'gostar.'));
      const eu = graph.nodes.find((node) => node.concept === 'eu');
      expect(subordinate && eu).toBeTruthy();
      expect(graph.edges).toContainEqual(expect.objectContaining({ from: subordinate!.id, to: eu!.id, role: 'ARG0' }));
    }
  });

  it('usa o tipo da pergunta para preferir sentido locativo e de movimento', () => {
    const engine = new SemanticEngine(createInitialKnowledgeBase());
    const location = engine.analyzeSentence('Onde fica a escola?').meaningGraph;
    expect(location.nodes.find((node) => node.id === location.root)?.concept, JSON.stringify(location.trace.filter((event) => event.rule === 'SENSE_FRAME_PREF'))).toBe('ficar.LOCALIZADO');
    const arrival = engine.analyzeSentence('Quando ele chega?').meaningGraph;
    expect(arrival.nodes.find((node) => node.id === arrival.root)?.concept).toBe('chegar.CHEGAR');
  });

  it('interpreta oração temporal no futuro do subjuntivo como condição', () => {
    const graph = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence('Quando ele chegar, nós jantamos.').meaningGraph;
    const arrival = graph.nodes.find((node) => node.concept === 'chegar.CHEGAR');
    expect(arrival).toBeDefined();
    expect(graph.edges).toContainEqual(expect.objectContaining({ from: graph.root, to: arrival!.id, role: 'condition' }));
  });

  it('compõe advérbio e nome temporal de uma mesma expressão', () => {
    const analysis = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence('A festa aconteceu ontem à noite.');
    const graph = analysis.meaningGraph;
    const time = graph.nodes.find((node) => node.concept === 'ontem noite');
    expect(time, JSON.stringify({ penman: graph.penman, words: analysis.words.map((word) => `${word.form}/${word.selected.upos}`), arcs: analysis.dependencies })).toBeDefined();
    expect(graph.edges).toContainEqual(expect.objectContaining({ from: graph.root, to: time!.id, role: 'TIME' }));
    expect(graph.edges.filter((edge) => edge.from === graph.root && edge.role === 'TIME')).toHaveLength(1);
  });

  it('mantém advérbio e frequência nominal separados sem preposição', () => {
    const graph = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence('Eu acordo cedo todos os dias.').meaningGraph;
    expect(graph.nodes.some((node) => node.concept === 'cedo')).toBe(true);
    expect(graph.nodes.some((node) => node.concept === 'cedo dia')).toBe(false);
  });

  it('trata entrada vazia sem lançar nem alterar o documento', () => {
    const engine = new SemanticEngine(createInitialKnowledgeBase());
    const analysis = engine.analyzeSentence('');
    expect(analysis.meaningGraph.nodes).toEqual([]);
    expect(analysis.meaningGraph.penman).toBe('');
    expect(engine.store.document.nodes.size).toBe(0);
  });

  it('representa expressão de cortesia como atributo pragmático', () => {
    const graph = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence('Me ajuda, por favor.').meaningGraph;
    expect(graph.attributes).toContainEqual(expect.objectContaining({ role: 'polite', value: '+' }));
  });

  it('preserva o papel locativo depois de expandir uma contração', () => {
    const graph = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence('Nós estudamos na escola.').meaningGraph;
    const school = graph.nodes.find((node) => node.concept === 'escola');
    expect(school).toBeDefined();
    expect(graph.edges.some((edge) => edge.to === school!.id && edge.role === 'LOC')).toBe(true);
  });

  it('não cria pronome espúrio ao expandir crase temporal', () => {
    const graph = new SemanticEngine(createInitialKnowledgeBase()).analyzeSentence('A lua brilha à noite.').meaningGraph;
    expect(graph.nodes.some((node) => node.concept === 'ela')).toBe(false);
    expect(graph.edges.some((edge) => edge.role === 'TIME' && graph.nodes.find((node) => node.id === edge.to)?.concept === 'noite')).toBe(true);
  });

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
    const senseFailures: string[] = [];
    for (const sentence of sentences) {
      const actual = engine.analyzeSentence(sentence.text).meaningGraph;
      const f1 = smatchF1(actual.penman, sentence.meaningGraph);
      sum += f1;
      if (f1 === 1) exact++;
      else failures.push(`${sentence.id}:${f1.toFixed(3)}`);
      const expectedSense = sentence.meaningGraph.match(/[\p{L}]+\.[A-Z_]+/u)?.[0];
      if (!expectedSense || actual.nodes.some((node) => node.concept === expectedSense)) senses++;
      else senseFailures.push(`${sentence.id}:${expectedSense}→${actual.nodes.map((node) => node.concept).join('/')}`);
    }
    console.info('Grafo', 'Smatch médio', sum / sentences.length, 'exatos', exact, '/', sentences.length,
      'sentidos', senses, '/', sentences.length, 'falhas:', failures.join(', '), 'sentidos errados:', senseFailures.join(', '));
    expect(sum / sentences.length).toBeGreaterThanOrEqual(0.85);
    expect(exact / sentences.length).toBeGreaterThanOrEqual(0.70);
    expect(senses / sentences.length).toBeGreaterThanOrEqual(0.90);
  });

  it('mede grafos e sentidos nas vinte frases extras', () => {
    const engine = new SemanticEngine(createInitialKnowledgeBase());
    const entries = (extras as { sentences: Array<{ text: string; meaningGraph: string }> }).sentences;
    let sum = 0;
    let exact = 0;
    let senses = 0;
    const failures: string[] = [];
    const senseFailures: string[] = [];
    for (let index = 0; index < entries.length; index++) {
      const sentence = entries[index];
      const graph = engine.analyzeSentence(sentence.text).meaningGraph;
      const f1 = smatchF1(graph.penman, sentence.meaningGraph);
      sum += f1;
      if (f1 === 1) exact++;
      else failures.push(`extra-${String(index + 1).padStart(3, '0')}:${f1.toFixed(3)}`);
      const expectedSense = sentence.meaningGraph.match(/[\p{L}]+\.[A-Z_]+/u)?.[0];
      if (!expectedSense || graph.nodes.some((node) => node.concept === expectedSense)) senses++;
      else senseFailures.push(`extra-${String(index + 1).padStart(3, '0')}:${expectedSense}`);
    }
    console.info('Grafo extras', 'Smatch médio', sum / entries.length, 'exatos', exact, '/', entries.length, 'sentidos', senses, '/', entries.length, 'falhas:', failures.join(', '), 'sentidos errados:', senseFailures.join(', '));
    expect(entries.length).toBe(20);
  });
});
