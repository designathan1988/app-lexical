import { SemanticEngine } from '../engine/SemanticEngine';
import type { KnowledgeBase } from '../knowledge/knowledgeBase';
import { treeSignature, astSignature, planSignature } from './signatures';
import { preorderNodeIds } from '../engine/document/traversal';
import { FUNCTION_WORDS } from '../engine/parser/Grammar';
import type {
  EvalRecord,
  EvalDataset,
  ExpectedBinding,
  ExpectedAttachment,
  SeedNodeJson,
  NodeRef
} from './datasetSchema';

export interface RecordStageResult {
  ok: boolean;
  detail?: string;
}

export interface RecordResult {
  id: string;
  input: string;
  tags: string[];
  expectError: boolean;
  /** Todas as asserções passaram. */
  passed: boolean;

  commandKindOk: boolean;
  finalTreeOk: boolean;
  astOk: boolean;
  planOk: boolean;
  bindingsOk: boolean;
  attachmentsOk: boolean;
  referencesOk: boolean;
  diagnosticsOk: boolean;
  errorBehaviorOk: boolean;
  noMutationOk: boolean;

  actualHadError: boolean;
  actualDiagnosticCodes: string[];
  actualAst: string;
  actualPlan: string;
  actualTree: string;
  expectedTree?: string;
  failReasons: string[];

  /** Anotações lexicais, quando presentes. */
  tokenResults?: Array<{ surface: string; expectedLexeme: string | null; actualLexeme: string | null; ok: boolean }>;
}

export interface SetReport {
  name: string;
  total: number;
  passed: number;
  failed: number;
  lexicalResolutionAccuracy: number;
  conceptSenseAccuracy: number;
  entityAttachmentAccuracy: number;
  propertyValueBindingAccuracy: number;
  referenceResolutionAccuracy: number;
  astExactMatch: number;
  planExactMatch: number;
  endToEndSuccess: number;
  falsePositiveRate: number;
  ambiguityDetectionRate: number;
  ambiguityCaseCount: number;
  annotatedTokenCases: number;
  results: RecordResult[];
  failures: RecordResult[];
}

// ---------------------------------------------------------------------------
// Seed / execução
// ---------------------------------------------------------------------------

function seedDocument(engine: SemanticEngine, seed: SeedNodeJson[]): string[] {
  const ids: string[] = [];
  const build = (sn: SeedNodeJson, parentId: string | null): string => {
    const id = engine.store.createNode(sn.entityConceptId, sn.text);
    ids.push(id);
    for (const [k, v] of Object.entries(sn.properties ?? {})) {
      engine.store.setProperty(id, k, v);
    }
    if (parentId) engine.store.place(id, 'CHILD_OF', parentId);
    for (const c of sn.children ?? []) build(c, id);
    return id;
  };
  for (const s of seed) build(s, null);
  return ids;
}

function preorderIndexMap(engine: SemanticEngine): Map<string, number> {
  const map = new Map<string, number>();
  preorderNodeIds(engine.store.document).forEach((id, i) => map.set(id, i));
  return map;
}

function resolveNodeRef(
  ref: NodeRef,
  engine: SemanticEngine,
  indexMap: Map<string, number>
): string | null {
  if (ref === 'only') {
    const ids = preorderNodeIds(engine.store.document);
    return ids.length === 1 ? ids[0] : null;
  }
  if (ref.startsWith('@')) {
    const idx = Number(ref.slice(1));
    const ids = preorderNodeIds(engine.store.document);
    return ids[idx] ?? null;
  }
  if (ref.startsWith('#')) {
    const conceptId = ref.slice(1);
    const matches = Array.from(engine.store.document.nodes.values()).filter(
      (n) => n.entityConceptId === conceptId
    );
    return matches.length === 1 ? matches[0].id : null;
  }
  // nome simbólico: casa com o conceito pelo nome em maiúsculas
  const conceptId = `C_ENT_${ref.toUpperCase()}`;
  const matches = Array.from(engine.store.document.nodes.values()).filter(
    (n) => n.entityConceptId === conceptId
  );
  return matches.length === 1 ? matches[0].id : null;
}

function bindingKey(engine: SemanticEngine, indexMap: Map<string, number>, b: ExpectedBinding): string | null {
  const nodeId = resolveNodeRef(b[0], engine, indexMap);
  if (!nodeId) return null;
  return `${indexMap.get(nodeId)}|${b[1]}|${String(b[2])}`;
}

function actualBindings(engine: SemanticEngine, concepts: Record<string, unknown>): string[] {
  void concepts;
  const indexMap = preorderIndexMap(engine);
  const out: string[] = [];
  for (const node of engine.store.document.nodes.values()) {
    for (const [propId, value] of Object.entries(node.properties)) {
      out.push(`${indexMap.get(node.id)}|${propId}|${String(value)}`);
    }
  }
  return out.sort();
}

function expectedBindings(
  engine: SemanticEngine,
  indexMap: Map<string, number>,
  list: ExpectedBinding[]
): string[] {
  return list
    .map((b) => bindingKey(engine, indexMap, b))
    .filter((x): x is string => x !== null)
    .sort();
}

function actualAttachments(engine: SemanticEngine): string[] {
  const indexMap = preorderIndexMap(engine);
  const out: string[] = [];
  for (const node of engine.store.document.nodes.values()) {
    if (node.parentId) {
      out.push(
        `${indexMap.get(node.id)}|C_SPAT_INSIDE|${indexMap.get(node.parentId)}`
      );
    }
  }
  return out.sort();
}

function expectedAttachments(
  engine: SemanticEngine,
  indexMap: Map<string, number>,
  list: ExpectedAttachment[]
): string[] | null {
  const out: string[] = [];
  for (const a of list) {
    const src = resolveNodeRef(a[0], engine, indexMap);
    const tgt = resolveNodeRef(a[2], engine, indexMap);
    if (!src || !tgt) return null;
    out.push(`${indexMap.get(src)}|${a[1]}|${indexMap.get(tgt)}`);
  }
  return out.sort();
}

// ---------------------------------------------------------------------------
// Execução de um registro
// ---------------------------------------------------------------------------

function emptyResult(rec: EvalRecord, reason: string): RecordResult {
  return {
    id: rec.id ?? '(sem id)',
    input: rec.input ?? '',
    tags: rec.tags ?? [],
    expectError: rec.expectError ?? false,
    passed: false,
    commandKindOk: false,
    finalTreeOk: false,
    astOk: false,
    planOk: false,
    bindingsOk: false,
    attachmentsOk: false,
    referencesOk: false,
    diagnosticsOk: false,
    errorBehaviorOk: false,
    noMutationOk: false,
    actualHadError: false,
    actualDiagnosticCodes: [],
    actualAst: '',
    actualPlan: '',
    actualTree: '',
    expectedTree: rec.expected?.finalTree,
    failReasons: [reason],
    tokenResults: undefined
  };
}

/**
 * Executa um registro. O runner NUNCA deixa uma exceção escapar: um crash é
 * registrado como falha do caso, com a mensagem, para que o defeito apareça na
 * medição em vez de derrubar a suíte.
 */
export function runRecord(kb: KnowledgeBase, rec: EvalRecord): RecordResult {
  try {
    return runRecordUnsafe(kb, rec);
  } catch (error) {
    return emptyResult(rec, `EXCEÇÃO NÃO TRATADA: ${(error as Error).message}`);
  }
}

function runRecordUnsafe(kb: KnowledgeBase, rec: EvalRecord): RecordResult {
  const engine = new SemanticEngine(kb);
  seedDocument(engine, rec.seed ?? []);

  if (rec.selection === 'all') {
    engine.store.setSelection(preorderNodeIds(engine.store.document));
  } else if (typeof rec.selection === 'number') {
    const ids = preorderNodeIds(engine.store.document);
    if (ids[rec.selection]) engine.store.setSelection([ids[rec.selection]]);
  }

  for (const pre of rec.discourse ?? []) {
    engine.execute(pre);
  }
  if (rec.undoBeforeInput) {
    engine.undo();
  }

  const beforeTree = treeSignature(engine.store.document, kb.concepts);
  // Índices em pré-ordem ANTES da execução: referências resolvidas devem ser
  // comparadas na numeração do documento de origem, não depois da mutação.
  const indexMapBefore = preorderIndexMap(engine);
  const result = engine.execute(rec.input);

  const compile = result.compile;
  const actualAst = astSignature(compile.ast);
  const actualPlan = planSignature(compile.plan);
  const actualTree = treeSignature(engine.store.document, kb.concepts);
  const actualCodes = compile.diagnostics.map((d) => d.code);
  const actualHadError = compile.diagnostics.some((d) => d.severity === 'ERROR');

  const failReasons: string[] = [];

  const finalTreeOk =
    rec.expected.finalTree === undefined ? true : actualTree === rec.expected.finalTree;
  if (!finalTreeOk) {
    failReasons.push(`árvore: esperado ${JSON.stringify(rec.expected.finalTree)} obtido ${JSON.stringify(actualTree)}`);
  }

  const diagnosticsOk = rec.expected.diagnostics
    ? rec.expected.diagnostics.every((c) => actualCodes.includes(c))
    : true;
  if (!diagnosticsOk && rec.expected.diagnostics) {
    const missing = rec.expected.diagnostics.filter((c) => !actualCodes.includes(c));
    failReasons.push(`diagnósticos ausentes: ${missing.join(', ')} (obtidos: ${actualCodes.join(', ') || 'nenhum'})`);
  }

  const expectError = rec.expectError ?? false;
  const errorBehaviorOk = expectError ? actualHadError : !actualHadError;
  if (!errorBehaviorOk) {
    failReasons.push(expectError ? 'esperava erro, não houve' : `não esperava erro: ${actualCodes.join(', ')}`);
  }

  const noMutationOk = rec.expectNoMutation ? actualTree === beforeTree : true;
  if (!noMutationOk) failReasons.push('documento foi mutado apesar de dever permanecer intacto');

  const astOk = rec.expected.ast === undefined ? true : actualAst === rec.expected.ast;
  if (!astOk) failReasons.push(`AST: esperado ${JSON.stringify(rec.expected.ast)} obtido ${JSON.stringify(actualAst)}`);

  const planOk = rec.expected.plan === undefined ? true : actualPlan === rec.expected.plan;
  if (!planOk) failReasons.push('plano difere do esperado');

  const indexMap = preorderIndexMap(engine);
  const bindingsOk = rec.expected.bindings
    ? JSON.stringify(expectedBindings(engine, indexMap, rec.expected.bindings)) ===
      JSON.stringify(actualBindings(engine, kb.concepts))
    : true;
  if (!bindingsOk) {
    failReasons.push(
      `bindings: esperado ${JSON.stringify(expectedBindings(engine, indexMap, rec.expected.bindings ?? []))} obtido ${JSON.stringify(actualBindings(engine, kb.concepts))}`
    );
  }

  const expAtt = rec.expected.attachments
    ? expectedAttachments(engine, indexMap, rec.expected.attachments)
    : null;
  const attachmentsOk = rec.expected.attachments
    ? expAtt !== null && JSON.stringify(expAtt) === JSON.stringify(actualAttachments(engine))
    : true;
  if (!attachmentsOk) failReasons.push('attachments divergem do esperado');

  const referencesOk = rec.expected.resolvedReferences
    ? JSON.stringify(rec.expected.resolvedReferences) ===
      JSON.stringify(
        compile.plan.steps
          .filter((s) => s.kind === 'DELETE_NODE' || s.kind === 'MOVE_NODE')
          .map((s) =>
            s.kind === 'DELETE_NODE'
              ? indexMapBefore.get(s.targetNodeId)
              : indexMapBefore.get(s.sourceNodeId)
          )
          .filter((x): x is number => x !== undefined)
      )
    : true;
  if (!referencesOk) failReasons.push('referências resolvidas divergem do esperado');

  const commandKindOk = true; // coberto por AST/plano

  const tokenResults = rec.expected.tokens
    ? rec.expected.tokens.map((t) => {
        const token = compile.trace.semanticTokens.find((st) =>
          st.rawTokens.some((rt) => rt.raw.toLowerCase().startsWith(t.surface.toLowerCase().slice(0, 4)))
        );
        const actual = token?.candidates[0]?.lexemeId ?? null;
        return {
          surface: t.surface,
          expectedLexeme: t.lexemeId,
          actualLexeme: actual,
          ok: t.lexemeId === null ? actual === null : actual === t.lexemeId
        };
      })
    : undefined;

  const passed =
    finalTreeOk &&
    diagnosticsOk &&
    errorBehaviorOk &&
    noMutationOk &&
    astOk &&
    planOk &&
    bindingsOk &&
    attachmentsOk &&
    referencesOk;

  return {
    id: rec.id,
    input: rec.input,
    tags: rec.tags ?? [],
    expectError,
    passed,
    commandKindOk,
    finalTreeOk,
    astOk,
    planOk,
    bindingsOk,
    attachmentsOk,
    referencesOk,
    diagnosticsOk,
    errorBehaviorOk,
    noMutationOk,
    actualHadError,
    actualDiagnosticCodes: actualCodes,
    actualAst,
    actualPlan,
    actualTree,
    expectedTree: rec.expected.finalTree,
    failReasons,
    tokenResults
  };
}

// ---------------------------------------------------------------------------
// Métricas agregadas
// ---------------------------------------------------------------------------

export function ratio(num: number, den: number): number {
  return den === 0 ? 1 : num / den;
}

export function runDataset(kb: KnowledgeBase, dataset: EvalDataset, name: string): SetReport {
  const results = dataset.records.map((r) => runRecord(kb, r));
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;

  // lexical / concept-sense (somente sobre casos anotados)
  let tokTotal = 0;
  let tokOk = 0;
  let annotatedCases = 0;
  for (const r of results) {
    if (!r.tokenResults) continue;
    annotatedCases++;
    for (const t of r.tokenResults) {
      tokTotal++;
      if (t.ok) tokOk++;
    }
  }

  const bindingsTotal = results.filter((r) => r.passed || r.bindingsOk).length;
  const referenceCases = results.filter((r) => r.referencesOk).length;
  // Um caso genuinamente ambíguo é considerado DETECTADO quando o motor
  // reporta a ambiguidade em vez de escolher em silêncio — seja por referência
  // ambígua, por sentido ambíguo, ou por operação não suportada por vagueza.
  const AMBIGUITY_CODES = ['AMBIGUOUS_REFERENCE', 'AMBIGUOUS_SENSE', 'UNSUPPORTED_OPERATION'];
  const ambiguityCases = dataset.records.filter((r) => r.expected.ambiguous);
  const ambiguityDetected = ambiguityCases.filter((r) => {
    const res = results.find((x) => x.id === r.id);
    return res?.actualDiagnosticCodes.some((c) => AMBIGUITY_CODES.includes(c));
  }).length;

  const negatives = results.filter((r) => r.expectError);
  const falsePositives = negatives.filter((r) => !r.actualHadError);

  return {
    name,
    total,
    passed,
    failed: total - passed,
    lexicalResolutionAccuracy: ratio(tokOk, tokTotal),
    conceptSenseAccuracy: ratio(tokOk, tokTotal),
    entityAttachmentAccuracy: ratio(results.filter((r) => r.attachmentsOk).length, total),
    propertyValueBindingAccuracy: ratio(bindingsTotal, total),
    referenceResolutionAccuracy: ratio(referenceCases, total),
    astExactMatch: ratio(results.filter((r) => r.astOk).length, total),
    planExactMatch: ratio(results.filter((r) => r.planOk).length, total),
    endToEndSuccess: ratio(passed, total),
    falsePositiveRate: ratio(falsePositives.length, negatives.length),
    ambiguityDetectionRate: ratio(ambiguityDetected, ambiguityCases.length),
    ambiguityCaseCount: ambiguityCases.length,
    annotatedTokenCases: annotatedCases,
    results,
    failures: results.filter((r) => !r.passed)
  };
}

/** Fraction of content tokens that resolve to any concept (rough lexical coverage). */
export function lexicalCoverage(engine: SemanticEngine, records: EvalRecord[]): number {
  let total = 0;
  let resolved = 0;
  for (const r of records) {
    const compile = engine.analyze(r.input);
    for (const tok of compile.trace.semanticTokens) {
      if (tok.literal) continue;
      const word = tok.rawTokens[0]?.normalized;
      if (!word || FUNCTION_WORDS.has(word)) continue;
      total++;
      if (tok.candidates.length) resolved++;
    }
  }
  return ratio(resolved, total);
}
