import React, { useEffect, useRef } from 'react';
import type { ConceptId } from '../../engine/types';
import type { ConceptNode } from '../../engine/ontology/Concept';
import type { DocumentModel } from '../../engine/document/DocumentModel';
import { nodeStyle } from '../../builder/PropertyMapping';

interface Props {
  document: DocumentModel;
  concepts: Record<ConceptId, ConceptNode>;
  selectionIds: string[];
  onSelect?: (nodeId: string) => void;
  /**
   * Reporta o layout medido. É METADADO fora do histórico: preencher `rect`
   * não cria entrada de undo e permite resolver "o botão da direita".
   */
  onMeasure?: (rects: Record<string, { x: number; y: number; width: number; height: number }>) => void;
}

/**
 * Renderiza o documento REAL do builder. Não é uma árvore paralela: lê
 * `document.nodes` / `rootIds` do BuilderStore.
 */
export function DocumentRenderer({
  document,
  concepts,
  selectionIds,
  onSelect,
  onMeasure
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Mede o layout depois de cada render. Só o renderizador sabe a geometria
  // real; o modelo vivo guarda o resultado como metadado.
  useEffect(() => {
    if (!onMeasure || !rootRef.current) return;
    const rects: Record<string, { x: number; y: number; width: number; height: number }> = {};
    const elements = rootRef.current.querySelectorAll('[data-node-id]');
    elements.forEach((el) => {
      const id = (el as HTMLElement).dataset.nodeId;
      if (!id) return;
      const r = el.getBoundingClientRect();
      rects[id] = { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    if (Object.keys(rects).length) onMeasure(rects);
  }, [document, onMeasure]);

  const renderNode = (nodeId: string): React.ReactNode => {
    const node = document.nodes.get(nodeId);
    if (!node) return null;

    const concept = concepts[node.entityConceptId];
    if (concept?.kind !== 'ENTITY') return null;

    const Tag = (concept.rendering.domTag ?? 'div') as keyof JSX.IntrinsicElements;
    const style: React.CSSProperties = nodeStyle(node.properties, concept) as React.CSSProperties;

    const selected = selectionIds.includes(node.id);
    if (selected) {
      style.outline = '2px solid #6366f1';
      style.outlineOffset = '2px';
    }

    const attrs: Record<string, unknown> = { ...concept.rendering.defaultAttributes };
    delete attrs['data-builder-type'];
    if (Tag === 'button') attrs['type'] = 'button';

    return (
      <Tag
        key={node.id}
        {...attrs}
        data-node-id={node.id}
        data-builder-type={concept.rendering.rendererId}
        style={style}
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          onSelect?.(node.id);
        }}
      >
        {node.text ? node.text : null}
        {node.childIds.map((childId) => renderNode(childId))}
      </Tag>
    );
  };

  if (document.rootIds.length === 0) {
    return (
      <div className="preview-empty">
        Documento vazio — envie um comando como <code>crie uma caixa azul com um botão</code>.
      </div>
    );
  }

  return (
    <div className="preview-root" ref={rootRef}>
      {document.rootIds.map((id) => renderNode(id))}
    </div>
  );
}
