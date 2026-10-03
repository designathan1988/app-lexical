import type { KnowledgeBase } from '../knowledge/knowledgeBase';
import { SemanticCompiler, type CompileResult } from './SemanticCompiler';
import { ExecutionEngine, type ExecutionResult } from './runtime/ExecutionEngine';
import { DiscourseContext, type NodeLookup, type Liveness } from './parser/DiscourseContext';
import { ReferenceResolver } from './document/ReferenceResolver';
import { BuilderStore } from '../builder/BuilderStore';
import { BuilderRuntimeAdapterImpl } from '../builder/BuilderRuntimeAdapterImpl';
import { DEFAULT_ENGINE_SETTINGS, type EngineSettings } from './EngineSettings';
import { diagnostic, normalizeSpan, type Diagnostic } from './diagnostics';
import type { PlanSimulator } from './planning/TempNodes';
import { createDerivationalAnalyzer } from '../knowledge/morphology';
import type { DerivationalAnalyzer, DerivationAnalysis } from './morphology/DerivationalAnalyzer';

export interface CommandResult {
  input: string;
  success: boolean;
  compile: CompileResult;
  execution: ExecutionResult;
}

/**
 * Fachada de composição.
 *
 * O discurso é TRANSACIONAL: o parser escreve menções em staging; elas só são
 * promovidas quando a execução tem sucesso, já com referências materializadas
 * em NODE_ID. Em falha, análise ou rollback, o staging é descartado.
 */
export class SemanticEngine {
  store = new BuilderStore();
  adapter = new BuilderRuntimeAdapterImpl(this.store);
  compiler: SemanticCompiler;
  execEngine: ExecutionEngine;
  private discourse = new DiscourseContext();

  constructor(
    public knowledgeBase: KnowledgeBase,
    private settings: EngineSettings = DEFAULT_ENGINE_SETTINGS
  ) {
    this.adapter.selectAfterCommand = this.settings.selectAfterCommand;
    this.compiler = this.buildCompiler();
    this.execEngine = new ExecutionEngine(this.knowledgeBase.concepts, this.adapter);
  }

  /**
   * Simulação de efeitos para o planejamento de frases com várias orações: os
   * passos são executados pelo MESMO executor e adaptador do runtime, sobre uma
   * cópia descartável do documento — nenhuma semântica paralela à do builder.
   */
  private simulate: PlanSimulator = (document, steps, tempMap) => {
    const scratch = new BuilderStore();
    scratch.loadScratch(document);
    const adapter = new BuilderRuntimeAdapterImpl(scratch);
    const result = new ExecutionEngine(this.knowledgeBase.concepts, adapter).execute(
      { steps, diagnostics: [] },
      tempMap
    );
    return {
      document: scratch.document,
      tempMap: new Map(Object.entries(result.createdNodes)),
      ok: result.success
    };
  };

  private buildCompiler(): SemanticCompiler {
    const kb = this.knowledgeBase;
    const compiler = new SemanticCompiler(
      kb.concepts,
      kb.lexemes,
      kb.surfaceForms,
      kb.multiwords,
      this.discourse,
      this.settings,
      kb.defaults,
      kb.disambiguationRules ?? []
    );
    compiler.simulator = this.simulate;
    this.derivations = createDerivationalAnalyzer(kb.lexemes);
    compiler.morphology = this.derivations;
    return compiler;
  }

  private derivations?: DerivationalAnalyzer;

  /** Decomposição derivacional de uma palavra (raiz + regras + glosa). */
  analyzeWord(word: string): DerivationAnalysis[] {
    this.derivations ??= createDerivationalAnalyzer(this.knowledgeBase.lexemes);
    return this.derivations.analyze(word);
  }

  updateSettings(settings: EngineSettings): void {
    this.settings = settings;
    this.adapter.selectAfterCommand = settings.selectAfterCommand;
    this.compiler.updateSettings(settings);
  }

  /** Reconstrói os índices após edições na base de conhecimento. */
  rebuild(): void {
    this.compiler = this.buildCompiler();
    this.execEngine = new ExecutionEngine(this.knowledgeBase.concepts, this.adapter);
  }

  /** Consulta ao documento vivo, usada pelo discurso. */
  liveness: Liveness = (selector) =>
    new ReferenceResolver(this.store.document).resolveSelector(selector).length;

  nodeLookup: NodeLookup = (nodeId) => {
    const node = this.store.document.nodes.get(nodeId);
    return node ? { entityConceptId: node.entityConceptId } : undefined;
  };

  private pruneDiscourse(): void {
    this.discourse.pruneStale(this.nodeLookup, this.liveness);
  }

  /**
   * Apenas analisa a frase. Usa o MESMO discurso e o MESMO documento da
   * execução, mas descarta o staging: não altera documento, discurso nem
   * seleção. O plano produzido é o mesmo que `execute` usaria.
   */
  analyze(input: string): CompileResult {
    this.pruneDiscourse();
    const stagingBefore = this.discourse.stagedCount();
    const result = this.compiler.compile(input, this.store.document, this.discourse);
    // Desfaz qualquer menção registrada durante a análise.
    if (this.discourse.stagedCount() > stagingBefore) this.discourse.discard();
    return result;
  }

  /** Executa a frase contra o documento real como uma transação lógica. */
  execute(input: string): CommandResult {
    this.pruneDiscourse();

    let compile: CompileResult;
    try {
      compile = this.compiler.compile(input, this.store.document, this.discourse);
    } catch (error) {
      const internal = normalizeSpan(
        diagnostic('engine', 'ERROR', 'INTERNAL_ERROR',
          `Falha interna: ${(error as Error).message}`),
        input.length
      );
      this.discourse.discard();
      const empty: ExecutionResult = {
        success: false,
        diagnostics: [internal],
        createdNodes: {},
        mutations: [],
        touchedNodes: []
      };
      return {
        input,
        success: false,
        compile: {
          ast: { commands: [] },
          plan: { steps: [], diagnostics: [internal] },
          diagnostics: [internal],
          trace: {
            input,
            rawTokens: [],
            grammaticalTokens: [],
            semanticTokens: [],
            grammarIndex: this.compiler.grammarIndex
          }
        },
        execution: empty
      };
    }

    const selectedBefore = [...this.store.document.selectionIds];
    this.execEngine.transactionLabel = input;

    let execution: ExecutionResult;
    try {
      execution = this.execEngine.execute(compile.plan);
    } catch (error) {
      this.store.rollbackTransaction();
      execution = {
        success: false,
        diagnostics: [
          ...compile.plan.diagnostics,
          diagnostic('executor', 'ERROR', 'INTERNAL_ERROR',
            `Falha inesperada na execução: ${(error as Error).message}`)
        ],
        createdNodes: {},
        mutations: [],
        touchedNodes: []
      };
    }

    if (execution.success && execution.mutations.length > 0) {
      // Promove o staging com as referências já materializadas.
      this.discourse.commit(execution.createdNodes, this.liveness);
    } else if (execution.success && execution.mutations.length === 0) {
      // Nada a fazer: descarta menções e restaura a seleção.
      this.discourse.discard();
      this.store.setSelection(selectedBefore);
    } else {
      this.discourse.discard();
    }

    return { input, success: execution.success, compile, execution };
  }

  undo(): boolean {
    const ok = this.store.undo();
    this.pruneDiscourse();
    return ok;
  }

  redo(): boolean {
    const ok = this.store.redo();
    this.pruneDiscourse();
    return ok;
  }

  resetDocument(): void {
    this.store.reset();
    this.discourse.clear();
  }

  /** Diagnósticos acumulados do discurso (para o inspetor). */
  discourseStats(): { persistent: number; staged: number } {
    return {
      persistent: this.discourse.mentionsCount(),
      staged: this.discourse.stagedCount()
    };
  }
}
