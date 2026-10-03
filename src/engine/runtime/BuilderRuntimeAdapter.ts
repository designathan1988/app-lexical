import type { ConceptId, DocumentNodeId } from '../types';
import type { SpatialRelation } from '../ontology/Concept';
import type { MutationResult } from '../../builder/BuilderStore';

/**
 * O compilador NÃO manipula o DOM diretamente: opera contra a API real do
 * builder através desta interface.
 */
export interface BuilderRuntimeAdapter {
  createNode(args: { entityConceptId: ConceptId; text?: string }): DocumentNodeId;

  setProperty(args: {
    nodeId: DocumentNodeId;
    propertyConceptId: ConceptId;
    runtimeProperty: string;
    value: string | number | boolean;
    targetField?: 'text';
  }): MutationResult;

  clearProperty(args: {
    nodeId: DocumentNodeId;
    propertyConceptId: ConceptId;
    runtimeProperty: string;
    clearValue: string | number | boolean | null;
    targetField?: 'text';
  }): MutationResult;

  place(args: {
    sourceNodeId: DocumentNodeId;
    relation: SpatialRelation;
    targetNodeId: DocumentNodeId;
  }): MutationResult;

  deleteNode(nodeId: DocumentNodeId): MutationResult;

  inspectNode(nodeId: DocumentNodeId): unknown;

  /** Define a seleção resultante de um QUERY. */
  selectNodes?(ids: DocumentNodeId[]): void;

  beginTransaction?(label?: string): void;
  commitTransaction?(): void;
  rollbackTransaction?(): void;
}
