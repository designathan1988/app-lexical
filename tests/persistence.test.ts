import { describe, it, expect } from 'vitest';
import { createInitialKnowledgeBase, type KnowledgeBase } from '../src/knowledge/knowledgeBase';
import { KnowledgeBaseStore } from '../src/knowledge/KnowledgeBaseStore';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { runDataset } from '../src/eval/runner';
import { REGRESSION_DATASET } from '../src/eval/loader';
import { treeSignature, planSignature } from '../src/eval/signatures';
import { KNOWN_MORPH_FAILURES } from './known-failures';

describe('Persistência da base de conhecimento', () => {
  it('a base é 100% serializável em JSON (sem funções, Maps ou DOM)', () => {
    const kb = createInitialKnowledgeBase();
    const json = JSON.stringify(kb);
    expect(json).toBeTypeOf('string');

    const parsed = JSON.parse(json) as KnowledgeBase;
    expect(parsed.surfaceForms.length).toBe(kb.surfaceForms.length);
    expect(Object.keys(parsed.lexemes).length).toBe(Object.keys(kb.lexemes).length);
    expect(Object.keys(parsed.concepts).length).toBe(Object.keys(kb.concepts).length);
    expect(parsed.multiwords.length).toBe(kb.multiwords.length);

    // Nenhum valor é função.
    const walk = (v: unknown): void => {
      if (typeof v === 'function') throw new Error('função encontrada na base');
      if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(parsed);
  });

  it('round-trip JSON produz planos idênticos', () => {
    const kb = createInitialKnowledgeBase();
    const restored = JSON.parse(JSON.stringify(kb)) as KnowledgeBase;

    const e1 = new SemanticEngine(kb);
    const e2 = new SemanticEngine(restored);

    for (const c of REGRESSION_DATASET.records) {
      e1.store.reset();
      e2.store.reset();
      const r1 = e1.analyze(c.input);
      const r2 = e2.analyze(c.input);
      expect(planSignature(r1.plan)).toBe(planSignature(r2.plan));
    }
  });

  it('export/import do store preserva o comportamento do motor', () => {
    const store = new KnowledgeBaseStore();
    const json = store.exportJSON();

    const other = new KnowledgeBaseStore();
    other.importJSON(json);

    const report = runDataset(other.kb, REGRESSION_DATASET, 'regression');
    expect(report.passed).toBe(REGRESSION_DATASET.records.length - KNOWN_MORPH_FAILURES.size);
  });
});

describe('Versionamento da base', () => {
  it('captura e restaura versões', () => {
    const store = new KnowledgeBaseStore();
    const before = store.kb.surfaceForms.length;

    store.addSurfaceForm({
      id: 'SF_TESTE',
      rawText: 'teste',
      lexemeId: 'LEX_BOTAO',
      formType: 'CANONICAL'
    });
    expect(store.kb.surfaceForms.length).toBe(before + 1);

    const version = store.versions[0];
    store.restoreVersion(version.id);
    expect(store.kb.surfaceForms.length).toBe(before);
  });

  it('calcula diff entre versão e estado atual', () => {
    const store = new KnowledgeBaseStore();
    store.addSurfaceForm({
      id: 'SF_TESTE',
      rawText: 'teste',
      lexemeId: 'LEX_BOTAO',
      formType: 'CANONICAL'
    });
    const diff = store.diffVersion(store.versions[0].id);
    expect(diff.surfaceForms.after - diff.surfaceForms.before).toBe(1);
  });
});

describe('Adicionar dados pela base reflete no motor', () => {
  it('nova cor cadastrada passa a ser compreendida', () => {
    const store = new KnowledgeBaseStore();
    const engine = new SemanticEngine(store.kb);

    engine.resetDocument();
    const before = engine.execute('crie um botão rosa');
    // Antes do cadastro, "rosa" só é alcançada por palpite fonético — e isso
    // precisa ser reportado, nunca silencioso.
    // Sem cadastro, a forma é DESCONHECIDA: nada de interpretação inventada.
    expect(before.compile.diagnostics.some((d) => d.code === 'UNKNOWN_WORD')).toBe(true);
    expect(before.success).toBe(false);

    store.addConcept({
      kind: 'VALUE',
      id: 'C_VAL_PINK',
      valueCategory: 'COLOR',
      literal: '#ec4899'
    });
    store.addLexeme({
      id: 'LEX_ROSA',
      lemma: 'rosa',
      pos: 'ADJECTIVE',
      senseConceptIds: ['C_VAL_PINK']
    });
    store.addSurfaceForm({
      id: 'SF_ROSA',
      rawText: 'rosa',
      lexemeId: 'LEX_ROSA',
      formType: 'CANONICAL'
    });

    engine.knowledgeBase = store.kb;
    engine.rebuild();

    engine.resetDocument();
    const after = engine.execute('crie um botão rosa');
    expect(after.success, JSON.stringify(after.compile.diagnostics)).toBe(true);
    // Agora resolve exatamente: sem recuperação aproximada.
    expect(after.compile.diagnostics.some((d) => d.code === 'PHONETIC_MATCH')).toBe(false);

    const node = Array.from(engine.store.document.nodes.values())[0];
    expect(node.properties['C_PROP_BG_COLOR']).toBe('#ec4899');
  });

  it('nova MWE passa a ser reconhecida atomicamente', () => {
    const store = new KnowledgeBaseStore();
    const engine = new SemanticEngine(store.kb);

    store.addMultiword({
      id: 'MWE_BELOW_ALT',
      phrase: 'logo abaixo de',
      conceptId: 'C_SPAT_BELOW'
    });
    engine.knowledgeBase = store.kb;
    engine.rebuild();

    engine.execute('crie uma caixa');
    engine.execute('crie um botão logo abaixo de uma caixa');

    const box = Array.from(engine.store.document.nodes.values()).find(
      (n) => n.entityConceptId === 'C_ENT_CONTAINER'
    )!;
    const tree = treeSignature(engine.store.document, engine.knowledgeBase.concepts);
    expect(tree.indexOf('C_ENT_CONTAINER')).toBeLessThan(tree.indexOf('C_ENT_BUTTON'));
    void box;
  });
});

