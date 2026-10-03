import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KnowledgeBaseStore } from '../src/knowledge/KnowledgeBaseStore';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { treeSignature } from '../src/eval/signatures';

/** Armazenamento em memória que pode ser instruído a falhar. */
function fakeStorage(failing = false): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => {
      if (failing) throw new Error('storage indisponível');
      return map.get(k) ?? null;
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => {
      if (failing) throw new Error('quota excedida');
      map.set(k, v);
    }
  } as Storage;
}

describe('A10 — persistência do painel', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('persiste e restaura a base entre instâncias', () => {
    vi.stubGlobal('localStorage', fakeStorage());

    const first = new KnowledgeBaseStore();
    const before = first.kb.surfaceForms.length;
    first.addSurfaceForm({
      id: 'SF_PERSIST',
      rawText: 'persistente',
      lexemeId: 'LEX_BOTAO',
      formType: 'CANONICAL'
    });
    first.updateSettings({ approximateMinSimilarity: 0.42 });

    const second = new KnowledgeBaseStore();
    expect(second.kb.surfaceForms.some((s) => s.id === 'SF_PERSIST')).toBe(true);
    expect(second.kb.surfaceForms.length).toBe(before + 1);
    expect(second.settings.approximateMinSimilarity).toBe(0.42);
  });

  it('persiste o conjunto de treinamento', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const first = new KnowledgeBaseStore();
    first.addTrainingRecord({
      input: 'crie uma caixa',
      expectedAst: 'CREATE',
      expectedPlan: 'CREATE_NODE',
      expectedDiagnostics: [],
      source: 'manual'
    });

    const second = new KnowledgeBaseStore();
    expect(second.training).toHaveLength(first.training.length);
    expect(second.training.some((t) => t.input === 'crie uma caixa')).toBe(true);
  });

  it('funciona quando o storage falha (modo memória)', () => {
    vi.stubGlobal('localStorage', fakeStorage(true));

    expect(() => {
      const store = new KnowledgeBaseStore();
      store.addSurfaceForm({
        id: 'SF_X',
        rawText: 'x',
        lexemeId: 'LEX_BOTAO',
        formType: 'CANONICAL'
      });
    }).not.toThrow();

    const store = new KnowledgeBaseStore();
    expect(store.lastPersistError).not.toBeNull();
    expect(store.kb.surfaceForms.length).toBeGreaterThan(0);
  });

  it('funciona quando localStorage não existe', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => new KnowledgeBaseStore()).not.toThrow();
  });

  it('restaura o padrão de fábrica', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const store = new KnowledgeBaseStore();
    store.addSurfaceForm({
      id: 'SF_TMP',
      rawText: 'temporario',
      lexemeId: 'LEX_BOTAO',
      formType: 'CANONICAL'
    });
    expect(store.kb.surfaceForms.some((s) => s.id === 'SF_TMP')).toBe(true);

    store.restoreFactoryDefaults();
    expect(store.kb.surfaceForms.some((s) => s.id === 'SF_TMP')).toBe(false);
    expect(store.training).toEqual([]);
  });

  it('dados corrompidos no storage não quebram o painel', () => {
    const storage = fakeStorage();
    storage.setItem('lexical.knowledgeBase.v1', '{ isso não é json');
    vi.stubGlobal('localStorage', storage);

    const store = new KnowledgeBaseStore();
    expect(store.kb.surfaceForms.length).toBeGreaterThan(0);
    expect(store.lastRestoreError).toContain('Falha ao restaurar');
  });
});

describe('A10 — validação de integridade', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('a base inicial é íntegra', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const store = new KnowledgeBaseStore();
    expect(store.validate()).toEqual([]);
    expect(store.integrityOk()).toBe(true);
  });

  it('detecta lexema apontando para conceito inexistente', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const store = new KnowledgeBaseStore();
    store.addLexeme({
      id: 'LEX_QUEBRADO',
      lemma: 'quebrado',
      pos: 'NOUN',
      senseConceptIds: ['C_NAO_EXISTE']
    });
    const issues = store.validate();
    expect(issues.some((i) => i.severity === 'ERROR' && i.message.includes('C_NAO_EXISTE'))).toBe(true);
    expect(store.integrityOk()).toBe(false);
  });

  it('detecta MWE duplicada', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const store = new KnowledgeBaseStore();
    store.addMultiword({ id: 'MWE_DUP', phrase: 'dentro de', conceptId: 'C_SPAT_INSIDE' });
    expect(store.validate().some((i) => i.message.includes('duplicada'))).toBe(true);
  });

  it('detecta SurfaceForm apontando para lexema inexistente', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const store = new KnowledgeBaseStore();
    store.addSurfaceForm({
      id: 'SF_ORFA',
      rawText: 'orfa',
      lexemeId: 'LEX_INEXISTENTE',
      formType: 'CANONICAL'
    });
    expect(store.validate().some((i) => i.message.includes('LEX_INEXISTENTE'))).toBe(true);
  });
});

describe('A10 — edição completa reflete no motor', () => {
  beforeEach(() => vi.stubGlobal('localStorage', fakeStorage()));

  it('editar um conceito existente muda o comportamento do motor', () => {
    const store = new KnowledgeBaseStore();
    const engine = new SemanticEngine(store.kb, store.settings);

    engine.store.createNode('C_ENT_BUTTON');
    expect(engine.execute('mude o botão para azul').success).toBe(true);
    expect(
      treeSignature(engine.store.document, engine.knowledgeBase.concepts)
    ).toBe('C_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}');

    // Muda o literal do valor azul via painel.
    store.updateConcept('C_VAL_BLUE', { literal: '#0000ff' });
    engine.knowledgeBase = store.kb;
    engine.rebuild();
    engine.resetDocument();
    engine.store.createNode('C_ENT_BUTTON');
    engine.execute('mude o botão para azul');

    expect(
      treeSignature(engine.store.document, engine.knowledgeBase.concepts)
    ).toBe('C_ENT_BUTTON{C_PROP_BG_COLOR=#0000ff}');
  });

  it('editar uma regra de containment muda o que é aceito', () => {
    const store = new KnowledgeBaseStore();
    const engine = new SemanticEngine(store.kb, store.settings);

    expect(engine.execute('crie um botão dentro de um botão').success).toBe(false);

    // Passa a permitir botões dentro de botões (edição de regra pelo painel).
    // As duas pontas da regra precisam concordar: o pai aceita o filho e o
    // filho admite esse pai. É exatamente o que o painel edita.
    const button = store.kb.concepts['C_ENT_BUTTON'];
    if (button.kind === 'ENTITY') {
      store.updateConcept('C_ENT_BUTTON', {
        capabilities: {
          ...button.capabilities,
          canContainChildren: true,
          allowedChildConceptIds: ['C_ENT_BUTTON'],
          allowedParentConceptIds: [...(button.capabilities.allowedParentConceptIds ?? []), 'C_ENT_BUTTON']
        }
      });
    }
    engine.knowledgeBase = store.kb;
    engine.rebuild();

    const result = engine.execute('crie um botão dentro de um botão');
    expect(result.success, JSON.stringify(result.compile.diagnostics)).toBe(true);
    expect(
      treeSignature(engine.store.document, engine.knowledgeBase.concepts)
    ).toBe('C_ENT_BUTTON{}\n  C_ENT_BUTTON{}');
  });
});
