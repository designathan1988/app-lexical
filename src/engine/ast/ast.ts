/**
 * Semantic AST: representação intermediária serializável, sem referências
 * circulares e sem objetos vivos do DOM. Representa significado, não DOM.
 *
 * Todo nó carrega `span` — o trecho da entrada que o originou — para que
 * qualquer diagnóstico de qualquer camada possa apontar a posição.
 */
import type { ConceptId, TempNodeId, ValueCategory } from '../types';
import type { Span } from '../diagnostics';

export interface NewEntityRef {
  kind: 'NEW_ENTITY';
  tempId: TempNodeId;
}

export interface NodeIdRef {
  kind: 'NODE_ID';
  nodeId: string;
}

export interface SelectorRef {
  kind: 'SELECTOR';
  selector: SemanticSelector;
}

export interface SelectionRef {
  kind: 'CURRENT_SELECTION';
}

export type SemanticReference = NewEntityRef | NodeIdRef | SelectorRef | SelectionRef;

export interface PropertyFilter {
  propertyConceptId: ConceptId;
  value: string | number | boolean;
}

export interface SemanticSelector {
  entityConceptId?: ConceptId;
  /** Índice ordinal 0-based; negativo conta a partir do fim. */
  ordinalIndex?: number;
  quantity?: { mode: 'ONE' } | { mode: 'ALL' } | { mode: 'COUNT'; count: number };
  textEquals?: string;
  propertyFilter?: PropertyFilter;
  parent?: SemanticSelector;
  direction?: 'LEFTMOST' | 'RIGHTMOST' | 'TOPMOST' | 'BOTTOMMOST';
  exclusions?: SemanticSelector[];
  /** Elipse: o tipo foi herdado de uma menção saliente do discurso. */
  elidedFrom?: ConceptId;
  /** "outro/outra": exige uma instância distinta desta referência. */
  distinctFrom?: SemanticSelector;
  span?: Span;
}

export interface AstValue {
  category: ValueCategory;
  literal: string | number | boolean;
  /** Conceito de valor que originou o literal, quando houver. */
  valueConceptId?: ConceptId;
  /** Texto original do literal entre aspas, quando houver. */
  text?: string;
}

export type AstPropertyMutation =
  | {
      kind: 'SET';
      propertyConceptId?: ConceptId;
      propertyGroupId?: ConceptId;
      value: AstValue;
      span?: Span;
    }
  | {
      kind: 'CLEAR';
      propertyConceptId?: ConceptId;
      propertyGroupId?: ConceptId;
      span?: Span;
    };

export interface NewEntityAst {
  tempId: TempNodeId;
  entityConceptId: ConceptId;
  quantity: number;
  text?: string;
  mutations: AstPropertyMutation[];
  span?: Span;
}

export interface PlacementAst {
  source: SemanticReference;
  relationConceptId: ConceptId;
  target: SemanticReference;
  span?: Span;
}

export interface CreateCommandAst {
  kind: 'CREATE';
  entities: NewEntityAst[];
  placements: PlacementAst[];
  span?: Span;
}

export interface UpdateCommandAst {
  kind: 'UPDATE';
  target: SemanticReference;
  mutations: AstPropertyMutation[];
  span?: Span;
}

export interface DeleteCommandAst {
  kind: 'DELETE';
  target: SemanticReference;
  span?: Span;
}

export interface MoveCommandAst {
  kind: 'MOVE';
  target: SemanticReference;
  placement: PlacementAst;
  span?: Span;
}

export interface QueryCommandAst {
  kind: 'QUERY';
  target: SemanticReference;
  span?: Span;
}

export interface NoOpCommandAst {
  kind: 'NO_OP';
  reason: 'NEGATED_ACTION';
  negatedOperation?: string;
  span?: Span;
}

export type SemanticCommand =
  | CreateCommandAst
  | UpdateCommandAst
  | DeleteCommandAst
  | MoveCommandAst
  | QueryCommandAst
  | NoOpCommandAst;

export interface SemanticDocumentAst {
  commands: SemanticCommand[];
}
