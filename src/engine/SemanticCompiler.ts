import type { ConceptId, DocumentNodeId } from './types';
import type { ConceptNode } from './ontology/Concept';
import type { SurfaceForm, Lexeme, LexemeId, MultiwordEntry } from './types';
import type { DocumentModel } from './document/DocumentModel';
import { preorderNodeIds } from './document/traversal';
import type { SemanticDocumentAst } from './ast/ast';
import type { ExecutionPlan } from './planning/ExecutionPlan';
import type { RawToken } from './lexical/RawLexer';
import type { SemanticToken } from './parser/SemanticToken';
import type { Diagnostic } from './diagnostics';
import { diagnostic, normalizeSpan, dedupeDiagnostics } from './diagnostics';

import { RawLexer } from './lexical/RawLexer';
import { segmentTokens } from './lexical/Segmenter';
import type { PlanSimulator } from './planning/TempNodes';
import {
  Disambiguator,
  type DisambiguationRule,
  type DisambiguationApplication
} from './syntax/Disambiguator';
import { MultiwordTrie } from './lexical/MultiwordTrie';
import { LexicalIndex } from './lexical/LexicalIndex';
import { SemanticTokenBuilder } from './parser/SemanticTokenBuilder';
import { DomainParser, type ParserContext } from './parser/DomainParser';
import { DiscourseContext, type NodeLookup } from './parser/DiscourseContext';
import { LexicalRecovery } from './parser/LexicalRecovery';
import { buildGrammarIndex, type GrammarIndex } from './parser/GrammarIndex';
import { ExecutionPlanner } from './planning/ExecutionPlanner';
import { ReferenceResolver } from './document/ReferenceResolver';
import { ConstraintValidator } from './planning/ConstraintValidator';
import { DEFAULT_ENGINE_SETTINGS, type EngineSettings } from './EngineSettings';

export interface CompileTrace {
  input: string;
  rawTokens: RawToken[];
  grammaticalTokens: RawToken[];
  semanticTokens: SemanticToken[];
  /** Regras de desambiguação aplicadas (id da regra, token, leituras removidas). */
  disambiguation?: DisambiguationApplication[];
  grammarIndex: GrammarIndex;
  ast?: SemanticDocumentAst;
  plan?: ExecutionPlan;
  /**
   * Consumo por comando (invariante F1.3): índices globais de
   * `semanticTokens` consumidos pelo parser em cada comando da AST.
   */
  consumption?: Array<{ commandIndex: number; consumedTokenIndices: number[] }>;
}

export interface CompileResult {
  ast: SemanticDocumentAst;
  plan: ExecutionPlan;
  diagnostics: Diagnostic[];
  trace: CompileTrace;
}

/**
 * Compilador semântico de domínio.
 *
 * NUNCA lança: todo erro vira `Diagnostic` estruturado e o documento fica
 * intacto. Orquestra lexer → normalização → MWE → recuperação aproximada →
 * parser → binder → planner → validator, preservando o trace de depuração.
 */
export class SemanticCompiler {
  private lexer = new RawLexer();
  private lexicalIndex: LexicalIndex;
  private trie: MultiwordTrie;
  private tokenBuilder: SemanticTokenBuilder;
  private disambiguator: Disambiguator;
  /** Simulador de efeitos (injetado pelo runtime) para frases com várias orações. */
  simulator?: PlanSimulator;
  private grammar: GrammarIndex;
  private recovery: LexicalRecovery;
  private settings: EngineSettings;

  constructor(
    private concepts: Record<ConceptId, ConceptNode>,
    lexemes: Record<LexemeId, Lexeme>,
    surfaceForms: SurfaceForm[],
    multiwords: MultiwordEntry[],
    private discourse?: DiscourseContext,
    settings?: EngineSettings,
    private defaults: {
      impliedContainmentRelationId: ConceptId;
      textContentPropertyId: ConceptId;
    } = {
      impliedContainmentRelationId: 'C_SPAT_INSIDE',
      textContentPropertyId: 'C_PROP_TEXT_CONTENT'
    },
    disambiguationRules: DisambiguationRule[] = []
  ) {
    this.disambiguator = new Disambiguator(disambiguationRules, concepts);
    this.settings = settings ?? DEFAULT_ENGINE_SETTINGS;
    this.lexicalIndex = new LexicalIndex(surfaceForms, lexemes, this.settings);
    this.trie = new MultiwordTrie(multiwords);
    this.tokenBuilder = new SemanticTokenBuilder(concepts, this.lexicalIndex, this.trie);

    this.grammar = buildGrammarIndex(concepts, lexemes, surfaceForms);
    this.recovery = new LexicalRecovery(concepts, this.lexicalIndex, this.grammar, this.settings);
  }

  updateSettings(settings: EngineSettings): void {
    this.settings = settings;
    this.lexicalIndex.updateSettings(settings);
  }

  /** Gramática derivada dos dados (para diagnóstico e testes). */
  get grammarIndex(): GrammarIndex {
    return this.grammar;
  }

  lexSemanticTokens(input: string): SemanticToken[] {
    const raw = this.lexer.lex(input);
    const grammatical = segmentTokens(raw).tokens;
    return this.tokenBuilder.build(grammatical);
  }

  /** Constrói tokens semânticos com recuperação aproximada aplicada. */
  private prepare(
    input: string
  ): {
    raw: RawToken[];
    grammatical: RawToken[];
    tokens: SemanticToken[];
    diagnostics: Diagnostic[];
    disambiguation: DisambiguationApplication[];
  } {
    const raw = this.lexer.lex(input);
    // 3.B — segmentação de contrações e clíticos (mesóclise recusada com span).
    const segmented = segmentTokens(raw);
    const grammatical = segmented.tokens;
    const exact = this.tokenBuilder.build(grammatical);
    const diagnostics: Diagnostic[] = [...segmented.diagnostics];
    const recovered = this.recovery.apply(exact, diagnostics);
    // Camada de desambiguação: regras em dados reduzem as coortes de leituras.
    const disambiguated = this.disambiguator.run(recovered);
    return {
      raw,
      grammatical,
      tokens: disambiguated.tokens,
      diagnostics,
      disambiguation: disambiguated.applications
    };
  }

  private makeNodeLookup(document: DocumentModel): NodeLookup {
    return (nodeId: DocumentNodeId) => {
      const node = document.nodes.get(nodeId);
      return node ? { entityConceptId: node.entityConceptId } : undefined;
    };
  }

  private makeParserContext(
    document: DocumentModel,
    discourse: DiscourseContext
  ): ParserContext {
    return {
      concepts: this.concepts,
      grammar: this.grammar,
      discourse,
      lexicalIndex: this.lexicalIndex,
      settings: this.settings,
      nodeLookup: this.makeNodeLookup(document),
      countMatches: (selector) =>
        new ReferenceResolver(document).resolveSelector(selector).length,
      nodeIds: () => preorderNodeIds(document),
      defaults: this.defaults
    };
  }

  /**
   * Analisa a frase SEM executar. O discurso persistente é visível (leitura),
   * mas nada é promovido: o staging é descartado ao final.
   */
  compileToAst(
    input: string,
    document: DocumentModel,
    discourse: DiscourseContext
  ): { ast: SemanticDocumentAst; diagnostics: Diagnostic[]; trace: CompileTrace } {
    // Nenhuma exceção escapa do motor: a preparação (lexer, MWE, recuperação)
    // também roda dentro da captura — um defeito vira INTERNAL_ERROR, nunca
    // uma exceção para a UI.
    let raw: RawToken[] = [];
    let grammatical: RawToken[] = [];
    let tokens: SemanticToken[] = [];
    const diagnostics: Diagnostic[] = [];
    let ast: SemanticDocumentAst = { commands: [] };
    let consumption: CompileTrace['consumption'] = [];
    let disambiguation: DisambiguationApplication[] = [];

    try {
      const prepared = this.prepare(input);
      raw = prepared.raw;
      grammatical = prepared.grammatical;
      tokens = prepared.tokens;
      disambiguation = prepared.disambiguation;
      diagnostics.push(...prepared.diagnostics);

      const parser = new DomainParser(this.makeParserContext(document, discourse));
      try {
        ast = parser.parse(tokens);
        consumption = parser.consumption;
        diagnostics.push(...parser.diagnostics);
      } catch (error) {
        // Diagnósticos já emitidos pelas camadas internas (ex.: binder) vêm
        // primeiro, preservando sua camada de origem.
        consumption = parser.consumption;
        diagnostics.push(...parser.diagnostics);
        diagnostics.push(this.toDiagnostic(error));
        ast = { commands: [] };
      }
    } catch (error) {
      diagnostics.push(this.toDiagnostic(error));
    }

    return {
      ast,
      diagnostics,
      trace: {
        input,
        rawTokens: raw,
        grammaticalTokens: grammatical,
        semanticTokens: tokens,
        disambiguation,
        grammarIndex: this.grammar,
        ast,
        consumption
      }
    };
  }

  compile(
    input: string,
    document: DocumentModel,
    discourse: DiscourseContext,
    layer = 'planner'
  ): CompileResult {
    const { trace, diagnostics, ast } = this.compileToAst(input, document, discourse);

    const prePlan = [...diagnostics];

    let plan: ExecutionPlan;
    try {
      const planner = new ExecutionPlanner(
        this.concepts,
        document,
        this.settings,
        discourse,
        this.makeNodeLookup(document),
        (selector) => new ReferenceResolver(document).resolveSelector(selector).length,
        layer,
        prePlan,
        this.simulator
      );
      plan = planner.build(ast);

      const validator = new ConstraintValidator(this.concepts, document);
      plan = validator.validate(plan);
    } catch (error) {
      const internal = this.toDiagnostic(error);
      plan = { steps: [], diagnostics: [internal] };
    }

    const merged: ExecutionPlan = {
      ...plan,
      diagnostics: dedupeDiagnostics(
        [...prePlan, ...plan.diagnostics].map((d) => normalizeSpan(d, input.length))
      )
    };

    trace.plan = merged;

    return {
      ast,
      plan: merged,
      diagnostics: merged.diagnostics,
      trace
    };
  }

  /** Converte qualquer erro inesperado em diagnóstico estruturado. */
  private toDiagnostic(error: unknown): Diagnostic {
    const candidate = error as { code?: string; message?: string; span?: { start: number; end: number } };
    if (candidate && typeof candidate.code === 'string' && candidate.code !== 'Error') {
      return diagnostic('syntax', 'ERROR', candidate.code,
        candidate.message ?? String(error), candidate.span);
    }
    return diagnostic('engine', 'ERROR', 'INTERNAL_ERROR',
      `Falha interna ao interpretar o comando: ${
        (error as Error)?.message ?? String(error)
      }`);
  }
}
