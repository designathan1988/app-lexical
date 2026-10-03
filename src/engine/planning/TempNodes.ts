import type { DocumentNodeId, TempNodeId } from '../types';
import type { DocumentModel } from '../document/DocumentModel';
import type { ExecutionStep } from './ExecutionPlan';

/**
 * Nós criados por um comando anterior da MESMA frase ainda não têm id real no
 * momento do planejamento. Em passos que recebem id bruto (DELETE_NODE,
 * MOVE_NODE, QUERY_NODE) eles aparecem como `tmp:<tempId>`; o executor traduz
 * para o id real com o mapa de temporários da transação.
 */
export const TEMP_NODE_PREFIX = 'tmp:';

export const tempNodeId = (tempId: TempNodeId): DocumentNodeId => `${TEMP_NODE_PREFIX}${tempId}`;

export const isTempNodeId = (id: DocumentNodeId): boolean => id.startsWith(TEMP_NODE_PREFIX);

export const tempIdOf = (id: DocumentNodeId): TempNodeId => id.slice(TEMP_NODE_PREFIX.length);

/**
 * Simulador de efeitos do plano (injetado pelo runtime): aplica `steps` sobre
 * uma CÓPIA do documento, com a mesma semântica do builder real, e devolve o
 * documento resultante e o mapa temporário → id simulado. Permite que o
 * comando seguinte da frase resolva referências contra o estado pós-comando.
 */
export type PlanSimulator = (
  document: DocumentModel,
  steps: ExecutionStep[],
  tempMap: Map<TempNodeId, DocumentNodeId>
) => { document: DocumentModel; tempMap: Map<TempNodeId, DocumentNodeId>; ok: boolean };
