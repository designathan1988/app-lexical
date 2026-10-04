import type { KnowledgeBaseBackend, PersistedKnowledgeBase } from './KnowledgeBaseBackend';

const DATABASE_NAME = 'lexical.knowledgeBase';
const STORE_NAME = 'state';
const CURRENT_KEY = 'current';

export class IndexedDbKnowledgeBaseBackend implements KnowledgeBaseBackend {
  private constructor(private database: IDBDatabase) {
    this.database.onversionchange = () => this.database.close();
  }

  static open(): Promise<IndexedDbKnowledgeBaseBackend> {
    if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB indisponível neste navegador.'));
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(new IndexedDbKnowledgeBaseBackend(request.result));
      request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir o IndexedDB.'));
      request.onblocked = () => reject(new Error('A atualização do IndexedDB foi bloqueada por outra aba.'));
    });
  }

  load(): Promise<PersistedKnowledgeBase | null> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(CURRENT_KEY);
      let result: PersistedKnowledgeBase | null = null;
      request.onsuccess = () => { result = (request.result as PersistedKnowledgeBase | undefined) ?? null; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao ler a base no IndexedDB.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Leitura da base cancelada no IndexedDB.'));
    });
  }

  save(value: PersistedKnowledgeBase): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = this.database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(value, CURRENT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Falha ao salvar a base no IndexedDB.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Gravação da base cancelada no IndexedDB.'));
    });
  }
}
