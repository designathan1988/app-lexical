import type { ConceptId, DocumentNodeId } from '../engine/types';
import type { SpatialRelation } from '../engine/ontology/Concept';
import type { BuilderRuntimeAdapter } from '../engine/runtime/BuilderRuntimeAdapter';
import type { MutationResult, BuilderStore } from './BuilderStore';

/**
 * Adaptador que liga o motor semântico ao runtime real do pagebuilder.
 *
 * Durante uma transação, registra os nós EFETIVAMENTE afetados. Ao commitar,
 * se `selectAfterCommand` estiver ativo, a seleção passa a ser esse conjunto —
 * dentro da mesma transação, para que o undo restaure também a seleção.
 */
export class BuilderRuntimeAdapterImpl implements BuilderRuntimeAdapter {
  private touched = new Set<DocumentNodeId>();
  private explicitSelection: DocumentNodeId[] | null = null;
  selectAfterCommand = true;

  constructor(private store: BuilderStore) {}

  beginTransaction(label?: string): void {
    this.touched = new Set();
    this.explicitSelection = null;
    this.store.beginTransaction(label);
  }

  commitTransaction(): void {
    if (this.explicitSelection) {
      this.store.setSelection(this.explicitSelection);
    } else if (this.selectAfterCommand && this.touched.size) {
      this.store.setSelection(Array.from(this.touched));
    }
    this.store.commitTransaction();
    this.touched = new Set();
    this.explicitSelection = null;
  }

  rollbackTransaction(): void {
    this.store.rollbackTransaction();
    this.touched = new Set();
    this.explicitSelection = null;
  }

  private note(nodeId: DocumentNodeId): void {
    this.touched.add(nodeId);
  }

  createNode(args: { entityConceptId: ConceptId; text?: string }): DocumentNodeId {
    const id = this.store.createNode(args.entityConceptId, args.text);
    this.note(id);
    return id;
  }

  setProperty(args: {
    nodeId: DocumentNodeId;
    propertyConceptId: ConceptId;
    runtimeProperty: string;
    value: string | number | boolean;
    targetField?: 'text';
  }): MutationResult {
    const result = this.store.setProperty(
      args.nodeId,
      args.propertyConceptId,
      args.value,
      args.targetField
    );
    if (result.ok) this.note(args.nodeId);
    return result;
  }

  clearProperty(args: {
    nodeId: DocumentNodeId;
    propertyConceptId: ConceptId;
    runtimeProperty: string;
    clearValue: string | number | boolean | null;
    targetField?: 'text';
  }): MutationResult {
    const result = this.store.clearProperty(
      args.nodeId,
      args.propertyConceptId,
      args.clearValue,
      args.targetField
    );
    if (result.ok) this.note(args.nodeId);
    return result;
  }

  place(args: {
    sourceNodeId: DocumentNodeId;
    relation: SpatialRelation;
    targetNodeId: DocumentNodeId;
  }): MutationResult {
    const result = this.store.place(args.sourceNodeId, args.relation, args.targetNodeId);
    if (result.ok) {
      this.note(args.sourceNodeId);
      this.note(args.targetNodeId);
    }
    return result;
  }

  deleteNode(nodeId: DocumentNodeId): MutationResult {
    const result = this.store.deleteNode(nodeId);
    if (result.ok) this.note(nodeId);
    return result;
  }

  inspectNode(nodeId: DocumentNodeId): unknown {
    return this.store.inspectNode(nodeId);
  }

  /** Define explicitamente a seleção resultante (usada por QUERY). */
  selectNodes(ids: DocumentNodeId[]): void {
    this.explicitSelection = ids;
    for (const id of ids) this.note(id);
  }

  /** Nós afetados na transação corrente. */
  touchedNodes(): DocumentNodeId[] {
    return Array.from(this.touched);
  }
}
