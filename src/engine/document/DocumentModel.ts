import type { ConceptId, DocumentNodeId } from '../types';

export interface DocumentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DocumentNode {
  id: DocumentNodeId;
  entityConceptId: ConceptId;
  parentId: DocumentNodeId | null;
  childIds: DocumentNodeId[];
  text?: string;
  properties: Record<ConceptId, string | number | boolean>;
  rect?: DocumentRect;
}

export interface DocumentModel {
  nodes: Map<DocumentNodeId, DocumentNode>;
  rootIds: DocumentNodeId[];
  selectionIds: DocumentNodeId[];
}
