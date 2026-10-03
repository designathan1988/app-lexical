import type { ConceptId, DocumentNodeId } from '../engine/types';
import type { SpatialRelation } from '../engine/ontology/Concept';
import type { DocumentModel, DocumentNode } from '../engine/document/DocumentModel';
import { isAncestor } from '../engine/document/traversal';

export interface MutationOk {
  ok: true;
}

export interface MutationFailure {
  ok: false;
  code: string;
  subcode?: string;
  message: string;
}

export type MutationResult = MutationOk | MutationFailure;

export interface HistoryEntry {
  before: DocumentModel;
  after: DocumentModel;
  label?: string;
}

const ok: MutationOk = { ok: true };

function fail(code: string, message: string, subcode?: string): MutationFailure {
  return { ok: false, code, subcode, message };
}

/**
 * Modelo vivo do documento do pagebuilder — fonte única de verdade.
 *
 * As primitivas devolvem resultado tipado: uma operação sem efeito NUNCA é
 * silenciosa. Undo/redo é transacional: uma instrução do usuário é uma unidade.
 */
export class BuilderStore {
  document: DocumentModel = { nodes: new Map(), rootIds: [], selectionIds: [] };

  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private counter = 0;
  private listeners = new Set<() => void>();
  private inTransaction = false;
  private pendingBefore: DocumentModel | null = null;
  private pendingLabel: string | undefined;

  // ---- Subscrição (renderização) ------------------------------------------

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    if (this.inTransaction) return;
    this.listeners.forEach((fn) => fn());
  }

  // ---- Histórico ----------------------------------------------------------

  private snapshot(): DocumentModel {
    return structuredClone(this.document);
  }

  beginTransaction(label?: string): void {
    if (this.inTransaction) return;
    this.pendingBefore = this.snapshot();
    this.pendingLabel = label;
    this.inTransaction = true;
  }

  commitTransaction(): void {
    if (!this.inTransaction) return;
    const after = this.snapshot();
    this.undoStack.push({ before: this.pendingBefore!, after, label: this.pendingLabel });
    this.redoStack = [];
    this.pendingBefore = null;
    this.pendingLabel = undefined;
    this.inTransaction = false;
    this.emit();
  }

  rollbackTransaction(): void {
    if (this.pendingBefore) this.document = this.pendingBefore;
    this.pendingBefore = null;
    this.pendingLabel = undefined;
    this.inTransaction = false;
    this.emit();
  }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.document = structuredClone(entry.before);
    this.redoStack.push(entry);
    this.emit();
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.pop();
    if (!entry) return false;
    this.document = structuredClone(entry.after);
    this.undoStack.push(entry);
    this.emit();
    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  history(): { label?: string }[] {
    return this.undoStack.map((e) => ({ label: e.label }));
  }

  /**
   * Carrega uma CÓPIA de um documento para simulação (planejamento de várias
   * orações): os ids novos continuam a numeração existente, sem colidir.
   */
  loadScratch(document: DocumentModel): void {
    this.document = structuredClone(document);
    this.undoStack = [];
    this.redoStack = [];
    const numbers = [...this.document.nodes.keys()]
      .map((id) => Number(/^node_(\d+)$/.exec(id)?.[1] ?? 0));
    this.counter = Math.max(this.counter, 0, ...numbers);
  }

  // ---- Operações primitivas -------------------------------------------------

  createNode(entityConceptId: ConceptId, text?: string): DocumentNodeId {
    const id: DocumentNodeId = `node_${++this.counter}`;
    const node: DocumentNode = {
      id,
      entityConceptId,
      parentId: null,
      childIds: [],
      text,
      properties: {}
    };
    this.document.nodes.set(id, node);
    this.document.rootIds.push(id);
    this.emit();
    return id;
  }

  setProperty(
    nodeId: DocumentNodeId,
    propertyConceptId: ConceptId,
    value: string | number | boolean,
    targetField?: 'text'
  ): MutationResult {
    const node = this.document.nodes.get(nodeId);
    if (!node) {
      return fail('TARGET_NOT_FOUND', `Nó ${nodeId} não existe no documento.`);
    }

    if (targetField === 'text') {
      node.text = String(value);
    } else {
      node.properties[propertyConceptId] = value;
    }

    this.emit();
    return ok;
  }

  clearProperty(
    nodeId: DocumentNodeId,
    propertyConceptId: ConceptId,
    clearValue: string | number | boolean | null,
    targetField?: 'text'
  ): MutationResult {
    const node = this.document.nodes.get(nodeId);
    if (!node) {
      return fail('TARGET_NOT_FOUND', `Nó ${nodeId} não existe no documento.`);
    }

    if (targetField === 'text') {
      if (clearValue === null) delete node.text;
      else node.text = String(clearValue);
    } else if (clearValue === null) {
      delete node.properties[propertyConceptId];
    } else {
      node.properties[propertyConceptId] = clearValue;
    }

    this.emit();
    return ok;
  }

  place(
    sourceNodeId: DocumentNodeId,
    relation: SpatialRelation,
    targetNodeId: DocumentNodeId
  ): MutationResult {
    const source = this.document.nodes.get(sourceNodeId);
    const target = this.document.nodes.get(targetNodeId);
    if (!source) {
      return fail('TARGET_NOT_FOUND', `Nó de origem ${sourceNodeId} não existe.`);
    }
    if (!target) {
      return fail('TARGET_NOT_FOUND', `Nó de destino ${targetNodeId} não existe.`);
    }
    if (sourceNodeId === targetNodeId) {
      return fail(
        'INVALID_CONTAINMENT',
        'Um elemento não pode ser posicionado em relação a si mesmo.',
        'SELF_RELATION'
      );
    }
    if (relation === 'CHILD_OF' && isAncestor(this.document, sourceNodeId, targetNodeId)) {
      return fail(
        'INVALID_CONTAINMENT',
        `Mover ${sourceNodeId} para dentro de ${targetNodeId} criaria um ciclo.`,
        'CYCLE'
      );
    }

    // Efeito já existente: não reportar como sucesso silencioso.
    const alreadyChild = relation === 'CHILD_OF' && source.parentId === targetNodeId;
    if (!alreadyChild) {
      this.removeFromCurrent(source);

      if (relation === 'CHILD_OF') {
        source.parentId = target.id;
        target.childIds.push(source.id);
      } else {
        source.parentId = target.parentId;
        this.insertRelative(source, target, relation);
      }
    }

    this.emit();
    return ok;
  }

  deleteNode(nodeId: DocumentNodeId): MutationResult {
    const node = this.document.nodes.get(nodeId);
    if (!node) {
      return fail('TARGET_NOT_FOUND', `Nó ${nodeId} não existe no documento.`);
    }

    const toDelete = this.collectSubtree(node);

    for (const id of toDelete) {
      const n = this.document.nodes.get(id);
      if (n?.parentId) {
        const parent = this.document.nodes.get(n.parentId);
        if (parent) parent.childIds = parent.childIds.filter((c) => c !== id);
      } else {
        this.document.rootIds = this.document.rootIds.filter((r) => r !== id);
      }
      this.document.nodes.delete(id);
    }

    this.document.selectionIds = this.document.selectionIds.filter(
      (s) => !toDelete.includes(s)
    );
    this.emit();
    return ok;
  }

  inspectNode(nodeId: DocumentNodeId): unknown {
    return this.document.nodes.get(nodeId) ?? null;
  }

  setSelection(ids: DocumentNodeId[]): void {
    const existing = ids.filter((id) => this.document.nodes.has(id));
    this.document.selectionIds = [...new Set(existing)];
    this.emit();
  }

  reset(): void {
    this.document = { nodes: new Map(), rootIds: [], selectionIds: [] };
    this.undoStack = [];
    this.redoStack = [];
    this.counter = 0;
    this.emit();
  }

  // ---- Metadados de layout (fora do histórico) -------------------------------

  /**
   * Atualiza `rect` dos nós com métricas medidas pelo renderizador.
   * É METADADO DE LAYOUT: não cria entrada no histórico de undo.
   */
  updateRects(rects: Record<DocumentNodeId, DocumentNode['rect']>): void {
    let changed = false;
    for (const [id, rect] of Object.entries(rects)) {
      const node = this.document.nodes.get(id);
      if (!node || !rect) continue;
      node.rect = rect;
      changed = true;
    }
    if (changed) this.emit();
  }

  // ---- Helpers de árvore ----------------------------------------------------

  private collectSubtree(node: DocumentNode): DocumentNodeId[] {
    const ids: DocumentNodeId[] = [node.id];
    for (const childId of node.childIds) {
      const child = this.document.nodes.get(childId);
      if (child) ids.push(...this.collectSubtree(child));
    }
    return ids;
  }

  private removeFromCurrent(node: DocumentNode): void {
    if (node.parentId) {
      const parent = this.document.nodes.get(node.parentId);
      if (parent) parent.childIds = parent.childIds.filter((c) => c !== node.id);
    } else {
      this.document.rootIds = this.document.rootIds.filter((r) => r !== node.id);
    }
  }

  private insertRelative(
    node: DocumentNode,
    target: DocumentNode,
    relation: SpatialRelation
  ): void {
    const siblings = target.parentId
      ? (this.document.nodes.get(target.parentId)?.childIds ?? [])
      : this.document.rootIds;

    const idx = siblings.indexOf(target.id);
    if (idx < 0) {
      siblings.push(node.id);
      return;
    }

    const before = relation === 'BEFORE' || relation === 'ABOVE';
    const insertAt = before ? idx : idx + 1;
    siblings.splice(insertAt, 0, node.id);
  }
}
