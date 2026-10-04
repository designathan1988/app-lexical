import { describe, expect, it } from 'vitest';
import { KnowledgeBaseStore } from '../src/knowledge/KnowledgeBaseStore';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { KB_DATA_VERSION } from '../src/knowledge/migrateKnowledgeBase';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { buildNetworkView } from '../src/engine/language/NetworkView';
import { TeachableNetworkSection } from '../src/ui/components/admin/TeachableNetworkSection';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const taught = {
  lemma: 'surfar', pos: 'VERB' as const,
  gloss: 'deslocar-se sobre ondas', semanticType: 'ACAO',
  frameTemplateId: 'andar.ANDAR'
};

describe('rede ensinável', () => {
  it('ensina uma raiz e reconhece imediatamente flexão, sujeito e tempo', () => {
    const store = new KnowledgeBaseStore(undefined, { persist: false });
    const beforeVersions = store.versions.length;
    const result = store.teachRoot(taught);
    expect(result.paradigmId).toBe('V_AR');
    expect(result.paradigmRule).toBe('ENDING:ar');
    expect(store.versions.length).toBe(beforeVersions + 1);

    const engine = new SemanticEngine(store.kb);
    const analysis = engine.analyzeSentence('Nós surfamos ontem.');
    expect(analysis.words[1].selected.lemma).toBe('surfar');
    expect(analysis.words[1].selected.origin).toBe('INFLECTION');
    expect(analysis.clause.subject).toEqual([1]);
    const graph = analysis.meaningGraph;
    const surf = graph.nodes.find((node) => node.concept === 'surfar.SURFAR');
    const nos = graph.nodes.find((node) => node.concept === 'nós');
    const ontem = graph.nodes.find((node) => node.concept === 'ontem');
    expect(surf && nos && ontem).toBeTruthy();
    expect(graph.edges).toContainEqual(expect.objectContaining({ from: surf!.id, to: nos!.id, role: 'ARG0' }));
    expect(graph.edges).toContainEqual(expect.objectContaining({ from: surf!.id, to: ontem!.id, role: 'TIME' }));
  });

  it('analisa surfista como AGENT_OF da raiz ensinada', () => {
    const store = new KnowledgeBaseStore(undefined, { persist: false });
    store.teachRoot(taught);
    const readings = new SemanticEngine(store.kb).analyzeWord('surfista');
    expect(readings.some((reading) => reading.root.lemma === 'surfar' && reading.semantics === 'AGENT_OF(surfar)')).toBe(true);
  });

  it('preserva a raiz em backup e migra base v2 para a versão nova', () => {
    const store = new KnowledgeBaseStore(undefined, { persist: false });
    store.teachRoot(taught);
    const backup = store.exportJSON();
    const restored = new KnowledgeBaseStore(undefined, { persist: false });
    restored.importJSON(backup);
    expect(restored.kb.languageRoots.some((root) => root.lemma === 'surfar')).toBe(true);
    expect(KB_DATA_VERSION).toBe(3);

    const old = new KnowledgeBaseStore(undefined, { persist: false });
    old.importJSON(JSON.stringify({ dataVersion: 2, knowledgeBase: createInitialKnowledgeBase() }));
    expect(old.kb.languageRoots).toEqual([]);
  });

  it('mostra formas, derivados, sentido, moldura e tipo na vista de rede', () => {
    const store = new KnowledgeBaseStore(undefined, { persist: false });
    const root = store.teachRoot(taught);
    const network = buildNetworkView(root, store.kb);
    expect(network.forms.some((form) => form.surface === 'surfamos')).toBe(true);
    expect(network.derivatives.some((derivative) => derivative.form === 'surfista' && derivative.status === 'HYPOTHESIS')).toBe(true);
    expect(network.sense).toBe('surfar.SURFAR');
    expect(network.frame).toBe('surfar.SURFAR');
    expect(network.semanticType).toBe('ACAO');
    const html = renderToStaticMarkup(React.createElement(TeachableNetworkSection, {
      engine: new SemanticEngine(store.kb), store, onChange: () => undefined
    }));
    expect(html).toContain('Ensinar palavra');
    expect(html).toContain('Rede');
  });

  it('restaura raiz ensinada quando snapshots completos excedem a cota local', () => {
    const initial = new KnowledgeBaseStore(undefined, { persist: false }).exportJSON();
    const saved = new Map<string, string>([['lexical.knowledgeBase.v2', initial]]);
    const storage = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === 'lexical.knowledgeBase.v2' && value.length > initial.length + 200) throw new Error('QuotaExceededError');
        saved.set(key, value);
      },
      removeItem: (key: string) => { saved.delete(key); }
    };
    const previous = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = storage;
    try {
      const store = new KnowledgeBaseStore();
      store.teachRoot(taught);
      expect(store.lastPersistError).toMatch(/QuotaExceededError/);
      const restored = new KnowledgeBaseStore();
      expect(restored.kb.languageRoots.some((root) => root.lemma === 'surfar')).toBe(true);
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = previous;
    }
  });
});
