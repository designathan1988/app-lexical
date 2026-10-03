import { RawLexer } from '../engine/lexical/RawLexer';
import { LexicalIndex } from '../engine/lexical/LexicalIndex';
import { MultiwordTrie } from '../engine/lexical/MultiwordTrie';
import { SemanticTokenBuilder } from '../engine/parser/SemanticTokenBuilder';
import { DomainParser } from '../engine/parser/DomainParser';
import { DiscourseContext } from '../engine/parser/DiscourseContext';
import { buildGrammarIndex } from '../engine/parser/GrammarIndex';
import { ExecutionPlanner } from '../engine/planning/ExecutionPlanner';
import { ConstraintValidator } from '../engine/planning/ConstraintValidator';
import { SemanticCompiler } from '../engine/SemanticCompiler';
import { SemanticEngine } from '../engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../knowledge/knowledgeBase';
import { DEFAULT_ENGINE_SETTINGS } from '../engine/EngineSettings';
import { preorderNodeIds } from '../engine/document/traversal';
import type { SurfaceForm, Lexeme, LexemeId, MultiwordEntry, ConceptId } from '../engine/types';
import type { ConceptNode } from '../engine/ontology/Concept';
import type { DocumentModel } from '../engine/document/DocumentModel';

export interface BenchmarkTimings {
  label: string;
  ms: number;
  ops?: number;
}

export interface BenchmarkReport {
  timings: BenchmarkTimings[];
  surfaceForms: number;
  multiwords: number;
}

function now(): number {
  return performance.now();
}

function syntheticSurfaceForms(n: number): SurfaceForm[] {
  const forms: SurfaceForm[] = [];
  for (let i = 0; i < n; i++) {
    forms.push({
      id: `SYN_${i}`,
      rawText: `palavra${i}`,
      lexemeId: `SYNLEX_${i}`,
      formType: 'CANONICAL'
    });
  }
  return forms;
}

function syntheticLexemes(n: number): Record<LexemeId, Lexeme> {
  const lexemes: Record<LexemeId, Lexeme> = {};
  for (let i = 0; i < n; i++) {
    lexemes[`SYNLEX_${i}`] = {
      id: `SYNLEX_${i}`,
      lemma: `palavra${i}`,
      pos: 'NOUN',
      senseConceptIds: ['C_VAL_BLUE']
    };
  }
  return lexemes;
}

function syntheticMultiwords(n: number): MultiwordEntry[] {
  const entries: MultiwordEntry[] = [];
  for (let i = 0; i < n; i++) {
    entries.push({
      id: `SYNMWE_${i}`,
      phrase: `expressao composta ${i}`,
      conceptId: 'C_PROP_BG_COLOR'
    });
  }
  return entries;
}

function measure(label: string, fn: () => void, ops?: number): BenchmarkTimings {
  const start = now();
  fn();
  return { label, ms: now() - start, ops };
}

const EMPTY_DOCUMENT: DocumentModel = { nodes: new Map(), rootIds: [], selectionIds: [] };

export function runBenchmark(): BenchmarkReport {
  const timings: BenchmarkTimings[] = [];
  const kb = createInitialKnowledgeBase();
  const lexer = new RawLexer();

  // 1..4: inicialização de índices em 100 / 1.000 / 10.000 / 100.000 formas.
  for (const n of [100, 1_000, 10_000, 100_000]) {
    const forms = syntheticSurfaceForms(n);
    const lexemes = syntheticLexemes(n);

    timings.push(
      measure(`LexicalIndex build (${n.toLocaleString('pt-BR')} SurfaceForms)`, () => {
        new LexicalIndex(forms, lexemes, DEFAULT_ENGINE_SETTINGS);
      })
    );

    const index = new LexicalIndex(forms, lexemes, DEFAULT_ENGINE_SETTINGS);
    const ITER = 2_000;

    // Recuperação aproximada: prova que o custo NÃO cresce linearmente.
    timings.push(
      measure(
        `Recuperação aproximada (${n.toLocaleString('pt-BR')} formas, ${ITER} buscas)`,
        () => {
          for (let i = 0; i < ITER; i++) index.approximateCandidates('palavrax500');
        },
        ITER
      )
    );

    timings.push(
      measure(
        `Lookup exato (${n.toLocaleString('pt-BR')} formas, ${ITER} buscas)`,
        () => {
          for (let i = 0; i < ITER; i++) index.resolve('palavra500');
        },
        ITER
      )
    );
  }

  // Trie com milhares de MWEs
  const mweCount = 10_000;
  const mwes = syntheticMultiwords(mweCount);
  timings.push(measure(`MultiwordTrie build (${mweCount.toLocaleString('pt-BR')} MWEs)`, () => {
    new MultiwordTrie(mwes);
  }));

  const trie = new MultiwordTrie(mwes);
  const sentence = 'crie uma caixa azul com um botão vermelho dentro';
  const N = 5_000;

  timings.push(measure(`Tokenização (${N} iterações)`, () => {
    for (let i = 0; i < N; i++) lexer.lex(sentence);
  }));

  const mweTokens = lexer.lex('expressao composta 5000 dentro de uma caixa');
  timings.push(measure(`MWE match (${N} iterações)`, () => {
    for (let i = 0; i < N; i++) trie.match(mweTokens, 0);
  }));

  // Pipeline completo sobre o motor real
  const engine = new SemanticEngine(kb);
  const compiler = engine.compiler;
  const tokenBuilder = new SemanticTokenBuilder(
    kb.concepts,
    new LexicalIndex(kb.surfaceForms, kb.lexemes, DEFAULT_ENGINE_SETTINGS),
    new MultiwordTrie(kb.multiwords)
  );

  const raw = lexer.lex(sentence);
  const tokens = tokenBuilder.build(raw);

  const grammar = buildGrammarIndex(kb.concepts, kb.lexemes, kb.surfaceForms);

  // O contexto é construído UMA vez: reconstruir o índice por iteração mediria
  // a construção do índice, não o parsing.
  const parserContext = {
    concepts: kb.concepts,
    grammar,
    discourse: new DiscourseContext(),
    lexicalIndex: new LexicalIndex(kb.surfaceForms, kb.lexemes, DEFAULT_ENGINE_SETTINGS),
    settings: DEFAULT_ENGINE_SETTINGS,
    nodeLookup: () => undefined,
    countMatches: () => 0,
    nodeIds: () => preorderNodeIds(EMPTY_DOCUMENT),
    defaults: kb.defaults
  };

  const M = 2_000;
  timings.push(measure(`Parsing (${M} iterações)`, () => {
    for (let i = 0; i < M; i++) new DomainParser(parserContext).parse(tokens);
  }));

  const ast = compiler.compileToAst(sentence, EMPTY_DOCUMENT, new DiscourseContext()).ast;
  timings.push(measure(`Planner+Validator (${M} iterações)`, () => {
    for (let i = 0; i < M; i++) {
      const planner = new ExecutionPlanner(kb.concepts, EMPTY_DOCUMENT, DEFAULT_ENGINE_SETTINGS);
      const plan = planner.build(ast);
      new ConstraintValidator(kb.concepts, EMPTY_DOCUMENT).validate(plan);
    }
  }));

  const E = 5_000;
  timings.push(measure(`Compile completo (${E} iterações)`, () => {
    for (let i = 0; i < E; i++) {
      compiler.compile(sentence, EMPTY_DOCUMENT, new DiscourseContext());
    }
  }));

  const X = 5_000;
  timings.push(measure(`Execução end-to-end (${X} comandos)`, () => {
    for (let i = 0; i < X; i++) {
      engine.resetDocument();
      engine.execute('crie um botão azul');
    }
  }));

  return { timings, surfaceForms: 100_000, multiwords: mweCount };
}

export type { ConceptId, ConceptNode };
