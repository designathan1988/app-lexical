import type { ConceptId, DocumentNodeId, TempNodeId } from '../types';
import type { ConceptNode } from '../ontology/Concept';
import type { DocumentModel } from '../document/DocumentModel';
import { isAncestor, preorderNodeIds } from '../document/traversal';
import type { ExecutionPlan, ExecutableReference } from './ExecutionPlan';
import type { Diagnostic } from '../diagnostics';
import { diagnostic } from '../diagnostics';
import { isTempNodeId, tempIdOf } from './TempNodes';

/**
 * As affordances da ontologia são EXECUTADAS aqui, antes da mutação:
 * propriedades permitidas, categorias de valores, pais/filhos permitidos,
 * capacidade de conter filhos, ciclos, auto-relação, existência de alvos,
 * cardinalidade e operações permitidas.
 *
 * Um plano com erro estrutural nunca altera o documento.
 */
export class ConstraintValidator {
  constructor(
    private concepts: Record<ConceptId, ConceptNode>,
    private document: DocumentModel
  ) {}

  validate(plan: ExecutionPlan): ExecutionPlan {
    const diagnostics: Diagnostic[] = [...plan.diagnostics];

    const tempEntityTypes = new Map<TempNodeId, ConceptId>();
    const tempParent = new Map<TempNodeId, ExecutableReference>();

    for (const step of plan.steps) {
      if (step.kind === 'CREATE_NODE') {
        tempEntityTypes.set(step.tempId, step.entityConceptId);
      }
    }

    // Pais efetivos definidos pelo próprio plano (para detectar ciclos entre
    // nós criados na mesma transação).
    for (const step of plan.steps) {
      if (step.kind === 'PLACE_NODE') {
        const relation = this.concepts[step.relationConceptId];
        if (relation?.kind === 'SPATIAL' && relation.relation === 'CHILD_OF') {
          if (step.source.kind === 'TEMP') tempParent.set(step.source.tempId, step.target);
        }
      }
    }

    for (const step of plan.steps) {
      switch (step.kind) {
        case 'SET_PROPERTY': {
          this.validateSetProperty(step, tempEntityTypes, diagnostics);
          break;
        }
        case 'CLEAR_PROPERTY': {
          this.validateSetProperty(step, tempEntityTypes, diagnostics);
          break;
        }
        case 'PLACE_NODE': {
          this.validatePlacement(
            {
              sourceRef: step.source,
              targetRef: step.target,
              relationConceptId: step.relationConceptId,
              span: step.span
            },
            tempEntityTypes,
            tempParent,
            diagnostics
          );
          break;
        }
        case 'MOVE_NODE': {
          if (!this.exists(step.sourceNodeId, tempEntityTypes)) {
            diagnostics.push(
              diagnostic('validator', 'ERROR', 'TARGET_NOT_FOUND',
                `O nó de origem ${step.sourceNodeId} não existe no documento.`, step.span)
            );
            break;
          }
          this.validatePlacement(
            {
              sourceRef: this.asReference(step.sourceNodeId),
              targetRef: step.target,
              relationConceptId: step.relationConceptId,
              span: step.span
            },
            tempEntityTypes,
            tempParent,
            diagnostics
          );
          break;
        }
        case 'DELETE_NODE': {
          if (!this.exists(step.targetNodeId, tempEntityTypes)) {
            diagnostics.push(
              diagnostic('validator', 'ERROR', 'TARGET_NOT_FOUND',
                `O nó ${step.targetNodeId} não existe no documento.`, step.span)
            );
          }
          break;
        }
      }
    }

    return { ...plan, diagnostics };
  }

  private validateSetProperty(
    step: { target: ExecutableReference; propertyConceptId: ConceptId },
    tempEntityTypes: Map<TempNodeId, ConceptId>,
    diagnostics: Diagnostic[]
  ): void {
    const property = this.concepts[step.propertyConceptId];
    if (property?.kind !== 'PROPERTY') {
      diagnostics.push(
        diagnostic('validator', 'ERROR', 'INVALID_PROPERTY',
          `Propriedade desconhecida: ${step.propertyConceptId}.`)
      );
      return;
    }

    const entityId = this.resolveEntityType(step.target, tempEntityTypes);
    if (!entityId) {
      // O alvo pode ser um nó real; se não existir, é TARGET_NOT_FOUND.
      if (step.target.kind === 'NODE' && !this.document.nodes.has(step.target.nodeId)) {
        diagnostics.push(
          diagnostic('validator', 'ERROR', 'TARGET_NOT_FOUND',
            `O nó ${step.target.nodeId} não existe no documento.`)
        );
      }
      return;
    }

    const entity = this.concepts[entityId];
    if (entity?.kind !== 'ENTITY') return;

    if (!entity.capabilities.acceptedPropertyIds.includes(step.propertyConceptId)) {
      diagnostics.push(
        diagnostic('validator', 'ERROR', 'INVALID_PROPERTY',
          `${entity.id} não aceita ${step.propertyConceptId}.`, undefined, {
            candidates: entity.capabilities.acceptedPropertyIds
          })
      );
    }
  }

  private validatePlacement(
    args: {
      sourceRef: ExecutableReference;
      targetRef: ExecutableReference;
      relationConceptId: ConceptId;
      span?: { start: number; end: number };
    },
    tempEntityTypes: Map<TempNodeId, ConceptId>,
    tempParent: Map<TempNodeId, ExecutableReference>,
    diagnostics: Diagnostic[]
  ): void {
    const relation = this.concepts[args.relationConceptId];
    if (relation?.kind !== 'SPATIAL') {
      diagnostics.push(
        diagnostic('validator', 'ERROR', 'INVALID_CONTAINMENT',
          `Relação espacial desconhecida: ${args.relationConceptId}.`, args.span, {
            subcode: 'UNKNOWN_RELATION'
          })
      );
      return;
    }

    const sourceNodeId = this.asNodeId(args.sourceRef);
    const targetNodeId = this.asNodeId(args.targetRef);

    // Auto-relação
    if (
      (args.sourceRef.kind === 'NODE' &&
        args.targetRef.kind === 'NODE' &&
        args.sourceRef.nodeId === args.targetRef.nodeId) ||
      (args.sourceRef.kind === 'TEMP' &&
        args.targetRef.kind === 'TEMP' &&
        args.sourceRef.tempId === args.targetRef.tempId)
    ) {
      diagnostics.push(
        diagnostic('validator', 'ERROR', 'INVALID_CONTAINMENT',
          'Um elemento não pode ser posicionado em relação a si mesmo.', args.span, {
            subcode: 'SELF_RELATION'
          })
      );
      return;
    }

    if (relation.relation === 'CHILD_OF') {
      // Ciclo entre nós reais
      if (sourceNodeId && targetNodeId &&
          (sourceNodeId === targetNodeId || isAncestor(this.document, sourceNodeId, targetNodeId))) {
        diagnostics.push(
          diagnostic('validator', 'ERROR', 'INVALID_CONTAINMENT',
            `Mover ${sourceNodeId} para dentro de ${targetNodeId} criaria um ciclo.`,
            args.span, { subcode: 'CYCLE' })
        );
        return;
      }

      // Ciclo entre nós temporários do mesmo plano
      if (args.sourceRef.kind === 'TEMP') {
        let cursor: ExecutableReference | undefined = args.targetRef;
        const seen = new Set<TempNodeId>();
        while (cursor && cursor.kind === 'TEMP' && !seen.has(cursor.tempId)) {
          seen.add(cursor.tempId);
          if (cursor.tempId === args.sourceRef.tempId) {
            diagnostics.push(
              diagnostic('validator', 'ERROR', 'INVALID_CONTAINMENT',
                'O posicionamento solicitado criaria um ciclo entre os elementos criados.',
                args.span, { subcode: 'CYCLE' })
            );
            return;
          }
          cursor = tempParent.get(cursor.tempId);
        }
      }

      const childType = this.resolveEntityType(args.sourceRef, tempEntityTypes);
      const parentType = this.resolveEntityType(args.targetRef, tempEntityTypes);
      if (childType && parentType) {
        this.validateContainment(childType, parentType, args.span, diagnostics);
      }
      return;
    }

    // Relações de irmão: a origem vai para o pai EFETIVO do destino, e esse pai
    // precisa aceitar a origem.
    if (!targetNodeId) return;
    const targetNode = this.document.nodes.get(targetNodeId);
    if (!targetNode) return;

    const effectiveParentId = targetNode.parentId;
    const childType = this.resolveEntityType(args.sourceRef, tempEntityTypes);
    if (!childType) return;

    if (effectiveParentId === null) {
      // Raiz: qualquer entidade que aceite a raiz é válida.
      const child = this.concepts[childType];
      const allowed = child?.kind === 'ENTITY' ? child.capabilities.allowedParentConceptIds : undefined;
      if (allowed && !allowed.includes('C_ENT_ROOT')) {
        diagnostics.push(
          diagnostic('validator', 'ERROR', 'INVALID_CONTAINMENT',
            `${childType} não pode ficar na raiz do documento.`, args.span, {
              subcode: 'INVALID_PARENT_TYPE'
            })
        );
      }
      return;
    }

    const parentNode = this.document.nodes.get(effectiveParentId);
    if (!parentNode) return;
    this.validateContainment(childType, parentNode.entityConceptId, args.span, diagnostics);
  }

  /**
   * O nó existe no documento ou é criado por um comando anterior da mesma
   * frase (id `tmp:<tempId>`).
   */
  private exists(nodeId: DocumentNodeId, tempEntityTypes: Map<TempNodeId, ConceptId>): boolean {
    return isTempNodeId(nodeId) ? tempEntityTypes.has(tempIdOf(nodeId)) : this.document.nodes.has(nodeId);
  }

  /** Id bruto do plano como referência (temporária, se for `tmp:`). */
  private asReference(nodeId: DocumentNodeId): ExecutableReference {
    return isTempNodeId(nodeId) ? { kind: 'TEMP', tempId: tempIdOf(nodeId) } : { kind: 'NODE', nodeId };
  }

  /** Id real do nó, quando a referência já aponta para o documento. */
  private asNodeId(reference: ExecutableReference): DocumentNodeId | null {
    return reference.kind === 'NODE' ? reference.nodeId : null;
  }

  private resolveEntityType(
    reference: ExecutableReference,
    tempEntityTypes: Map<TempNodeId, ConceptId>
  ): ConceptId | null {
    if (reference.kind === 'TEMP') {
      return tempEntityTypes.get(reference.tempId) ?? null;
    }
    return this.document.nodes.get(reference.nodeId)?.entityConceptId ?? null;
  }

  private validateContainment(
    childConceptId: ConceptId,
    parentConceptId: ConceptId,
    span: { start: number; end: number } | undefined,
    diagnostics: Diagnostic[]
  ): void {
    const child = this.concepts[childConceptId];
    const parent = this.concepts[parentConceptId];

    if (child?.kind !== 'ENTITY' || parent?.kind !== 'ENTITY') return;

    if (!parent.capabilities.canContainChildren) {
      diagnostics.push(
        diagnostic('validator', 'ERROR', 'INVALID_CONTAINMENT',
          `${parent.id} não pode conter filhos.`, span, { subcode: 'PARENT_CANNOT_CONTAIN' })
      );
      return;
    }

    const allowedChildren = parent.capabilities.allowedChildConceptIds;
    if (allowedChildren && !allowedChildren.includes(childConceptId)) {
      diagnostics.push(
        diagnostic('validator', 'ERROR', 'INVALID_CONTAINMENT',
          `${child.id} não pode ser inserido em ${parent.id}.`, span, {
            subcode: 'INVALID_CHILD_TYPE',
            candidates: allowedChildren
          })
      );
    }

    const allowedParents = child.capabilities.allowedParentConceptIds;
    if (allowedParents && !allowedParents.includes(parentConceptId)) {
      diagnostics.push(
        diagnostic('validator', 'ERROR', 'INVALID_CONTAINMENT',
          `${parent.id} não é um pai permitido de ${child.id}.`, span, {
            subcode: 'INVALID_PARENT_TYPE',
            candidates: allowedParents
          })
      );
    }
  }
}

export { preorderNodeIds };
