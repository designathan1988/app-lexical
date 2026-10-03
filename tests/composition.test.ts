import { describe, it, expect } from 'vitest';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { treeSignature } from '../src/eval/signatures';

/**
 * Geração automática de variações combinatórias:
 * ações × entidades × propriedades × valores × quantidade × posição.
 *
 * O objetivo é detectar regras que só funcionam porque uma frase específica
 * estava prevista no conjunto de teste.
 */

const CREATE_VERBS = ['crie', 'criar', 'adicione', 'adicionar', 'coloque', 'botar'];
const ENTITIES = [
  { plural: false, word: 'caixa', concept: 'C_ENT_CONTAINER', article: 'uma' },
  { plural: false, word: 'botão', concept: 'C_ENT_BUTTON', article: 'um' },
  { plural: false, word: 'botao', concept: 'C_ENT_BUTTON', article: 'um' },
  { plural: false, word: 'texto', concept: 'C_ENT_TEXT', article: 'um' },
  { plural: true, word: 'botões', concept: 'C_ENT_BUTTON', article: 'dois' }
];

const COLORS = [
  { word: 'azul', literal: '#2563eb' },
  { word: 'vermelho', literal: '#dc2626' },
  { word: 'verde', literal: '#16a34a' },
  { word: 'amarelo', literal: '#eab308' },
  { word: 'preto', literal: '#000000' }
];

describe('Composição — CREATE: verbos × entidades', () => {
  const cases: Array<[string, string, string]> = [];
  for (const verb of CREATE_VERBS) {
    for (const ent of ENTITIES) {
      cases.push([
        `${verb} ${ent.plural ? '' : ent.article + ' '}${ent.word}`.trim(),
        ent.concept,
        `${verb} ${ent.word}`
      ]);
    }
  }

  it.each(cases)('«%s» cria %s', (phrase, concept, label) => {
    const e = new SemanticEngine(createInitialKnowledgeBase());
    const result = e.execute(phrase);
    expect(result.success, `${label} → ${JSON.stringify(result.compile.diagnostics)}`).toBe(true);
    const created = Array.from(e.store.document.nodes.values());
    expect(created).toHaveLength(phrase.includes('dois') ? 2 : 1);
    expect(created[0].entityConceptId).toBe(concept);
  });
});

describe('Composição — CREATE com cor', () => {
  const cases: Array<[string, string, string]> = [];
  for (const ent of ENTITIES.filter((x) => !x.plural)) {
    for (const color of COLORS) {
      cases.push([
        `crie ${ent.article} ${ent.word} ${color.word}`,
        color.literal,
        `${ent.word} ${color.word}`
      ]);
    }
  }

  it.each(cases)('«%s» → backgroundColor %s', (phrase, literal, label) => {
    const e = new SemanticEngine(createInitialKnowledgeBase());
    const result = e.execute(phrase);
    expect(result.success, `${label}`).toBe(true);
    const node = Array.from(e.store.document.nodes.values())[0];
    // TEXT tem binding padrão COLOR → color (texto), não backgroundColor.
    const expectedProp =
      node.entityConceptId === 'C_ENT_TEXT' ? 'C_PROP_TEXT_COLOR' : 'C_PROP_BG_COLOR';
    expect(node.properties[expectedProp]).toBe(literal);
  });
});

describe('Composição — UPDATE: propriedades × valores', () => {
  const cases: Array<[string, string, string]> = [
    ['deixe a borda azul', 'C_PROP_BORDER_COLOR', '#2563eb'],
    ['deixe a borda vermelha', 'C_PROP_BORDER_COLOR', '#dc2626'],
    ['deixe a borda com 2px', 'C_PROP_BORDER_WIDTH', '2px'],
    ['deixe a borda com 5px', 'C_PROP_BORDER_WIDTH', '5px'],
    ['deixe o fundo azul', 'C_PROP_BG_COLOR', '#2563eb'],
    ['deixe o fundo verde', 'C_PROP_BG_COLOR', '#16a34a']
  ];

  it.each(cases)('«%s» → %s = %s', (phrase, prop, value) => {
    const e = new SemanticEngine(createInitialKnowledgeBase());
    // Sem alvo explícito, a mutação recai sobre a SELEÇÃO ATUAL.
    const id = e.store.createNode('C_ENT_CONTAINER');
    e.store.setSelection([id]);

    const result = e.execute(phrase);
    expect(result.success, JSON.stringify(result.compile.diagnostics)).toBe(true);
    const node = e.store.document.nodes.get(id)!;
    expect(node.properties[prop]).toBe(value);
  });

  it('sem seleção, emite TARGET_NOT_FOUND em vez de inventar um alvo', () => {
    const e = new SemanticEngine(createInitialKnowledgeBase());
    e.store.createNode('C_ENT_CONTAINER');
    const result = e.execute('deixe a borda azul');
    expect(result.success).toBe(false);
    expect(result.compile.diagnostics.some((d) => d.code === 'TARGET_NOT_FOUND')).toBe(true);
  });
});

describe('Composição — quantidade × posição', () => {
  it('dois botões dentro da segunda caixa', () => {
    const e = new SemanticEngine(createInitialKnowledgeBase());
    e.execute('crie duas caixas');
    const result = e.execute('crie dois botões dentro da segunda caixa');
    expect(result.success).toBe(true);

    const boxes = Array.from(e.store.document.nodes.values()).filter(
      (n) => n.entityConceptId === 'C_ENT_CONTAINER'
    );
    expect(boxes[0].childIds).toHaveLength(0);
    expect(boxes[1].childIds).toHaveLength(2);
  });

  it('três caixas vermelhas', () => {
    const e = new SemanticEngine(createInitialKnowledgeBase());
    e.execute('adicione três caixas vermelhas');
    const tree = treeSignature(e.store.document, e.knowledgeBase.concepts);
    expect(tree.split('\n')).toHaveLength(3);
    expect(tree).toContain('C_PROP_BG_COLOR=#dc2626');
  });
});

describe('Composição — equivalência semântica', () => {
  it('formas equivalentes produzem a mesma árvore', () => {
    const variants = [
      'crie uma caixa azul com um botão vermelho dentro',
      'adicionar uma caixa azul com um botão vermelho dentro',
      'criar uma caixa azul e um botão vermelho dentro dela'
    ];

    const trees = variants.map((v) => {
      const e = new SemanticEngine(createInitialKnowledgeBase());
      e.execute(v);
      return treeSignature(e.store.document, e.knowledgeBase.concepts);
    });

    expect(trees[0]).toBe(trees[1]);
  });

  it('ordens sintáticas equivalentes produzem o mesmo resultado', () => {
    const e1 = new SemanticEngine(createInitialKnowledgeBase());
    e1.store.createNode('C_ENT_BUTTON');
    e1.execute('mude o botão para azul');

    const e2 = new SemanticEngine(createInitialKnowledgeBase());
    e2.store.createNode('C_ENT_BUTTON');
    e2.execute('mude para azul o botão');

    expect(treeSignature(e1.store.document, e1.knowledgeBase.concepts)).toBe(
      treeSignature(e2.store.document, e2.knowledgeBase.concepts)
    );
  });
});

describe('Composição — frases estruturalmente diferentes geram planos diferentes', () => {
  it('CREATE vs MOVE produzem planos distintos', () => {
    const e1 = new SemanticEngine(createInitialKnowledgeBase());
    e1.execute('crie uma caixa e um botão');

    const e2 = new SemanticEngine(createInitialKnowledgeBase());
    e2.store.createNode('C_ENT_CONTAINER');
    e2.store.createNode('C_ENT_BUTTON');
    e2.execute('coloque o botão dentro da caixa');

    expect(treeSignature(e1.store.document, e1.knowledgeBase.concepts)).not.toBe(
      treeSignature(e2.store.document, e2.knowledgeBase.concepts)
    );
  });
});
