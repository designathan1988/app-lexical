import { describe, it, expect, beforeEach } from 'vitest';
import { KnowledgeBaseStore } from '../src/knowledge/KnowledgeBaseStore';
import { createInitialKnowledgeBase, type KnowledgeBase } from '../src/knowledge/knowledgeBase';
import { KB_DATA_VERSION } from '../src/knowledge/migrateKnowledgeBase';

/**
 * Base salva no navegador em formato antigo (v1): formas de flexão
 * cadastradas à mão com ids SF_* (SF_CRIE, SF_CRIOU…). Ao abrir, a base deve
 * vir da fábrica ATUAL — formas geradas a partir de cada lema — preservando só
 * o que o usuário acrescentou.
 */

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  keys() {
    return [...this.data.keys()];
  }
}

function legacyBase(): KnowledgeBase {
  const kb = createInitialKnowledgeBase();
  return {
    ...kb,
    surfaceForms: [
      // como era em v1: flexões manuais de fábrica
      { id: 'SF_CRIE', rawText: 'crie', lexemeId: 'LEX_CRIAR', formType: 'INFLECTION' },
      { id: 'SF_CRIOU', rawText: 'criou', lexemeId: 'LEX_CRIAR', formType: 'INFLECTION' },
      // adição do usuário: erro de digitação de um lema existente
      { id: 'SF_MEU_ERRO', rawText: 'criie', lexemeId: 'LEX_CRIAR', formType: 'MISSPELLING' },
      // adição do usuário: lema novo com sua forma
      { id: 'SF_ROSA', rawText: 'rosa', lexemeId: 'LEX_ROSA', formType: 'CANONICAL' }
    ],
    lexemes: {
      ...kb.lexemes,
      LEX_ROSA: { id: 'LEX_ROSA', lemma: 'rosa', pos: 'ADJECTIVE', senseConceptIds: ['C_VAL_PINK'] }
    },
    concepts: {
      ...kb.concepts,
      C_VAL_PINK: { kind: 'VALUE', id: 'C_VAL_PINK', valueCategory: 'COLOR', literal: '#ec4899' }
    }
  };
}

describe('Migração da base salva em formato antigo', () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
    (globalThis as { localStorage?: unknown }).localStorage = storage;
  });

  it('abre com as formas geradas pelo lema, sem os ids SF_* de fábrica', () => {
    storage.setItem('lexical.knowledgeBase.v1', JSON.stringify({ knowledgeBase: legacyBase() }));
    const store = new KnowledgeBaseStore();
    const ids = store.kb.surfaceForms.map((s) => s.id);
    expect(ids).not.toContain('SF_CRIE');
    expect(ids).not.toContain('SF_CRIOU');
    const crie = store.kb.surfaceForms.filter((s) => s.lexemeId === 'LEX_CRIAR' && s.rawText === 'crie');
    expect(crie.length).toBeGreaterThan(0);
    expect(crie.every((s) => s.generated && s.id.startsWith('LEX_CRIAR#'))).toBe(true);
    expect(store.migrationNotice).toMatch(/migrada/);
  });

  it('preserva o que é do usuário: lema, conceito e exceções', () => {
    storage.setItem('lexical.knowledgeBase.v1', JSON.stringify({ knowledgeBase: legacyBase() }));
    const store = new KnowledgeBaseStore();
    expect(store.kb.lexemes.LEX_ROSA).toBeDefined();
    expect(store.kb.concepts.C_VAL_PINK).toBeDefined();
    expect(store.kb.surfaceForms.some((s) => s.id === 'SF_MEU_ERRO')).toBe(true);
    // a forma do lema novo agora vem do lema (gerada), não de cadastro manual
    expect(store.kb.surfaceForms.some((s) => s.lexemeId === 'LEX_ROSA' && s.rawText === 'rosa' && s.generated)).toBe(
      true
    );
  });

  it('regrava no formato atual e remove a chave antiga', () => {
    storage.setItem('lexical.knowledgeBase.v1', JSON.stringify({ knowledgeBase: legacyBase() }));
    new KnowledgeBaseStore();
    expect(storage.keys()).not.toContain('lexical.knowledgeBase.v1');
    const saved = JSON.parse(storage.getItem('lexical.knowledgeBase.v2')!);
    expect(saved.dataVersion).toBe(KB_DATA_VERSION);
  });

  it('base já no formato atual é adotada sem migração', () => {
    const store1 = new KnowledgeBaseStore();
    store1.addLexeme({ id: 'LEX_X', lemma: 'xis', pos: 'NOUN', senseConceptIds: [] });
    const store2 = new KnowledgeBaseStore();
    expect(store2.migrationNotice).toBeNull();
    expect(store2.kb.lexemes.LEX_X).toBeDefined();
  });
});
