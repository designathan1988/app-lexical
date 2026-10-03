import type { DocumentNodeId } from '../types';
import type { DocumentModel, DocumentNode } from './DocumentModel';

/**
 * Ordem canônica do documento: travessia em pré-ordem a partir de `rootIds`
 * seguindo `childIds`.
 *
 * Esta é a única definição de "primeiro", "segundo", "último" no sistema.
 * É usada pelo resolvedor de referências, pelas assinaturas de árvore, pelo
 * renderizador e pelas métricas — nunca a ordem de inserção do Map.
 */
export function preorderNodeIds(document: DocumentModel): DocumentNodeId[] {
  const out: DocumentNodeId[] = [];
  const visited = new Set<DocumentNodeId>();

  const walk = (id: DocumentNodeId): void => {
    if (visited.has(id)) return;
    const node = document.nodes.get(id);
    if (!node) return;
    visited.add(id);
    out.push(id);
    for (const childId of node.childIds) walk(childId);
  };

  for (const rootId of document.rootIds) walk(rootId);

  // Nós órfãos (sem pai e fora de rootIds) entram ao final, em ordem estável,
  // para que a travessia nunca perca um nó existente.
  const orphans = Array.from(document.nodes.keys())
    .filter((id) => !visited.has(id))
    .sort();
  for (const id of orphans) walk(id);

  return out;
}

/** Nós do documento na ordem canônica. */
export function preorderNodes(document: DocumentModel): DocumentNode[] {
  return preorderNodeIds(document)
    .map((id) => document.nodes.get(id))
    .filter((n): n is DocumentNode => Boolean(n));
}

/** Profundidade de cada nó (raízes em 0). */
export function nodeDepths(document: DocumentModel): Map<DocumentNodeId, number> {
  const depths = new Map<DocumentNodeId, number>();
  const walk = (id: DocumentNodeId, depth: number): void => {
    const node = document.nodes.get(id);
    if (!node || depths.has(id)) return;
    depths.set(id, depth);
    for (const childId of node.childIds) walk(childId, depth + 1);
  };
  for (const rootId of document.rootIds) walk(rootId, 0);
  return depths;
}

/** Caminho de ancestrais (do pai imediato até a raiz). */
export function ancestorsOf(document: DocumentModel, id: DocumentNodeId): DocumentNodeId[] {
  const out: DocumentNodeId[] = [];
  let current = document.nodes.get(id);
  while (current && current.parentId !== null) {
    out.push(current.parentId);
    current = document.nodes.get(current.parentId);
  }
  return out;
}

/** Verdadeiro se `maybeAncestor` está acima de `nodeId` na árvore. */
export function isAncestor(
  document: DocumentModel,
  maybeAncestor: DocumentNodeId,
  nodeId: DocumentNodeId
): boolean {
  return ancestorsOf(document, nodeId).includes(maybeAncestor);
}
