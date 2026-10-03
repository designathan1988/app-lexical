import { describe, it, expect } from 'vitest';
import { BuilderStore } from '../src/builder/BuilderStore';
import { ReferenceResolver } from '../src/engine/document/ReferenceResolver';
import { DEFAULT_ENGINE_SETTINGS } from '../src/engine/EngineSettings';
import type { Diagnostic } from '../src/engine/diagnostics';

function seeded(): BuilderStore {
  const store = new BuilderStore();
  store.createNode('C_ENT_BUTTON');
  store.createNode('C_ENT_BUTTON');
  store.createNode('C_ENT_BUTTON');
  return store;
}

describe('A9 — relações espaciais por posição real', () => {
  it('sem rect, a ordem espacial cai na ordem do documento com INFO', () => {
    const store = seeded();
    const diagnostics: Diagnostic[] = [];
    const ids = new ReferenceResolver(store.document).resolveSelector(
      { entityConceptId: 'C_ENT_BUTTON', direction: 'RIGHTMOST', quantity: { mode: 'ONE' } },
      { diagnostics, settings: DEFAULT_ENGINE_SETTINGS }
    );
    expect(ids).toHaveLength(1);
    expect(diagnostics.some((d) => d.code === 'ORDER_FALLBACK')).toBe(true);
    // B4: sem rect, "da direita" é o ÚLTIMO na ordem do documento (o teste
    // anterior esperava o primeiro — ordem do Map, não ordem do documento).
    expect(ids[0]).toBe(Array.from(store.document.nodes.keys())[2]);
  });

  it('sem rect, "da esquerda" é o PRIMEIRO na ordem do documento', () => {
    const store = seeded();
    const diagnostics: Diagnostic[] = [];
    const ids = new ReferenceResolver(store.document).resolveSelector(
      { entityConceptId: 'C_ENT_BUTTON', direction: 'LEFTMOST', quantity: { mode: 'ONE' } },
      { diagnostics, settings: DEFAULT_ENGINE_SETTINGS }
    );
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe(Array.from(store.document.nodes.keys())[0]);
  });

  it('com rect, RIGHTMOST escolhe o nó mais à direita', () => {
    const store = seeded();
    const [a, b, c] = Array.from(store.document.nodes.keys());
    store.updateRects({
      [a]: { x: 300, y: 0, width: 50, height: 20 },
      [b]: { x: 10, y: 0, width: 50, height: 20 },
      [c]: { x: 150, y: 0, width: 50, height: 20 }
    });

    const ids = new ReferenceResolver(store.document).resolveSelector(
      { entityConceptId: 'C_ENT_BUTTON', direction: 'RIGHTMOST', quantity: { mode: 'ONE' } },
      { settings: DEFAULT_ENGINE_SETTINGS }
    );
    expect(ids).toEqual([a]);
  });

  it('LEFTMOST escolhe o nó mais à esquerda', () => {
    const store = seeded();
    const [a, b, c] = Array.from(store.document.nodes.keys());
    store.updateRects({
      [a]: { x: 300, y: 0, width: 50, height: 20 },
      [b]: { x: 10, y: 0, width: 50, height: 20 },
      [c]: { x: 150, y: 0, width: 50, height: 20 }
    });
    const ids = new ReferenceResolver(store.document).resolveSelector(
      { entityConceptId: 'C_ENT_BUTTON', direction: 'LEFTMOST', quantity: { mode: 'ONE' } },
      { settings: DEFAULT_ENGINE_SETTINGS }
    );
    expect(ids).toEqual([b]);
  });

  it('a medição de layout NÃO cria entrada no histórico de undo', () => {
    const store = seeded();
    const historyBefore = store.history().length;

    store.updateRects({
      node_1: { x: 0, y: 0, width: 10, height: 10 }
    });

    expect(store.history().length).toBe(historyBefore);
    expect(store.document.nodes.get('node_1')?.rect).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 10
    });
  });

  it('as direções são acessíveis por dados lexicais', () => {
    // As expressões existem como MWEs, não como código.
    const fs = require('node:fs') as typeof import('node:fs');
    const source = fs.readFileSync('src/knowledge/knowledgeBase.ts', 'utf8');
    expect(source).toContain('da direita');
    expect(source).toContain('da esquerda');
    expect(source).toContain('mais à direita');
    expect(source).toContain('mais à esquerda');
  });
});
