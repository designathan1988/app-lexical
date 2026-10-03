import { describe, it, expect } from 'vitest';
import { BuilderStore } from '../src/builder/BuilderStore';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { treeSignature } from '../src/eval/signatures';

describe('BuilderStore (runtime real)', () => {
  it('cria, coloca, move e apaga nós', () => {
    const store = new BuilderStore();
    const box = store.createNode('C_ENT_CONTAINER');
    const b1 = store.createNode('C_ENT_BUTTON');
    const b2 = store.createNode('C_ENT_BUTTON');

    store.place(b1, 'CHILD_OF', box);
    store.place(b2, 'CHILD_OF', box);
    expect(store.document.nodes.get(box)!.childIds).toEqual([b1, b2]);

    store.deleteNode(b1);
    expect(store.document.nodes.has(b1)).toBe(false);
    expect(store.document.nodes.get(box)!.childIds).toEqual([b2]);
  });

  it('MOVE após um nó reordena irmãos', () => {
    const store = new BuilderStore();
    const a = store.createNode('C_ENT_BUTTON');
    const b = store.createNode('C_ENT_CONTAINER');
    store.place(a, 'AFTER', b);
    expect(store.document.rootIds).toEqual([b, a]);
  });

  it('prevenção de ciclos (não move pai para dentro do filho)', () => {
    const store = new BuilderStore();
    const box = store.createNode('C_ENT_CONTAINER');
    const btn = store.createNode('C_ENT_BUTTON');
    store.place(btn, 'CHILD_OF', box);
    store.place(box, 'CHILD_OF', btn); // deve ser no-op
    expect(store.document.nodes.get(btn)!.parentId).toBe(box);
    expect(store.document.nodes.get(box)!.parentId).toBeNull();
  });

  it('undo/redo desfaz e refaz uma transação inteira', () => {
    const store = new BuilderStore();
    store.beginTransaction('seed');
    const box = store.createNode('C_ENT_CONTAINER');
    store.commitTransaction();

    store.beginTransaction('crie botão');
    const btn = store.createNode('C_ENT_BUTTON');
    store.place(btn, 'CHILD_OF', box);
    store.setProperty(btn, 'C_PROP_BG_COLOR', '#2563eb');
    store.commitTransaction();

    expect(store.document.nodes.size).toBe(2);

    store.undo();
    expect(store.document.nodes.size).toBe(1);
    expect(store.document.nodes.has(btn)).toBe(false);

    store.redo();
    expect(store.document.nodes.size).toBe(2);
    expect(store.document.nodes.get(btn)?.properties).toEqual({
      C_PROP_BG_COLOR: '#2563eb'
    });
  });
});

describe('Execução end-to-end como transação', () => {
  it('DELETE realmente apaga; CREATE realmente cria; UPDATE realmente atualiza; MOVE realmente move', () => {
    const e = new SemanticEngine(createInitialKnowledgeBase());

    e.execute('crie uma caixa');
    expect(e.store.document.nodes.size).toBe(1);

    e.execute('crie dois botões dentro da caixa');
    expect(e.store.document.nodes.size).toBe(3);

    e.execute('deixe todos os botões azuis');
    const buttons = Array.from(e.store.document.nodes.values()).filter(
      (n) => n.entityConceptId === 'C_ENT_BUTTON'
    );
    expect(buttons.every((b) => b.properties['C_PROP_BG_COLOR'] === '#2563eb')).toBe(true);

    e.execute('apague o segundo botão');
    expect(e.store.document.nodes.size).toBe(2);

    e.execute('coloque o botão depois da caixa');
    const afterTree = treeSignature(e.store.document, e.knowledgeBase.concepts);
    expect(afterTree).toBe('C_ENT_CONTAINER{}\nC_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}');
  });

  it('undo desfaz um comando semântico como unidade', () => {
    const e = new SemanticEngine(createInitialKnowledgeBase());
    e.execute('crie uma caixa');
    const before = treeSignature(e.store.document, e.knowledgeBase.concepts);

    e.execute('crie uma caixa azul com um botão vermelho dentro');
    expect(e.store.document.nodes.size).toBe(3);

    const undone = e.undo();
    expect(undone).toBe(true);
    expect(treeSignature(e.store.document, e.knowledgeBase.concepts)).toBe(before);
    expect(e.store.document.nodes.size).toBe(1);
  });

  it('operação inválida não muta o documento (transação atômica)', () => {
    const e = new SemanticEngine(createInitialKnowledgeBase());
    e.execute('crie uma caixa');
    const before = treeSignature(e.store.document, e.knowledgeBase.concepts);

    const result = e.execute('crie um botão dentro de um botão');
    expect(result.success).toBe(false);
    expect(treeSignature(e.store.document, e.knowledgeBase.concepts)).toBe(before);
  });
});
