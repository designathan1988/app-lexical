import { SemanticEngine } from '../engine/SemanticEngine';
import type { KnowledgeBase } from '../knowledge/knowledgeBase';
import { treeSignature, astSignature, planSignature, featsSignature } from './signatures';
import { preorderNodeIds } from '../engine/document/traversal';
import { FUNCTION_WORDS } from '../engine/parser/Grammar';
import type { SemanticToken } from '../engine/parser/SemanticToken';
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

export interface TokenResult {
  surface: string;
  expectedLexeme: string | null;
  actualLexeme: string | null;
  lexemeOk: boolean;
  expectedConcept: string | null | undefined;
  actualConcept: string | null;
  senseOk: boolean | undefined;
}

export interface ReadingResult {
  surface: string;
  expectedLemma: string;
  actualLemma: string | null;
  expectedFeats: string;
  actualFeats: string;
  ok: boolean;
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

  /** Resultado por token anotado (lexema e sentido). */
  tokenResults?: TokenResult[];
  /** Resultado por leitura morfológica anotada. */
  readingResults?: ReadingResult[];
}

/**
 * Valor de uma métrica.
 *
 * - `value` é a acurácia observada, ou `null` quando o conjunto não tem
 *   NENHUM item com aquela expectativa — nunca 100% com denominador zero.
 * - `covered` é quantos registros do conjunto têm a expectativa (cobertura).
 * - `total` é o número de registros do conjunto.
 */
export interface MetricValue {
  value: number | null;
  covered: number;
  total: number;
  /** Itens avaliados (tokens, triplas, casos) dentro dos registros cobertos. */
  items: number;
}

export interface SetReport {
  name: string;
  total: number;
  passed: number;
  failed: number;
  metrics: {
    lexicalAccuracy: MetricValue;
    senseAccuracy: MetricValue;
    morphologicalAccuracy: MetricValue;
    attachmentAccuracy: MetricValue;
    bindingAccuracy: MetricValue;
    referenceAccuracy: MetricValue;
    astExactMatch: MetricValue;
    planExactMatch: MetricValue;
    endToEnd: MetricValue;
    falsePositiveRate: MetricValue;
    ambiguityDetectionRate: MetricValue;
  };
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

/** Conta quantos itens da lista esperada estão presentes na lista real. */
function matchedItems(expected: string[], actual: string[]): number {
  const pool = [...actual];
  let matched = 0;
  for (const item of expected) {
    const idx = pool.indexOf(item);
    if (idx >= 0) {
      pool.splice(idx, 1);
      matched++;
    }
  }
  return matched;
}

// ---------------------------------------------------------------------------
// Alinhamento token anotado ↔ token real
// ---------------------------------------------------------------------------

function normalizeSurface(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * O token real correspondente a uma anotação. Casa pela superfície
 * normalizada (sem acento/caixa) na ordem de ocorrência.
 */
function findActualToken(
  tokens: SemanticToken[],
  surface: string,
  used: Set<number>
): SemanticToken | null {
  const want = normalizeSurface(surface);
  for (let i = 0; i < tokens.length; i++) {
    if (used.has(i)) continue;
    const actual = normalizeSurface(tokens[i].rawTokens.map((t) => t.raw).join(' '));
    if (actual === want) {
      used.add(i);
      return tokens[i];
    }
  }
  return null;
}

/**
 * Leitura escolhida de um token.
 *
 * No front-end legado a escolha exposta no trace é o primeiro candidato
 * (maior score). A Fase 3 substitui isto pela leitura desambiguada do
 * pipeline morfossintático, mantendo a mesma interface.
 */
function chosenReading(token: SemanticToken | null): {
  lexemeId: string | null;
  conceptId: string | null;
  lexis: SemanticToken['candidates'][number] | null;
} {
  const candidate = token?.candidates[0] ?? null;
  return {
    lexemeId: candidate?.lexemeId ?? null,
    conceptId: candidate ? candidate.conceptId || null : null,
    lexis: candidate
  };
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
    tokenResults: undefined,
    readingResults: undefined
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
  const expBind = rec.expected.bindings
    ? expectedBindings(engine, indexMap, rec.expected.bindings)
    : null;
  const actBind = rec.expected.bindings ? actualBindings(engine, kb.concepts) : null;
  const bindingsOk =
    rec.expected.bindings === undefined
      ? true
      : expBind !== null && JSON.stringify(expBind) === JSON.stringify(actBind);
  if (!bindingsOk) {
    failReasons.push(
      `bindings: esperado ${JSON.stringify(expBind)} obtido ${JSON.stringify(actBind)}`
    );
  }

  const expAtt = rec.expected.attachments
    ? expectedAttachments(engine, indexMap, rec.expected.attachments)
    : null;
  const actAtt = rec.expected.attachments ? actualAttachments(engine) : null;
  const attachmentsOk =
    rec.expected.attachments === undefined
      ? true
      : expAtt !== null && JSON.stringify(expAtt) === JSON.stringify(actAtt);
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

  const usedTokens = new Set<number>();
  const tokenResults: TokenResult[] | undefined = rec.expected.tokens
    ? rec.expected.tokens.map((t) => {
        const token = findActualToken(compile.trace.semanticTokens, t.surface, usedTokens);
        const chosen = chosenReading(token);
        const lexemeOk = t.lexemeId === null ? chosen.lexemeId === null : chosen.lexemeId === t.lexemeId;
        const senseOk =
          t.conceptId === undefined
            ? undefined
            : t.conceptId === null
              ? chosen.conceptId === null
              : chosen.conceptId === t.conceptId;
        return {
          surface: t.surface,
          expectedLexeme: t.lexemeId,
          actualLexeme: chosen.lexemeId,
          lexemeOk,
          expectedConcept: t.conceptId,
          actualConcept: chosen.conceptId,
          senseOk
        };
      })
    : undefined;

  const readingResults: ReadingResult[] | undefined = rec.expected.readings
    ? rec.expected.readings.map((r) => {
        const token = findActualToken(compile.trace.semanticTokens, r.surface, new Set());
        const chosen = chosenReading(token);
        const lema = chosen.lexemeId ? (kb.lexemes[chosen.lexemeId]?.lemma ?? null) : null;
        const feats = featsSignature(chosen.lexis?.morphology);
        const ok = lema === r.lemma && feats === r.feats;
        return {
          surface: r.surface,
          expectedLemma: r.lemma,
          actualLemma: lema,
          expectedFeats: r.feats,
          actualFeats: feats,
          ok
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
    tokenResults,
    readingResults
  };
}

// ---------------------------------------------------------------------------
// Métricas agregadas
// ---------------------------------------------------------------------------

function metricValue(
  matched: number,
  items: number,
  covered: number,
  total: number
): MetricValue {
  return { value: items === 0 ? null : matched / items, covered, total, items };
}

/** @deprecated Use `MetricValue`. Mantido apenas para código legado. */
export function ratio(num: number, den: number): number | null {
  return den === 0 ? null : num / den;
}

export function runDataset(kb: KnowledgeBase, dataset: EvalDataset, name: string): SetReport {
  const results = dataset.records.map((r) => runRecord(kb, r));
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const byId = new Map(results.map((r) => [r.id, r]));

  // Lexical: só sobre registros que anotaram tokens.
  let lexItems = 0;
  let lexMatched = 0;
  let lexCovered = 0;
  let senseItems = 0;
  let senseMatched = 0;
  let senseCovered = 0;
  let readItems = 0;
  let readMatched = 0;
  let readCovered = 0;
  for (const r of results) {
    if (r.tokenResults?.length) {
      lexCovered++;
      for (const t of r.tokenResults) {
        lexItems++;
        if (t.lexemeOk) lexMatched++;
      }
    }
    const senseTokens = r.tokenResults?.filter((t) => t.senseOk !== undefined) ?? [];
    if (senseTokens.length) {
      senseCovered++;
      for (const t of senseTokens) {
        senseItems++;
        if (t.senseOk) senseMatched++;
      }
    }
    if (r.readingResults?.length) {
      readCovered++;
      for (const rr of r.readingResults) {
        readItems++;
        if (rr.ok) readMatched++;
      }
    }
  }

  // Bindings e attachments: triplas esperadas presentes no resultado.
  let bindItems = 0;
  let bindMatched = 0;
  let bindCovered = 0;
  let attItems = 0;
  let attMatched = 0;
  let attCovered = 0;
  for (const rec of dataset.records) {
    const r = byId.get(rec.id);
    if (!r) continue;
    if (rec.expected.bindings) {
      bindCovered++;
      bindItems += rec.expected.bindings.length;
      if (r.bindingsOk) bindMatched += rec.expected.bindings.length;
    }
    if (rec.expected.attachments) {
      attCovered++;
      attItems += rec.expected.attachments.length;
      if (r.attachmentsOk) attMatched += rec.expected.attachments.length;
    }
  }

  // Referências / AST / plano: por registro.
  const refCov = results.filter((_, i) => dataset.records[i].expected.resolvedReferences);
  const refOk = results.filter((r, i) => dataset.records[i].expected.resolvedReferences && r.referencesOk);
  const astCov = results.filter((_, i) => dataset.records[i].expected.ast !== undefined);
  const astOk = results.filter((r, i) => dataset.records[i].expected.ast !== undefined && r.astOk);
  const planCov = results.filter((_, i) => dataset.records[i].expected.plan !== undefined);
  const planOk = results.filter((r, i) => dataset.records[i].expected.plan !== undefined && r.planOk);

  // Ambiguidade: casos marcados explicitamente como genuinamente ambíguos.
  const AMBIGUITY_CODES = ['AMBIGUOUS_REFERENCE', 'AMBIGUOUS_SENSE', 'UNSUPPORTED_OPERATION'];
  const ambiguityCases = dataset.records.filter((r) => r.expected.ambiguous);
  const ambiguityDetected = ambiguityCases.filter((rec) => {
    const res = byId.get(rec.id);
    return res?.actualDiagnosticCodes.some((c) => AMBIGUITY_CODES.includes(c));
  });

  const negatives = results.filter((r) => r.expectError);
  const falsePositives = negatives.filter((r) => !r.actualHadError);

  return {
    name,
    total,
    passed,
    failed: total - passed,
    metrics: {
      lexicalAccuracy: metricValue(lexMatched, lexItems, lexCovered, total),
      senseAccuracy: metricValue(senseMatched, senseItems, senseCovered, total),
      morphologicalAccuracy: metricValue(readMatched, readItems, readCovered, total),
      attachmentAccuracy: metricValue(attMatched, attItems, attCovered, total),
      bindingAccuracy: metricValue(bindMatched, bindItems, bindCovered, total),
      referenceAccuracy: metricValue(refOk.length, refCov.length, refCov.length, total),
      astExactMatch: metricValue(astOk.length, astCov.length, astCov.length, total),
      planExactMatch: metricValue(planOk.length, planCov.length, planCov.length, total),
      endToEnd: metricValue(passed, total, total, total),
      falsePositiveRate: metricValue(
        falsePositives.length,
        negatives.length,
        negatives.length,
        total
      ),
      ambiguityDetectionRate: metricValue(
        ambiguityDetected.length,
        ambiguityCases.length,
        ambiguityCases.length,
        total
      )
    },
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
  return ratio(resolved, total) ?? 0;
}
