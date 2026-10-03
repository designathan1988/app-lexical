/**
 * Anota expectativas derivadas da revisão semântica registro a registro
 * (F1.4): ast, plan, bindings, attachments, resolvedReferences, readings e
 * tokens. O valor gravado é o comportamento CORRETO conferido por raciocínio
 * contra a árvore final já verificada; registros com defeito conhecido não
 * são anotados aqui (suas expectativas corretas vivem nos casos `morph`).
 *
 * Uso: npx vite-node scripts/annotate-datasets.ts <dev|regression> [--write]
 *
 * Sem `--write`, apenas imprime o que seria anotado (revisão).
 */
import fs from 'node:fs';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { prepareEngine } from '../src/eval/runner';
import { astSignature, planSignature, featsSignature, treeSignature } from '../src/eval/signatures';
import { preorderNodeIds } from '../src/engine/document/traversal';
import { DEV_DATASET, REGRESSION_DATASET } from '../src/eval/loader';
import { validateDataset } from '../src/eval/datasetSchema';
import type { EvalDataset, EvalRecord } from '../src/eval/datasetSchema';

const target = process.argv[2];
const write = process.argv.includes('--write');
if (target !== 'dev' && target !== 'regression') {
  console.error('uso: annotate-datasets.ts <dev|regression> [--write]');
  process.exit(2);
}
const FILE = `src/eval/data/${target}.json`;
const dataset: EvalDataset = target === 'dev' ? DEV_DATASET : REGRESSION_DATASET;

const kb = createInitialKnowledgeBase();

/** Palavras de conteúdo que valem leitura (nomes, verbos, adjetivos, numerais). */
const READING_POS = new Set(['NOUN', 'VERB', 'ADJECTIVE', 'NUMERAL']);

/**
 * Formas que este script não anota, por revisão:
 * - `um/uma/uns/umas`: em contexto são artigo (DETERMINER), mas o candidato
 *   escolhido é o numeral; a desambiguação correta é assunto do novo
 *   front-end, e o alvo já está nos casos `morph`;
 * - verbo no infinitivo legado sem traços: anotar `''` enshrines análise
 *   errada; o alvo (`VerbForm=Inf`) vive nos casos `morph`.
 */
const SKIP_SURFACES = new Set(['um', 'uma', 'uns', 'umas']);

interface Annotation {
  ast?: string;
  plan?: string;
  bindings?: Array<[string, string, string]>;
  attachments?: Array<[string, string, string]>;
  resolvedReferences?: number[];
  readings?: Array<{ surface: string; lemma: string; feats: string }>;
  tokens?: Array<{ surface: string; lexemeId: string | null; conceptId?: string | null }>;
  skip?: string;
}

function annotateRecord(rec: EvalRecord): Annotation | null {
  if (rec.expectError) return null;
  if (rec.expected.ast !== undefined || rec.expected.plan !== undefined) {
    return { skip: 'já anotado' };
  }

  const engine = prepareEngine(kb, rec);
  const treeBefore = treeSignature(engine.store.document, kb.concepts);
  const indexBefore = new Map<string, number>();
  preorderNodeIds(engine.store.document).forEach((id, i) => indexBefore.set(id, i));

  const result = engine.execute(rec.input);
  const compile = result.compile;

  // Nunca anotar comportamento com defeito conhecido: se o documento mudou de
  // forma inesperada (não bate com a árvore esperada), não anotar.
  const treeAfter = treeSignature(engine.store.document, kb.concepts);
  if (rec.expected.finalTree !== undefined && treeAfter !== rec.expected.finalTree) {
    return { skip: `árvore diverge: ${treeAfter}` };
  }
  const hasError = compile.diagnostics.some((d) => d.severity === 'ERROR');
  if (hasError) {
    return { skip: `erro: ${compile.diagnostics.map((d) => d.code).join(',')}` };
  }

  const out: Annotation = {
    ast: astSignature(compile.ast),
    plan: planSignature(compile.plan)
  };

  const indexAfter = new Map<string, number>();
  preorderNodeIds(engine.store.document).forEach((id, i) => indexAfter.set(id, i));

  // bindings: todas as propriedades do documento final (comparação exata).
  const bindings: Array<[string, string, string]> = [];
  for (const node of engine.store.document.nodes.values()) {
    for (const [prop, value] of Object.entries(node.properties)) {
      bindings.push([`@${indexAfter.get(node.id)}`, prop, String(value)]);
    }
  }
  if (bindings.length) out.bindings = bindings.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

  // attachments: relações de parentesco do documento final.
  const attachments: Array<[string, string, string]> = [];
  for (const node of engine.store.document.nodes.values()) {
    if (node.parentId) {
      attachments.push([
        `@${indexAfter.get(node.id)}`,
        'C_SPAT_INSIDE',
        `@${indexAfter.get(node.parentId)}`
      ]);
    }
  }
  if (attachments.length) out.attachments = attachments.sort((a, b) => a[0].localeCompare(b[0]));

  // resolvedReferences: índices (pré-ordem de ANTES) dos alvos de DELETE/MOVE.
  const refs = compile.plan.steps
    .filter((s) => s.kind === 'DELETE_NODE' || s.kind === 'MOVE_NODE')
    .map((s) =>
      s.kind === 'DELETE_NODE' ? indexBefore.get(s.targetNodeId) : indexBefore.get(s.sourceNodeId)
    )
    .filter((x): x is number => x !== undefined);
  if (refs.length) out.resolvedReferences = refs;

  void treeBefore;

  // readings/tokens: leitura escolhida (candidato de maior score) dos tokens
  // de conteúdo — revisada à mão antes do commit.
  const readings: Annotation['readings'] = [];
  const tokens: NonNullable<Annotation['tokens']> = [];
  const seen = new Set<string>();
  for (const token of compile.trace.semanticTokens) {
    if (token.literal) continue;
    const candidate = token.candidates[0];
    if (!candidate?.lexemeId) continue;
    const lexeme = kb.lexemes[candidate.lexemeId];
    if (!lexeme || !READING_POS.has(lexeme.pos)) continue;
    const surface = token.rawTokens.map((t) => t.raw).join(' ');
    const key = surface.toLowerCase();
    if (seen.has(key)) continue;
    if (SKIP_SURFACES.has(key)) continue;
    const feats = featsSignature(candidate.morphology);
    if (lexeme.pos === 'VERB' && feats === '') continue;
    seen.add(key);
    readings.push({
      surface,
      lemma: lexeme.lemma,
      feats
    });
    tokens.push({
      surface,
      lexemeId: candidate.lexemeId,
      conceptId: candidate.conceptId || null
    });
  }
  if (readings.length) {
    out.readings = readings;
    out.tokens = tokens;
  }

  return out;
}

const plan: Array<{ rec: EvalRecord; ann: Annotation | null }> = dataset.records.map((rec) => ({
  rec,
  ann: annotateRecord(rec)
}));

let annotated = 0;
let skipped = 0;
for (const { rec, ann } of plan) {
  if (!ann) continue;
  if (ann.skip) {
    skipped++;
    continue;
  }
  annotated++;
  console.log(`\n## ${rec.id} «${rec.input}»`);
  console.log(`   ast: ${JSON.stringify(ann.ast)}`);
  console.log(`   plan: ${JSON.stringify(ann.plan)}`);
  if (ann.bindings) console.log(`   bindings: ${JSON.stringify(ann.bindings)}`);
  if (ann.attachments) console.log(`   attachments: ${JSON.stringify(ann.attachments)}`);
  if (ann.resolvedReferences) console.log(`   refs: ${JSON.stringify(ann.resolvedReferences)}`);
  if (ann.readings) console.log(`   readings: ${JSON.stringify(ann.readings)}`);
}
console.log(`\n== ${annotated} anotáveis, ${skipped} já anotados/ignorados, de ${dataset.records.length}`);

if (write) {
  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')) as EvalDataset;
  for (const { rec, ann } of plan) {
    if (!ann || ann.skip) continue;
    const target = raw.records.find((r) => r.id === rec.id);
    if (!target) continue;
    if (ann.ast !== undefined) target.expected.ast = ann.ast;
    if (ann.plan !== undefined) target.expected.plan = ann.plan;
    if (ann.bindings) target.expected.bindings = ann.bindings.map((b) => [...b]);
    if (ann.attachments) target.expected.attachments = ann.attachments.map((a) => [...a]);
    if (ann.resolvedReferences) target.expected.resolvedReferences = ann.resolvedReferences;
    if (ann.readings) target.expected.readings = ann.readings;
    if (ann.tokens) target.expected.tokens = ann.tokens;
  }
  validateDataset(raw);
  fs.writeFileSync(FILE, JSON.stringify(raw, null, 2) + '\n');
  console.log(`gravado em ${FILE}`);
}
