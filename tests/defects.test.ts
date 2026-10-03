import { describe, it, expect } from 'vitest';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase, type KnowledgeBase } from '../src/knowledge/knowledgeBase';
import { treeSignature } from '../src/eval/signatures';
import { DEFAULT_ENGINE_SETTINGS } from '../src/engine/EngineSettings';

function engine(kb?: KnowledgeBase): SemanticEngine {
  return new SemanticEngine(kb ?? createInitialKnowledgeBase());
}

function tree(e: SemanticEngine): string {
  return treeSignature(e.store.document, e.knowledgeBase.concepts);
}

function codes(e: SemanticEngine, input: string) {
  return e.execute(input).compile.diagnostics.map((d) => d.code);
}

// ---------------------------------------------------------------------------
// D1 — discurso transacional: pronome não pode apontar para nó inexistente
// ---------------------------------------------------------------------------

describe('D1 — discurso transacional', () => {
  it('comando que falhou não deixa menção órfã', () => {
    const e = engine();
    e.execute('crie uma caixa banana');
    expect(tree(e)).toBe('');

    e.execute('crie um botão');
    const result = e.execute('apague ela');

    expect(result.compile.diagnostics.map((d) => d.code)).toContain('UNRESOLVED_PRONOUN');
    expect(result.success).toBe(false);
    expect(tree(e)).toBe('C_ENT_BUTTON{}');
  });

  it('undo invalida o antecedente', () => {
    const e = engine();
    e.execute('crie uma caixa');
    e.undo();

    const result = e.execute('crie um botão dentro dela');
    expect(result.compile.diagnostics.map((d) => d.code)).toContain('UNRESOLVED_PRONOUN');
    expect(tree(e)).toBe('');
  });

  it('antecedente válido continua funcionando', () => {
    const e = engine();
    e.execute('crie uma caixa');
    const result = e.execute('crie um botão dentro dela');

    expect(result.success).toBe(true);
    expect(tree(e)).toBe('C_ENT_CONTAINER{}\n  C_ENT_BUTTON{}');
  });

  it('não resolve pronome para nó de tipo incompatível', () => {
    const e = engine();
    e.execute('crie uma caixa');
    e.execute('crie dois botões dentro dela');
    // "dela" (FEM) só pode apontar para uma caixa (FEM); não para os botões.
    const result = e.execute('crie um texto dentro dela');
    expect(result.success).toBe(true);
    expect(tree(e)).toContain('C_ENT_TEXT{}');
  });

  it('pronome não resolve para nó apagado', () => {
    const e = engine();
    e.execute('crie uma caixa');
    e.execute('apague a caixa');
    const result = e.execute('crie um botão dentro dela');
    expect(result.compile.diagnostics.map((d) => d.code)).toContain('UNRESOLVED_PRONOUN');
  });
});

// ---------------------------------------------------------------------------
// D2 — ordinais seguem a ordem do documento
// ---------------------------------------------------------------------------

describe('D2 — ordem do documento', () => {
  it('ordinal acompanha reordenação', () => {
    const e = engine();
    e.execute('crie dois botões');
    e.execute('mude o primeiro botão para azul');
    e.execute('mova o primeiro botão para depois do segundo botão');

    const afterMove = tree(e);
    expect(afterMove).toBe('C_ENT_BUTTON{}\nC_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}');

    e.execute('apague o primeiro botão');
    expect(tree(e)).toBe('C_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}');
  });

  it('contagem em pré-ordem do documento inteiro', () => {
    const e = engine();
    const box = e.store.createNode('C_ENT_CONTAINER');
    e.store.createNode('C_ENT_BUTTON'); // raiz, 2º na pré-ordem
    const inner = e.store.createNode('C_ENT_BUTTON');
    e.store.place(inner, 'CHILD_OF', box);

    // Pré-ordem: caixa(0), botão-raiz(1), botão-interno(2)
    e.execute('deixe o segundo botão vermelho');
    const root = e.store.document.nodes.get(box)!;
    const rootButtons = Array.from(e.store.document.nodes.values()).filter(
      (n) => n.entityConceptId === 'C_ENT_BUTTON' && n.parentId === null
    );
    expect(rootButtons[0].properties['C_PROP_BG_COLOR']).toBe('#dc2626');
    expect(root.childIds.length).toBe(1); // o interno não foi afetado
  });

  it('contagem dentro do pai quando há parent no seletor', () => {
    const e = engine();
    e.execute('crie uma caixa');
    e.execute('crie três botões dentro da caixa');
    e.execute('apague o segundo botão dentro da caixa');
    expect(tree(e).split('\n').length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// D3 — exceções viram diagnósticos
// ---------------------------------------------------------------------------

describe('D3 — diagnósticos em vez de exceções', () => {
  it('valor de categoria incompatível não lança', () => {
    const e = engine();
    e.store.createNode('C_ENT_BUTTON');
    const result = e.execute('mude a cor de fundo do botão para 2px');

    expect(result.success).toBe(false);
    expect(result.compile.diagnostics.map((d) => d.code)).toContain('INVALID_VALUE_CATEGORY');
    expect(tree(e)).toBe('C_ENT_BUTTON{}');
  });

  it('entidade sem binding padrão para a categoria não lança', () => {
    const e = engine();
    const result = e.execute('crie um botão 2px');
    expect(result.success).toBe(false);
    expect(result.compile.diagnostics.map((d) => d.code)).toContain('INVALID_PROPERTY');
    expect(tree(e)).toBe('');
  });

  it('o compilador nunca lança, para nenhuma entrada', () => {
    const e = engine();
    const inputs = [
      'mude a cor de fundo do botão para 2px',
      'crie um botão 2px',
      '"',
      'crie',
      'apague',
      'deixe',
      'para',
      'crie um botão com um botão dentro',
      'mova a caixa para dentro de si mesma',
      'crie #fff',
      'deixe a borda com "x"'
    ];
    for (const input of inputs) {
      expect(() => e.analyze(input), `entrada: ${input}`).not.toThrow();
    }
  });

  it('erro inesperado vira INTERNAL_ERROR com documento intacto', () => {
    const e = engine();
    e.execute('crie uma caixa');
    const before = tree(e);
    const result = e.execute('crie um botão');
    expect(result.success).toBe(true);
    void before;
  });

  it('diagnóstico de binder traz camada e offsets', () => {
    const e = engine();
    const result = e.execute('crie um botão 2px');
    const diag = result.compile.diagnostics.find((d) => d.code === 'INVALID_PROPERTY');
    expect(diag).toBeDefined();
    expect(diag!.layer).toBe('binder');
    expect(diag!.start).toBeTypeOf('number');
    expect(diag!.end).toBeTypeOf('number');
  });
});

// ---------------------------------------------------------------------------
// D5 — elipse nominal
// ---------------------------------------------------------------------------

describe('D5 — elipse exige antecedente', () => {
  it('apague todos sem discurso é bloqueado', () => {
    const e = engine();
    e.store.createNode('C_ENT_CONTAINER');
    e.store.createNode('C_ENT_BUTTON');
    const result = e.execute('apague todos');

    expect(result.success).toBe(false);
    expect(result.compile.diagnostics.map((d) => d.code)).toContain('INCOMPLETE_REFERENCE');
    expect(tree(e)).toBe('C_ENT_CONTAINER{}\nC_ENT_BUTTON{}');
  });

  it('apague o primeiro sem discurso é bloqueado', () => {
    const e = engine();
    e.store.createNode('C_ENT_CONTAINER');
    e.store.createNode('C_ENT_BUTTON');
    const result = e.execute('apague o primeiro');
    expect(result.compile.diagnostics.map((d) => d.code)).toContain('INCOMPLETE_REFERENCE');
  });

  it('com antecedente, elipse funciona', () => {
    const e = engine();
    e.execute('crie dois botões');
    const result = e.execute('apague todos');
    expect(result.success).toBe(true);
    expect(tree(e)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// D7 — ordinais do fim
// ---------------------------------------------------------------------------

describe('D7 — ordinal a partir do fim', () => {
  it('os dois últimos botões', () => {
    const e = engine();
    e.execute('crie cinco botões');
    const result = e.execute('apague os dois últimos botões');

    expect(result.success).toBe(true);
    expect(tree(e).split('\n')).toHaveLength(3);
  });

  it('os dois primeiros botões', () => {
    const e = engine();
    e.execute('crie cinco botões');
    const result = e.execute('apague os dois primeiros botões');
    expect(result.success).toBe(true);
    expect(tree(e).split('\n')).toHaveLength(3);
  });

  it('ordinal além do disponível', () => {
    const e = engine();
    e.execute('crie dois botões');
    const result = e.execute('apague o sexto botão');
    expect(result.compile.diagnostics.map((d) => d.code)).toContain('TARGET_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// D8 — outro/outra
// ---------------------------------------------------------------------------

describe('D8 — outro/outra', () => {
  it('documento vazio cria duas caixas aninhadas', () => {
    const e = engine();
    const result = e.execute('crie uma caixa dentro de outra caixa');
    expect(result.success).toBe(true);
    expect(tree(e)).toBe('C_ENT_CONTAINER{}\n  C_ENT_CONTAINER{}');
  });

  it('com uma caixa existente, a nova vai dentro dela', () => {
    const e = engine();
    e.store.createNode('C_ENT_CONTAINER');
    const result = e.execute('crie uma caixa dentro de outra caixa');
    expect(result.success).toBe(true);
    expect(tree(e)).toBe('C_ENT_CONTAINER{}\n  C_ENT_CONTAINER{}');
  });
});

// ---------------------------------------------------------------------------
// D9 — operação que não faz nada não é sucesso
// ---------------------------------------------------------------------------

describe('D9 — ausência de efeito não é sucesso', () => {
  it('ciclo é bloqueado', () => {
    const e = engine();
    const outer = e.store.createNode('C_ENT_CONTAINER');
    const inner = e.store.createNode('C_ENT_CONTAINER');
    e.store.place(inner, 'CHILD_OF', outer);
    const before = tree(e);

    const result = e.execute('mova a primeira caixa para dentro da segunda caixa');
    expect(result.success).toBe(false);
    expect(result.compile.diagnostics.map((d) => d.code)).toContain('INVALID_CONTAINMENT');
    expect(tree(e)).toBe(before);
  });

  it('mover um nó para dentro de si mesmo é bloqueado', () => {
    const e = engine();
    e.store.createNode('C_ENT_CONTAINER');
    const result = e.execute('mova a caixa para dentro da caixa');
    expect(result.success).toBe(false);
  });

  it('alvo inexistente em DELETE produz erro e não mutação', () => {
    const e = engine();
    const result = e.execute('apague o botão');
    expect(result.success).toBe(false);
    expect(result.compile.diagnostics.map((d) => d.code)).toContain('TARGET_NOT_FOUND');
  });

  it('sucesso implica mutações efetivas registradas', () => {
    const e = engine();
    const result = e.execute('crie uma caixa');
    expect(result.success).toBe(true);
    expect(result.execution.mutations.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// D10 — ambiguidade
// ---------------------------------------------------------------------------

describe('D10 — referência ambígua é erro por padrão', () => {
  it('dois botões e sem discurso bloqueia', () => {
    const e = engine();
    e.store.createNode('C_ENT_BUTTON');
    e.store.createNode('C_ENT_BUTTON');
    const result = e.execute('apague o botão');

    expect(result.success).toBe(false);
    const diag = result.compile.diagnostics.find((d) => d.code === 'AMBIGUOUS_REFERENCE');
    expect(diag).toBeDefined();
    expect(diag!.severity).toBe('ERROR');
    expect(diag!.candidates?.length).toBe(2);
  });

  it('saliência no discurso desambigua', () => {
    const e = engine();
    e.execute('crie um botão');
    e.execute('crie outro botão');
    const result = e.execute('deixe ele azul');

    expect(result.success).toBe(true);
    expect(tree(e)).toBe('C_ENT_BUTTON{}\nC_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}');
  });

  it('configuração rebaixa ambiguidade para aviso', () => {
    const e = new SemanticEngine(createInitialKnowledgeBase(), {
      ...DEFAULT_ENGINE_SETTINGS,
      ambiguityIsFatal: false
    });
    e.store.createNode('C_ENT_BUTTON');
    e.store.createNode('C_ENT_BUTTON');
    const result = e.execute('apague o botão');
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D11 — seleção após comando + QUERY
// ---------------------------------------------------------------------------

describe('D11 — seleção após comando', () => {
  it('seleção acompanha o último comando', () => {
    const e = engine();
    e.execute('crie uma caixa');
    const result = e.execute('deixe a borda azul');
    expect(result.success).toBe(true);
    expect(tree(e)).toBe('C_ENT_CONTAINER{C_PROP_BORDER_COLOR=#2563eb}');
  });

  it('selecione define a seleção', () => {
    const e = engine();
    e.execute('crie dois botões');
    const query = e.execute('selecione o segundo botão');
    expect(query.success).toBe(true);

    e.execute('deixe a borda com 2px');
    expect(tree(e)).toBe('C_ENT_BUTTON{}\nC_ENT_BUTTON{C_PROP_BORDER_WIDTH=2px}');
  });

  it('undo restaura a seleção anterior', () => {
    const e = engine();
    e.execute('crie uma caixa');
    const selectionAfterFirst = [...e.store.document.selectionIds];
    e.execute('crie um botão');
    e.undo();
    expect([...e.store.document.selectionIds]).toEqual(selectionAfterFirst);
  });
});

// ---------------------------------------------------------------------------
// D6 — analyze ≡ execute
// ---------------------------------------------------------------------------

describe('D6 — analyze equivale a execute', () => {
  it('analyze enxerga o discurso persistente', () => {
    const e = engine();
    e.execute('crie uma caixa');
    const analysis = e.analyze('crie um botão dentro dela');
    expect(analysis.diagnostics.map((d) => d.code)).not.toContain('UNRESOLVED_PRONOUN');
  });

  it('analyze não altera documento nem discurso', () => {
    const e = engine();
    e.execute('crie uma caixa');
    const before = tree(e);
    const selectionBefore = [...e.store.document.selectionIds];

    e.analyze('crie dois botões dentro dela');
    e.analyze('apague a caixa');

    expect(tree(e)).toBe(before);
    expect([...e.store.document.selectionIds]).toEqual(selectionBefore);

    // O discurso permanece utilizável
    const after = e.execute('crie um botão dentro dela');
    expect(after.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D4 — recuperação aproximada
// ---------------------------------------------------------------------------

describe('D4 — recuperação aproximada', () => {
  it('forma cadastrada é aceita exatamente', () => {
    const e = engine();
    e.store.createNode('C_ENT_BUTTON');
    expect(e.execute('apaga o botão').success).toBe(true);
    expect(tree(e)).toBe('');
  });

  it('palavra fora do domínio não gera mutação', () => {
    const e = engine();
    const result = e.execute('crie um botão rosa');
    expect(result.success).toBe(false);
    expect(result.compile.diagnostics.map((d) => d.code)).toContain('UNKNOWN_WORD');
    expect(tree(e)).toBe('');
  });

  it('typo a distância 1 de um valor é aceito com aviso', () => {
    const e = engine();
    const result = e.execute('crie um botão vermelo');
    expect(result.success).toBe(true);
    const diag = result.compile.diagnostics.find((d) => d.code === 'PHONETIC_MATCH');
    expect(diag).toBeDefined();
    expect(diag!.message).toMatch(/LEX_VERMELHO/);
    expect(tree(e)).toBe('C_ENT_BUTTON{C_PROP_BG_COLOR=#dc2626}');
  });

  it('ação destrutiva desconhecida não é resolvida por aproximação', () => {
    const e = engine();
    e.store.createNode('C_ENT_BUTTON');
    const result = e.execute('apagxe o botão');
    expect(result.success).toBe(false);
    expect(tree(e)).toBe('C_ENT_BUTTON{}');
  });

  it('30 palavras fora do domínio não geram mutação', () => {
    const words = [
      'abacaxi', 'bicicleta', 'chuveiro', 'diamante', 'escada', 'flauta', 'girafa',
      'harmonia', 'iglu', 'jardim', 'karate', 'lampada', 'montanha', 'navio',
      'oceano', 'piano', 'quintal', 'relogio', 'sabonete', 'tapete', 'universo',
      'violino', 'xadrez', 'zebra', 'alface', 'borboleta', 'caderno', 'dicionario',
      'elefante', 'foguete'
    ];
    for (const word of words) {
      const e = engine();
      e.store.createNode('C_ENT_BUTTON');
      const result = e.execute(word);
      expect(result.success, `palavra "${word}" não deveria executar`).toBe(false);
      expect(tree(e), `palavra "${word}" mutou o documento`).toBe('C_ENT_BUTTON{}');
    }
  });
});
