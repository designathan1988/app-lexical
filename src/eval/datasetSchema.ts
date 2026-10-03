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
