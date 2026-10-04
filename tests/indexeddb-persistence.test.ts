import { describe, expect, it } from 'vitest';
import { KnowledgeBaseStore } from '../src/knowledge/KnowledgeBaseStore';
import type { PersistedKnowledgeBase, KnowledgeBaseBackend } from '../src/knowledge/KnowledgeBaseBackend';

const taught = {
  lemma: 'surfar', pos: 'VERB' as const,
  gloss: 'deslocar-se sobre ondas', semanticType: 'ACAO',
  frameTemplateId: 'andar.ANDAR'
};

function memoryBackend(): KnowledgeBaseBackend & { current(): PersistedKnowledgeBase | null } {
  let value: PersistedKnowledgeBase | null = null;
  return {
    load: async () => value ? structuredClone(value) : null,
    save: async (next) => { value = structuredClone(next); },
    current: () => value ? structuredClone(value) : null
  };
}

describe('persistência completa com backend assíncrono', () => {
  it('grava raiz e versões completas mesmo quando localStorage não aceita o snapshot', async () => {
    const previous = (globalThis as { localStorage?: unknown }).localStorage;
    const values = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === 'lexical.knowledgeBase.v2') throw new Error('QuotaExceededError');
        values.set(key, value);
      },
      removeItem: (key: string) => { values.delete(key); }
    };
    try {
      const backend = memoryBackend();
      const first = new KnowledgeBaseStore();
      await first.attachBackend(backend);
      first.teachRoot(taught);
      await first.flushPersistence();
      const count = first.versions.length;
      expect(backend.current()?.versions.length).toBe(count);

      const second = new KnowledgeBaseStore();
      await second.attachBackend(backend);
      expect(second.kb.languageRoots.some((root) => root.lemma === 'surfar')).toBe(true);
      expect(second.versions.length).toBe(count);
      expect(second.lastPersistError).toBeNull();
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = previous;
    }
  });

  it('expõe falha transacional sem declarar gravação concluída', async () => {
    const store = new KnowledgeBaseStore(undefined, { persist: false });
    await store.attachBackend({
      load: async () => null,
      save: async () => { throw new Error('Falha de gravação'); }
    });
    store.teachRoot(taught);
    await expect(store.flushPersistence()).rejects.toThrow('Falha de gravação');
    expect(store.lastPersistError).toContain('Falha de gravação');
  });
});
