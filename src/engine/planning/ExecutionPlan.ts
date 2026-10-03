import type { ConceptId, DocumentNodeId, TempNodeId } from '../types';
import type { Diagnostic, Span } from '../diagnostics';

export type ExecutableReference =
  | { kind: 'TEMP'; tempId: TempNodeId }
  | { kind: 'NODE'; nodeId: DocumentNodeId };

export interface CreateStep {
  kind: 'CREATE_NODE';
  stepId: string;
  tempId: TempNodeId;
  /**
   * tempId original da AST, antes da expansão de quantidade. Permite que o
   * discurso promova a menção (`tmp_1`) para o primeiro nó do grupo.
   */
  sourceTempId: TempNodeId;
  entityConceptId: ConceptId;
  text?: string;
  span?: Span;
}

export interface SetPropertyStep {
  kind: 'SET_PROPERTY';
  stepId: string;
  target: ExecutableReference;
  propertyConceptId: ConceptId;
  value: string | number | boolean;
  span?: Span;
}

export interface ClearPropertyStep {
  kind: 'CLEAR_PROPERTY';
  stepId: string;
  target: ExecutableReference;
  propertyConceptId: ConceptId;
  span?: Span;
}

export interface PlaceStep {
  kind: 'PLACE_NODE';
  stepId: string;
  source: ExecutableReference;
  relationConceptId: ConceptId;
  target: ExecutableReference;
  span?: Span;
}

export interface DeleteStep {
  kind: 'DELETE_NODE';
  stepId: string;
  targetNodeId: DocumentNodeId;
  span?: Span;
}

export interface MoveStep {
  kind: 'MOVE_NODE';
  stepId: string;
  sourceNodeId: DocumentNodeId;
  relationConceptId: ConceptId;
  target: ExecutableReference;
  span?: Span;
}

export interface QueryStep {
  kind: 'QUERY_NODE';
  stepId: string;
  targetNodeId: DocumentNodeId;
  span?: Span;
}

export type ExecutionStep =
  | CreateStep
  | SetPropertyStep
  | ClearPropertyStep
  | PlaceStep
  | DeleteStep
  | MoveStep
  | QueryStep;

export interface ExecutionPlan {
  steps: ExecutionStep[];
  diagnostics: Diagnostic[];
}
