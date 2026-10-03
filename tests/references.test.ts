import { describe, it, expect } from 'vitest';
import { ReferenceResolver } from '../src/engine/document/ReferenceResolver';
import { BuilderStore } from '../src/builder/BuilderStore';
import type { SemanticSelector } from '../src/engine/ast/ast';
import type { Diagnostic } from '../src/engine/diagnostics';
import { DEFAULT_ENGINE_SETTINGS } from '../src/engine/EngineSettings';

function seededStore(): BuilderStore {
  const store = new BuilderStore();
  const c1 = store.createNode('C_ENT_CONTAINER');
  const b1 = store.createNode('C_ENT_BUTTON');
  b1 && store.setProperty(b1, 'C_PROP_BG_COLOR', '#2563eb');
  const b2 = store.createNode('C_ENT_BUTTON');
  b2 && (store.document.nodes.get(b2)!.text = 'Entrar');
  const b3 = store.createNode('C_ENT_BUTTON');
  store.place(b1, 'CHILD_OF', c1);
  store.place(b2, 'CHILD_OF', c1);
  void b3;
  return store;
}

function resolve(store: BuilderStore, sel: SemanticSelector, diagnostics?: Diagnostic[]): string[] {
  return new ReferenceResolver(store.document).resolveSelector(sel, {
    diagnostics,
    settings: DEFAULT_ENGINE_SETTINGS
  });
}

describe('ReferenceResolver — conceito vs instância', () => {
  it('resolve todas as instâncias de um tipo', () => {
    const store = seededStore();
    const ids = resolve(store, { entityConceptId: 'C_ENT_BUTTON', quantity: { mode: 'ALL' } });
    expect(ids).toHaveLength(3);
  });

  it('resolve ordinal', () => {
    const store = seededStore();
    const ids = resolve(store, {
      entityConceptId: 'C_ENT_BUTTON',
      ordinalIndex: 1,
      quantity: { mode: 'ONE' }
    });
    expect(ids).toHaveLength(1);
    expect(store.document.nodes.get(ids[0])?.text).toBe('Entrar');
  });

  it('resolve por texto', () => {
    const store = seededStore();
    const ids = resolve(store, {
      entityConceptId: 'C_ENT_BUTTON',
      textEquals: 'Entrar',
      quantity: { mode: 'ONE' }
    });
    expect(ids).toHaveLength(1);
  });

  it('resolve por parent', () => {
    const store = seededStore();
    const parent = resolve(store, { entityConceptId: 'C_ENT_CONTAINER', quantity: { mode: 'ONE' } });
    const ids = resolve(store, {
      entityConceptId: 'C_ENT_BUTTON',
      parent: { entityConceptId: 'C_ENT_CONTAINER', quantity: { mode: 'ONE' } },
      quantity: { mode: 'ALL' }
    });
    expect(ids).toHaveLength(2);
    void parent;
  });

  it('resolve exclusão', () => {
    const store = seededStore();
    const all = resolve(store, { entityConceptId: 'C_ENT_BUTTON', quantity: { mode: 'ALL' } });
    const ids = resolve(store, {
      entityConceptId: 'C_ENT_BUTTON',
      quantity: { mode: 'ALL' },
      exclusions: [{ entityConceptId: 'C_ENT_BUTTON', ordinalIndex: 0, quantity: { mode: 'ONE' } }]
    });
    expect(ids).toHaveLength(all.length - 1);
  });

  it('emite AMBIGUOUS_REFERENCE para seletor singular sem desambiguador', () => {
    const store = seededStore();
    const diags: Diagnostic[] = [];
    resolve(store, { entityConceptId: 'C_ENT_BUTTON', quantity: { mode: 'ONE' } }, diags);
    expect(diags.some((d) => d.code === 'AMBIGUOUS_REFERENCE')).toBe(true);
  });

  it('não emite ambiguidade quando há desambiguador (texto)', () => {
    const store = seededStore();
    const diags: Diagnostic[] = [];
    resolve(
      store,
      { entityConceptId: 'C_ENT_BUTTON', textEquals: 'Entrar', quantity: { mode: 'ONE' } },
      diags
    );
    expect(diags.some((d) => d.code === 'AMBIGUOUS_REFERENCE')).toBe(false);
  });
});
