import type { ConceptId } from '../engine/types';

/**
 * Esquema do dataset versionado (§A7).
 *
 * Os resultados esperados são escritos por raciocínio sobre a semântica do
 * domínio — nunca copiados da saída do motor.
 */

export interface SeedNodeJson {
  entityConceptId: ConceptId;
  text?: string;
  properties?: Record<ConceptId, string | number | boolean>;
  children?: SeedNodeJson[];
}

/**
 * Referência simbólica a um nó:
 *  - `"@N"`   → índice N em pré-ordem do documento final
 *  - `"#CONC"`→ o único nó do documento com aquele conceito
 *  - `"only"` → o único nó criado pelo comando
 */
export type NodeRef = string;

/** Tripla (entidade, propriedade, valor) esperada após a execução. */
export type ExpectedBinding = [entityRef: NodeRef, propertyConceptId: string, value: string];

/** Par (fonte, relação, alvo) esperado de containment/posição. */
export type ExpectedAttachment = [source: NodeRef, relationConceptId: string, target: NodeRef];

/** Anotação lexical de um token de conteúdo da entrada. */
export interface ExpectedToken {
  /** Forma escrita como aparece na frase. */
  surface: string;
  /** Lexema correto, ou null se a forma não deve resolver para nenhum. */
  lexemeId: string | null;
  /** Conceito correto, ou null. */
  conceptId?: string | null;
}

/**
 * Leitura morfológica esperada de um token, após a desambiguação.
 *
 * `feats` usa o formato canônico de `featsSignature` (traços do Universal
 * Dependencies, ordenados, separados por `|`), por exemplo `Gender=Fem|Number=Sing`.
 */
export interface ExpectedReading {
  /** Forma escrita como aparece na frase. */
  surface: string;
  /** Lema do lexema correto. */
  lemma: string;
  /** Traços no formato canônico; `''` quando a forma não tem traços. */
  feats: string;
}

export interface ExpectedOutcome {
  /** Assinatura canônica da AST (`astSignature`). */
  ast?: string;
  /** Assinatura canônica do plano (`planSignature`, IDs normalizados). */
  plan?: string;
  /** Assinatura canônica da árvore final (`treeSignature`). */
  finalTree?: string;
  /** Índices de pré-ordem do documento esperados para a resolução de referências. */
  resolvedReferences?: number[];
  /** Triplas (entidade, propriedade, valor) aplicadas. */
  bindings?: ExpectedBinding[];
  /** Pares (fonte, relação, alvo) de posicionamento. */
  attachments?: ExpectedAttachment[];
  /** Códigos de diagnóstico esperados (todos devem estar presentes). */
  diagnostics?: string[];
  /** Severidade mínima esperada no primeiro diagnóstico do código citado. */
  severities?: Record<string, 'INFO' | 'WARNING' | 'ERROR'>;
  /** Anotação lexical por token de conteúdo (base das métricas lexicais). */
  tokens?: ExpectedToken[];
  /** Leitura morfológica esperada por token (base da métrica morfológica). */
  readings?: ExpectedReading[];
  /** Tensão de ambiguidade: o caso é genuinamente ambíguo. */
  ambiguous?: boolean;
}

export interface EvalRecord {
  id: string;
  input: string;
  /** Documento inicial, em pré-ordem. */
  seed?: SeedNodeJson[];
  /** Índice (pré-ordem do seed) a selecionar antes do comando, ou 'all'. */
  selection?: number | 'all';
  /** Comandos executados antes, cuja única finalidade é montar o discurso. */
  discourse?: string[];
  /** Desfaz o último comando do discurso antes de executar `input`. */
  undoBeforeInput?: boolean;
  expected: ExpectedOutcome;
  expectError?: boolean;
  expectNoMutation?: boolean;
  tags?: string[];
}

export interface EvalDataset {
  version: string;
  schemaVersion: string;
  description?: string;
  records: EvalRecord[];
}

export const DATASET_SCHEMA_VERSION = '1.0.0';

export class DatasetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatasetValidationError';
  }
}

function fail(message: string): never {
  throw new DatasetValidationError(message);
}

/**
 * Valida um JSON externo como `EvalDataset` (usado por `score.ts --dataset`).
 * Lança `DatasetValidationError` com a primeira inconsistência encontrada.
 */
export function validateDataset(raw: unknown): EvalDataset {
  if (!raw || typeof raw !== 'object') fail('dataset não é um objeto');
  const ds = raw as Partial<EvalDataset>;
  if (typeof ds.version !== 'string') fail('campo "version" ausente ou não textual');
  if (ds.schemaVersion !== DATASET_SCHEMA_VERSION) {
    fail(`schemaVersion ${String(ds.schemaVersion)} ≠ ${DATASET_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(ds.records)) fail('campo "records" ausente ou não é lista');
  const ids = new Set<string>();
  ds.records.forEach((r, i) => {
    if (!r || typeof r !== 'object') fail(`registro ${i} não é um objeto`);
    if (typeof r.id !== 'string' || !r.id) fail(`registro ${i} sem "id" textual`);
    if (typeof r.input !== 'string') fail(`registro "${r.id}" sem "input" textual`);
    if (!r.expected || typeof r.expected !== 'object') {
      fail(`registro "${r.id}" sem "expected"`);
    }
    if (ids.has(r.id)) fail(`id duplicado "${r.id}"`);
    ids.add(r.id);
    const num = (v: unknown, field: string) => {
      if (v === undefined) return;
      if (!Array.isArray(v) || v.some((x) => typeof x !== 'number')) {
        fail(`registro "${r.id}": "${field}" deve ser lista de números`);
      }
    };
    num(r.expected.resolvedReferences, 'resolvedReferences');
  });
  return ds as EvalDataset;
}
