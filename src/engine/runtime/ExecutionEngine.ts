import type { ConceptId, DocumentNodeId, TempNodeId } from '../types';
import type { ConceptNode } from '../ontology/Concept';
import type { BuilderRuntimeAdapter } from './BuilderRuntimeAdapter';
import type { ExecutionPlan, ExecutableReference } from '../planning/ExecutionPlan';
import type { Diagnostic } from '../diagnostics';
import { diagnostic } from '../diagnostics';
import { isTempNodeId, tempIdOf } from '../planning/TempNodes';

export interface ExecutionResult {
  success: boolean;
  diagnostics: Diagnostic[];
  createdNodes: Record<TempNodeId, DocumentNodeId>;
  mutations: string[];
  /** Nós efetivamente afetados (base da seleção pós-comando). */
  touchedNodes: DocumentNodeId[];
}

/**
 * Executa o plano contra o runtime real.
 *
 * Se qualquer primitiva falhar, a TRANSAÇÃO INTEIRA é revertida e o resultado
 * é `success: false` com diagnóstico — nunca uma exceção, nunca um documento
 * parcialmente mutado. A lista de mutações contém apenas o que foi aplicado.
 */
export class ExecutionEngine {
  /** Rótulo opcional da transação (a frase do usuário). */
  transactionLabel: string | undefined;

  constructor(
    private concepts: Record<ConceptId, ConceptNode>,
    private adapter: BuilderRuntimeAdapter
  ) {}

  /**
   * @param initialTempMap temporários já materializados (simulação de várias
   *   orações): permite executar uma continuação do plano.
   */
  execute(plan: ExecutionPlan, initialTempMap?: Map<TempNodeId, DocumentNodeId>): ExecutionResult {
    const mutations: string[] = [];
    const empty: Record<TempNodeId, DocumentNodeId> = {};

    const fatal = plan.diagnostics.some((d) => d.severity === 'ERROR');
    if (fatal) {
      return {
        success: false,
        diagnostics: plan.diagnostics,
        createdNodes: empty,
        mutations,
        touchedNodes: []
      };
    }

    const tempMap = new Map<TempNodeId, DocumentNodeId>(initialTempMap ?? []);
    const diagnostics: Diagnostic[] = [...plan.diagnostics];
    const selectionSteps: DocumentNodeId[] = [];

    this.adapter.beginTransaction?.(this.transactionLabel);
    try {
      for (const step of plan.steps) {
        switch (step.kind) {
          case 'CREATE_NODE': {
            const nodeId = this.adapter.createNode({
              entityConceptId: step.entityConceptId,
              text: step.text
            });
            tempMap.set(step.tempId, nodeId);
            // O tempId original (antes da expansão de quantidade) aponta para o
            // primeiro nó do grupo, para que o discurso promova a menção.
            if (!tempMap.has(step.sourceTempId)) {
              tempMap.set(step.sourceTempId, nodeId);
            }
            mutations.push(`CREATE_NODE ${nodeId} (${step.entityConceptId})`);
            break;
          }

          case 'SET_PROPERTY': {
            const nodeId = this.resolveExecutableReference(step.target, tempMap);
            const property = this.concepts[step.propertyConceptId];
            if (property?.kind !== 'PROPERTY') {
              throw new RuntimeFailure('INVALID_PROPERTY',
                `Propriedade inválida ${step.propertyConceptId}.`, step.span);
            }
            const result = this.adapter.setProperty({
              nodeId,
              propertyConceptId: property.id,
              runtimeProperty: property.runtimeProperty,
              value: step.value,
              targetField: property.targetField
            });
            if (!result.ok) {
              throw new RuntimeFailure(result.code, result.message, step.span, result.subcode);
            }
            mutations.push(`SET_PROPERTY ${nodeId}.${property.runtimeProperty} = ${step.value}`);
            break;
          }

          case 'CLEAR_PROPERTY': {
            const nodeId = this.resolveExecutableReference(step.target, tempMap);
            const property = this.concepts[step.propertyConceptId];
            if (property?.kind !== 'PROPERTY') {
              throw new RuntimeFailure('INVALID_PROPERTY',
                `Propriedade inválida ${step.propertyConceptId}.`, step.span);
            }
            const result = this.adapter.clearProperty({
              nodeId,
              propertyConceptId: property.id,
              runtimeProperty: property.runtimeProperty,
              clearValue: property.clearValue ?? null,
              targetField: property.targetField
            });
            if (!result.ok) {
              throw new RuntimeFailure(result.code, result.message, step.span, result.subcode);
            }
            mutations.push(`CLEAR_PROPERTY ${nodeId}.${property.runtimeProperty}`);
            break;
          }

          case 'PLACE_NODE': {
            const sourceNodeId = this.resolveExecutableReference(step.source, tempMap);
            const targetNodeId = this.resolveExecutableReference(step.target, tempMap);
            const relation = this.concepts[step.relationConceptId];
            if (relation?.kind !== 'SPATIAL') {
              throw new RuntimeFailure('INVALID_CONTAINMENT',
                `Relação espacial inválida ${step.relationConceptId}.`, step.span);
            }
            const result = this.adapter.place({
              sourceNodeId,
              relation: relation.relation,
              targetNodeId
            });
            if (!result.ok) {
              throw new RuntimeFailure(result.code, result.message, step.span, result.subcode);
            }
            mutations.push(`PLACE_NODE ${sourceNodeId} ${relation.relation} ${targetNodeId}`);
            break;
          }

          case 'DELETE_NODE': {
            const targetNodeId = this.resolveNodeId(step.targetNodeId, tempMap);
            const result = this.adapter.deleteNode(targetNodeId);
            if (!result.ok) {
              throw new RuntimeFailure(result.code, result.message, step.span, result.subcode);
            }
            mutations.push(`DELETE_NODE ${targetNodeId}`);
            break;
          }

          case 'MOVE_NODE': {
            const targetNodeId = this.resolveExecutableReference(step.target, tempMap);
            const relation = this.concepts[step.relationConceptId];
            if (relation?.kind !== 'SPATIAL') {
              throw new RuntimeFailure('INVALID_CONTAINMENT',
                `Relação espacial inválida ${step.relationConceptId}.`, step.span);
            }
            const sourceNodeId = this.resolveNodeId(step.sourceNodeId, tempMap);
            const result = this.adapter.place({
              sourceNodeId,
              relation: relation.relation,
              targetNodeId
            });
            if (!result.ok) {
              throw new RuntimeFailure(result.code, result.message, step.span, result.subcode);
            }
            mutations.push(`MOVE_NODE ${sourceNodeId} ${relation.relation} ${targetNodeId}`);
            break;
          }

          case 'QUERY_NODE': {
            const targetNodeId = this.resolveNodeId(step.targetNodeId, tempMap);
            this.adapter.inspectNode(targetNodeId);
            selectionSteps.push(targetNodeId);
            mutations.push(`QUERY_NODE ${targetNodeId}`);
            break;
          }
        }
      }

      if (selectionSteps.length) {
        this.adapter.selectNodes?.(selectionSteps);
      }

      this.adapter.commitTransaction?.();
    } catch (error) {
      this.adapter.rollbackTransaction?.();
      const runtimeError =
        error instanceof RuntimeFailure
          ? error
          : new RuntimeFailure('RUNTIME_MUTATION_FAILED', (error as Error).message);

      const failedStep = plan.steps[Math.min(mutations.length, plan.steps.length - 1)];
      diagnostics.push(
        diagnostic('executor', 'ERROR', runtimeError.code,
          `A transação foi revertida: ${runtimeError.message}`, runtimeError.span ?? failedStep?.span, {
            subcode: runtimeError.subcode
          })
      );

      return {
        success: false,
        diagnostics,
        createdNodes: empty,
        mutations: [],
        touchedNodes: []
      };
    }

    return {
      success: true,
      diagnostics,
      createdNodes: Object.fromEntries(tempMap),
      mutations,
      touchedNodes: this.touchedNodes()
    };
  }

  private touchedNodes(): DocumentNodeId[] {
    const adapter = this.adapter as unknown as { touchedNodes?: () => DocumentNodeId[] };
    return adapter.touchedNodes?.() ?? [];
  }

  /** Id bruto do plano → id real (traduz `tmp:<tempId>` pelo mapa da transação). */
  private resolveNodeId(nodeId: DocumentNodeId, tempMap: Map<TempNodeId, DocumentNodeId>): DocumentNodeId {
    if (!isTempNodeId(nodeId)) return nodeId;
    const resolved = tempMap.get(tempIdOf(nodeId));
    if (!resolved) {
      throw new RuntimeFailure('RUNTIME_MUTATION_FAILED', `O nó temporário ${tempIdOf(nodeId)} não foi criado.`);
    }
    return resolved;
  }

  private resolveExecutableReference(
    reference: ExecutableReference,
    tempMap: Map<TempNodeId, DocumentNodeId>
  ): DocumentNodeId {
    if (reference.kind === 'NODE') return this.resolveNodeId(reference.nodeId, tempMap);

    const resolved = tempMap.get(reference.tempId);
    if (!resolved) {
      throw new RuntimeFailure(
        'RUNTIME_MUTATION_FAILED',
        `O nó temporário ${reference.tempId} não foi criado.`
      );
    }
    return resolved;
  }
}

class RuntimeFailure extends Error {
  constructor(
    public code: string,
    message: string,
    public span?: { start: number; end: number },
    public subcode?: string
  ) {
    super(message);
    this.name = 'RuntimeFailure';
  }
}
