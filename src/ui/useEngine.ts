import { useSyncExternalStore, useCallback, useState } from 'react';
import { SemanticEngine, type CommandResult } from '../engine/SemanticEngine';
import { KnowledgeBaseStore } from '../knowledge/KnowledgeBaseStore';

export interface ChatEntry {
  id: number;
  role: 'user' | 'system';
  text: string;
  result?: CommandResult;
}

/**
 * Instância única compartilhada entre o chat, o preview e o painel
 * administrativo — não há implementação paralela para demonstração.
 */
export interface AppContext {
  engine: SemanticEngine;
  store: KnowledgeBaseStore;
}

let context: AppContext | null = null;

export function getContext(): AppContext {
  if (!context) {
    const store = new KnowledgeBaseStore();
    const engine = new SemanticEngine(store.kb, store.settings);
    context = { engine, store };
  }
  return context;
}

/** Sincroniza o motor com a base de conhecimento e as configurações atuais. */
export function applyKnowledgeBase(ctx: AppContext): void {
  ctx.engine.knowledgeBase = ctx.store.kb;
  ctx.engine.updateSettings(ctx.store.settings);
  ctx.engine.rebuild();
  ctx.engine.updateSettings(ctx.store.settings);
}

export function useKnowledgeStore(ctx: AppContext) {
  const subscribe = useCallback((cb: () => void) => ctx.store.subscribe(cb), [ctx]);
  const getSnapshot = useCallback(() => ctx.store, [ctx]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Assina as mudanças do documento do builder (fonte única de verdade). */
export function useDocument(engine: SemanticEngine) {
  const subscribe = useCallback((cb: () => void) => engine.store.subscribe(cb), [engine]);
  const getSnapshot = useCallback(() => engine.store.document, [engine]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function useChat(engine: SemanticEngine) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);

  const send = useCallback(
    (input: string, mode: 'execute' | 'analyze' = 'execute') => {
      const trimmed = input.trim();
      if (!trimmed) return;

      const userId = Date.now() + Math.random();
      const userEntry: ChatEntry = { id: userId, role: 'user', text: trimmed };

      if (mode === 'analyze') {
        const compile = engine.analyze(trimmed);
        const hasError = compile.plan.diagnostics.some((d) => d.severity === 'ERROR');
        setEntries((prev) => [
          ...prev,
          userEntry,
          {
            id: userId + 1,
            role: 'system',
            text: hasError
              ? 'Análise concluída: foram encontrados erros (nenhuma mutação aplicada).'
              : 'Análise concluída (nenhuma mutação aplicada).',
            result: {
              input: trimmed,
              success: !hasError,
              compile,
              execution: {
                success: false,
                diagnostics: compile.plan.diagnostics,
                createdNodes: {},
                mutations: [],
                touchedNodes: []
              }
            }
          }
        ]);
        return;
      }

      const result = engine.execute(trimmed);
      const errors = result.compile.diagnostics.filter((d) => d.severity === 'ERROR');
      const warnings = result.compile.diagnostics.filter((d) => d.severity === 'WARNING');

      const summary = result.success
        ? `Executado: ${result.execution.mutations.length} mutação(ões).` +
          (errors.length ? ` ${errors.length} erro(s).` : '') +
          (warnings.length ? ` ${warnings.length} aviso(s).` : '')
        : `Bloqueado: ${errors.length} erro(s) — o documento não foi alterado.`;

      setEntries((prev) => [
        ...prev,
        userEntry,
        { id: userId + 1, role: 'system', text: summary, result }
      ]);
    },
    [engine]
  );

  const clear = useCallback(() => setEntries([]), []);

  return { entries, send, clear };
}
