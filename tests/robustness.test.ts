import { describe, it, expect } from 'vitest';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { DEFAULT_ENGINE_SETTINGS } from '../src/engine/EngineSettings';
import { treeSignature } from '../src/eval/signatures';
import { LexicalIndex } from '../src/engine/lexical/LexicalIndex';

function engine(settings = DEFAULT_ENGINE_SETTINGS): SemanticEngine {
  return new SemanticEngine(createInitialKnowledgeBase(), settings);
}

describe('Robustez de entrada', () => {
  it('aceita falta de acento', () => {
    const e = engine();
    e.execute('crie uma caixa azul com um botao vermelho dentro');
    expect(e.store.document.nodes.size).toBe(2);
  });

  it('aceita maiúsculas', () => {
    const e = engine();
    e.execute('CRIE UMA CAIXA AZUL');
    const tree = treeSignature(e.store.document, e.knowledgeBase.concepts);
    expect(tree).toBe('C_ENT_CONTAINER{C_PROP_BG_COLOR=#2563eb}');
  });

  it('aceita espaços extras', () => {
    const e = engine();
    e.execute('  crie    uma   caixa    azul  ');
    expect(e.store.document.nodes.size).toBe(1);
  });

  it('aceita pontuação final', () => {
    const e = engine();
    e.execute('crie uma caixa azul.');
    expect(e.store.document.nodes.size).toBe(1);
  });

  it('aceita erro ortográfico cadastrado (asul)', () => {
    const e = engine();
    e.execute('crie um botão asul');
    const tree = treeSignature(e.store.document, e.knowledgeBase.concepts);
    expect(tree).toBe('C_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}');
  });

  it('aceita sinônimos (adicionar/colocar/botar/fazer)', () => {
    for (const verb of ['adicionar', 'botar', 'fazer']) {
      const e = engine();
      e.execute(`${verb} uma caixa`);
      expect(e.store.document.nodes.size).toBe(1);
    }
  });

  it('aceita formas verbais flexionadas', () => {
    const e = engine();
    e.execute('adicione uma caixa');
    e.execute('mude a caixa para vermelho');
    const tree = treeSignature(e.store.document, e.knowledgeBase.concepts);
    expect(tree).toBe('C_ENT_CONTAINER{C_PROP_BG_COLOR=#dc2626}');
  });

  it('suporta frases mais longas com múltiplas propriedades', () => {
    const e = engine();
    e.execute('crie uma caixa azul com um botão vermelho dentro');
    e.execute('deixe a borda do botão com 3px');
    const btn = Array.from(e.store.document.nodes.values()).find(
      (n) => n.entityConceptId === 'C_ENT_BUTTON'
    )!;
    expect(btn.properties['C_PROP_BORDER_WIDTH']).toBe('3px');
  });

  it('suporta relações encadeadas', () => {
    const e = engine();
    e.execute('crie uma caixa e um botão ao lado dela');
    e.execute('crie outra caixa depois do botão');
    expect(e.store.document.nodes.size).toBe(3);
  });

  it('não interpreta palavra desconhecida como comando perigoso', () => {
    const e = engine();
    e.execute('crie uma caixa');
    const before = treeSignature(e.store.document, e.knowledgeBase.concepts);

    const result = e.execute('apagatrix deletarium caixa');
    expect(result.success).toBe(false);
    expect(treeSignature(e.store.document, e.knowledgeBase.concepts)).toBe(before);
    expect(result.compile.diagnostics.some((d) => d.code === 'UNKNOWN_WORD')).toBe(true);
  });
});

describe('Fuzzy matching não é permissivo demais', () => {
  it('rejeita candidato fonético quando a recuperação está desabilitada', () => {
    const kb = createInitialKnowledgeBase();
    const index = new LexicalIndex(kb.surfaceForms, kb.lexemes, {
      ...DEFAULT_ENGINE_SETTINGS,
      approximateEnabled: false
    });
    expect(index.resolve('asull')).toHaveLength(0);
  });

  it('aceita candidato fonético quando habilitada (caso conhecido)', () => {
    const kb = createInitialKnowledgeBase();
    const index = new LexicalIndex(kb.surfaceForms, kb.lexemes, DEFAULT_ENGINE_SETTINGS);
    const c = index.approximateCandidates('asull')[0];
    expect(c?.lexeme.id).toBe('LEX_AZUL');
    expect(c?.source).toBe('PHONETIC');
  });
});

describe('Configurações do motor', () => {
  it('ambiguidade fatal bloqueia a execução', () => {
    const kb = createInitialKnowledgeBase();
    const e = new SemanticEngine(kb, {
      ...DEFAULT_ENGINE_SETTINGS,
      ambiguityIsFatal: true
    });
    e.store.createNode('C_ENT_BUTTON');
    e.store.createNode('C_ENT_BUTTON');

    const result = e.execute('mude o botão para azul');
    expect(result.success).toBe(false);
    const btn = Array.from(e.store.document.nodes.values())[0];
    expect(btn.properties['C_PROP_BG_COLOR']).toBeUndefined();
  });

  it('ambiguidade não-fatal executa com aviso', () => {
    const kb = createInitialKnowledgeBase();
    const e = new SemanticEngine(kb, { ...DEFAULT_ENGINE_SETTINGS, ambiguityIsFatal: false });
    e.store.createNode('C_ENT_BUTTON');
    e.store.createNode('C_ENT_BUTTON');

    const result = e.execute('mude o botão para azul');
    expect(result.success, JSON.stringify(result.compile.diagnostics)).toBe(true);
    expect(result.compile.diagnostics.some((d) => d.code === 'AMBIGUOUS_REFERENCE')).toBe(true);
  });

  it('desabilitar aviso de ambiguidade suprime o diagnóstico', () => {
    const kb = createInitialKnowledgeBase();
    const e = new SemanticEngine(kb, {
      ...DEFAULT_ENGINE_SETTINGS,
      ambiguityWarningEnabled: false
    });
    e.store.createNode('C_ENT_BUTTON');
    e.store.createNode('C_ENT_BUTTON');

    const result = e.execute('mude o botão para azul');
    expect(result.success).toBe(true);
    expect(result.compile.diagnostics.some((d) => d.code === 'AMBIGUOUS_REFERENCE')).toBe(false);
  });
});

describe('Coreferência entre comandos', () => {
  it('pronome resolve para nó criado em comando anterior', () => {
    const e = engine();
    e.execute('crie uma caixa');
    e.execute('crie um botão dentro dela');
    const box = Array.from(e.store.document.nodes.values()).find(
      (n) => n.entityConceptId === 'C_ENT_CONTAINER'
    )!;
    expect(box.childIds).toHaveLength(1);
  });

  it('referência direcionada a nó específico em comandos subsequentes', () => {
    const e = engine();
    e.execute('crie dois botões');
    e.execute('mude o segundo para azul');
    const buttons = Array.from(e.store.document.nodes.values());
    expect(buttons[0].properties['C_PROP_BG_COLOR']).toBeUndefined();
    expect(buttons[1].properties['C_PROP_BG_COLOR']).toBe('#2563eb');
  });

  it('filtro por propriedade seleciona o nó correto', () => {
    const e = engine();
    e.execute('crie dois botões');
    e.execute('deixe o segundo azul');
    e.execute('apague o botão azul');
    const remaining = Array.from(e.store.document.nodes.values());
    expect(remaining).toHaveLength(1);
    expect(remaining[0].properties['C_PROP_BG_COLOR']).toBeUndefined();
  });
});
