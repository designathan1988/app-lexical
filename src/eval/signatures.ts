import type { ConceptId } from '../engine/types';
import type { ConceptNode } from '../engine/ontology/Concept';
import type { DocumentModel, DocumentNode } from '../engine/document/DocumentModel';
import type { ExecutionPlan, ExecutableReference } from '../engine/planning/ExecutionPlan';
import type { SemanticDocumentAst, SemanticReference } from '../engine/ast/ast';

function refSig(ref: ExecutableReference): string {
  return ref.kind === 'TEMP' ? `temp:${ref.tempId}` : `node:${ref.nodeId}`;
}

/** Assinatura canônica (determinística) do plano de execução. */
export function planSignature(plan: ExecutionPlan): string {
  return plan.steps
    .map((step) => {
      switch (step.kind) {
        case 'CREATE_NODE':
          return `CREATE_NODE ${step.tempId} ${step.entityConceptId}${step.text ? ` "${step.text}"` : ''}`;
        case 'SET_PROPERTY':
          return `SET_PROPERTY ${refSig(step.target)} ${step.propertyConceptId} ${step.value}`;
        case 'CLEAR_PROPERTY':
          return `CLEAR_PROPERTY ${refSig(step.target)} ${step.propertyConceptId}`;
        case 'PLACE_NODE':
          return `PLACE_NODE ${refSig(step.source)} ${step.relationConceptId} ${refSig(step.target)}`;
        case 'DELETE_NODE':
          return `DELETE_NODE ${step.targetNodeId}`;
        case 'MOVE_NODE':
          return `MOVE_NODE ${step.sourceNodeId} ${step.relationConceptId} ${refSig(step.target)}`;
        case 'QUERY_NODE':
          return `QUERY_NODE ${step.targetNodeId}`;
      }
    })
    .join('\n');
}

function astRefSig(ref: SemanticReference): string {
  switch (ref.kind) {
    case 'NEW_ENTITY':
      return `new:${ref.tempId}`;
    case 'NODE_ID':
      return `node:${ref.nodeId}`;
    case 'CURRENT_SELECTION':
      return 'selection';
    case 'SELECTOR':
      return `sel:${selectorSig(ref.selector)}`;
  }
}

function selectorSig(sel: {
  entityConceptId?: ConceptId;
  ordinalIndex?: number;
  quantity?: { mode: 'ONE' } | { mode: 'ALL' } | { mode: 'COUNT'; count: number };
  textEquals?: string;
  parent?: unknown;
  exclusions?: unknown[];
}): string {
  const parts: string[] = [];
  if (sel.entityConceptId) parts.push(sel.entityConceptId);
  if (sel.ordinalIndex !== undefined) parts.push(`ord=${sel.ordinalIndex}`);
  if (sel.quantity?.mode === 'ALL') parts.push('all');
  else if (sel.quantity?.mode === 'COUNT') parts.push(`count=${sel.quantity.count}`);
  if (sel.textEquals !== undefined) parts.push(`text="${sel.textEquals}"`);
  if (sel.parent) parts.push(`parent[${selectorSig(sel.parent as never)}]`);
  if (sel.exclusions?.length)
    parts.push(`minus[${(sel.exclusions as never[]).map((e) => selectorSig(e)).join(',')}]`);
  return parts.join(';') || 'any';
}

/** Assinatura canônica da Semantic AST. */
export function astSignature(ast: SemanticDocumentAst): string {
  return ast.commands
    .map((cmd) => {
      switch (cmd.kind) {
        case 'NO_OP':
          return 'NO_OP';
        case 'CREATE': {
          const ents = cmd.entities
            .map((e) => {
              const muts = e.mutations
                .map((m) =>
                  m.kind === 'SET'
                    ? `set(${m.propertyConceptId ?? m.propertyGroupId ?? '?'},${m.value.category}:${m.value.literal})`
                    : `clear(${m.propertyConceptId ?? m.propertyGroupId ?? '?'})`
                )
                .join(' ');
              return `CREATE ${e.tempId} ${e.entityConceptId}${e.quantity > 1 ? ` x${e.quantity}` : ''}${e.text ? ` "${e.text}"` : ''}${muts ? ` ${muts}` : ''}`;
            })
            .join(' | ');
          const places = cmd.placements
            .map((p) => `PLACE ${astRefSig(p.source)} ${p.relationConceptId} ${astRefSig(p.target)}`)
            .join(' | ');
          return `CREATE [${ents}]${places ? ` ${places}` : ''}`;
        }
        case 'UPDATE': {
          const muts = cmd.mutations
            .map((m) =>
              m.kind === 'SET'
                ? `set(${m.propertyConceptId ?? m.propertyGroupId ?? '?'},${m.value.category}:${m.value.literal})`
                : `clear(${m.propertyConceptId ?? m.propertyGroupId ?? '?'})`
            )
            .join(' ');
          return `UPDATE ${astRefSig(cmd.target)} ${muts}`;
        }
        case 'DELETE':
          return `DELETE ${astRefSig(cmd.target)}`;
        case 'MOVE':
          return `MOVE ${astRefSig(cmd.target)} ${cmd.placement.relationConceptId} ${astRefSig(cmd.placement.target)}`;
        case 'QUERY':
          return `QUERY ${astRefSig(cmd.target)}`;
      }
    })
    .join('\n');
}

/** Assinatura canônica da árvore do documento (para comparação exata). */
export function treeSignature(
  document: DocumentModel,
  concepts: Record<ConceptId, ConceptNode>
): string {
  const lines: string[] = [];

  const walk = (nodeId: string, depth: number): void => {
    const node = document.nodes.get(nodeId);
    if (!node) return;
    const indent = '  '.repeat(depth);
    const props = Object.entries(node.properties)
      .map(([id, value]) => `${id}=${value}`)
      .sort()
      .join(',');
    const head = `${node.entityConceptId}${node.text ? `"${node.text}"` : ''}{${props}}`;
    lines.push(`${indent}${head}`);
    for (const childId of node.childIds) walk(childId, depth + 1);
  };

  for (const rootId of document.rootIds) walk(rootId, 0);
  return lines.join('\n');
}

/** Lista plana de nós (conceptId, parentConceptId|null, texto, propriedades) para asserções. */
export function flatTree(document: DocumentModel): Array<{
  id: string;
  entityConceptId: ConceptId;
  parentId: string | null;
  text?: string;
  properties: Record<string, string | number | boolean>;
}> {
  return Array.from(document.nodes.values())
    .map((n) => ({
      id: n.id,
      entityConceptId: n.entityConceptId,
      parentId: n.parentId,
      text: n.text,
      properties: { ...n.properties }
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
