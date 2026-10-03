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
import { diagnostic, normalizeSpan } from './diagnostics';

import { RawLexer } from './lexical/RawLexer';
import { expandContractions } from './lexical/GrammarNormalizer';
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
  grammarIndex: GrammarIndex;
  ast?: SemanticDocumentAst;
  plan?: ExecutionPlan;
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
    }
  ) {
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
    const grammatical = expandContractions(raw);
    return this.tokenBuilder.build(grammatical);
  }

  /** Constrói tokens semânticos com recuperação aproximada aplicada. */
  private prepare(
    input: string
  ): { raw: RawToken[]; grammatical: RawToken[]; tokens: SemanticToken[]; diagnostics: Diagnostic[] } {
    const raw = this.lexer.lex(input);
    const grammatical = expandContractions(raw);
    const exact = this.tokenBuilder.build(grammatical);
    const diagnostics: Diagnostic[] = [];
    const tokens = this.recovery.apply(exact, diagnostics);
    return { raw, grammatical, tokens, diagnostics };
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
    const { raw, grammatical, tokens, diagnostics } = this.prepare(input);
    const parser = new DomainParser(this.makeParserContext(document, discourse));

    let ast: SemanticDocumentAst;
    try {
      ast = parser.parse(tokens);
      diagnostics.push(...parser.diagnostics);
    } catch (error) {
      // Diagnósticos já emitidos pelas camadas internas (ex.: binder) vêm
      // primeiro, preservando sua camada de origem.
      diagnostics.push(...parser.diagnostics);
      diagnostics.push(this.toDiagnostic(error));
      ast = { commands: [] };
    }

    return {
      ast,
      diagnostics,
      trace: {
        input,
        rawTokens: raw,
        grammaticalTokens: grammatical,
        semanticTokens: tokens,
        grammarIndex: this.grammar,
        ast
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
        layer
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
      diagnostics: [...prePlan, ...plan.diagnostics].map((d) => normalizeSpan(d, input.length))
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
