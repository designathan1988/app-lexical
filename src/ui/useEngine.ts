import { useSyncExternalStore, useCallback, useState } from 'react';
import { SemanticEngine, type CommandResult } from '../engine/SemanticEngine';
import { KnowledgeBaseStore } from '../knowledge/KnowledgeBaseStore';
import { IndexedDbKnowledgeBaseBackend } from '../knowledge/IndexedDbKnowledgeBaseBackend';
import type { SentenceAnalysis } from '../engine/language/SentenceAnalysis';

export interface ChatEntry {
  id: number;
  role: 'user' | 'system';
  text: string;
  result?: CommandResult;
  analysisOnly?: boolean;
}

/** Classifica a resposta visível sem alterar o compilador nem seus diagnósticos. */
export function summarizeChatResult(result: CommandResult, analysis: SentenceAnalysis | null): { text: string; analysisOnly: boolean } {
  const errors = result.compile.diagnostics.filter((diagnostic) => diagnostic.severity === 'ERROR');
  const warnings = result.compile.diagnostics.filter((diagnostic) => diagnostic.severity === 'WARNING');
  const generalSentence = !result.success
    && result.compile.plan.steps.length === 0
    && result.compile.ast.commands.every((command) => command.kind === 'NO_OP' && command.reason === 'UNKNOWN_COMMAND')
    && analysis !== null
    && analysis.words.some((word) => word.selected.upos === 'VERB' && word.selected.feats.VerbForm === 'Fin')
    && analysis.words.every((word) => word.selected.upos === 'PUNCT' || word.selected.origin !== 'GUESS')
    && analysis.dependencies.length === analysis.words.length
    && analysis.meaningGraph.nodes.some((node) => node.id === analysis.meaningGraph.root)
    && analysis.meaningGraph.diagnostics.length === 0;
  if (generalSentence) return { text: 'Frase analisada (não é um comando do construtor)', analysisOnly: true };
  return {
    text: result.success
      ? `Executado: ${result.execution.mutations.length} mutação(ões).` +
        (errors.length ? ` ${errors.length} erro(s).` : '') +
        (warnings.length ? ` ${warnings.length} aviso(s).` : '')
      : `Bloqueado: ${errors.length} erro(s) — o documento não foi alterado.`,
    analysisOnly: false
  };
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
let pendingContext: Promise<AppContext> | null = null;

/** Inicializa a base persistida antes da primeira renderização. */
export function initializeContext(): Promise<AppContext> {
  if (context) return Promise.resolve(context);
  if (pendingContext) return pendingContext;
  pendingContext = (async () => {
    const store = new KnowledgeBaseStore();
    try {
      const backend = await IndexedDbKnowledgeBaseBackend.open();
      await store.attachBackend(backend);
    } catch (error) {
      store.lastPersistError = `IndexedDB indisponível; usando o armazenamento local limitado: ${(error as Error).message}`;
    }
    const engine = new SemanticEngine(store.kb, store.settings);
    context = { engine, store };
    return context;
  })();
  return pendingContext;
}

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
      const summary = summarizeChatResult(result, result.success ? null : engine.analyzeSentence(trimmed));

      setEntries((prev) => [
        ...prev,
        userEntry,
        { id: userId + 1, role: 'system', text: summary.text, analysisOnly: summary.analysisOnly, result }
      ]);
    },
    [engine]
  );

  const clear = useCallback(() => setEntries([]), []);

  return { entries, send, clear };
}
