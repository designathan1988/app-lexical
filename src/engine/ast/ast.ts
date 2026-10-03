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

/**
 * Grupo de nós citados explicitamente por uma menção plural ("os", "elas"):
 * refere-se exatamente aos nós mencionados, não a "todos os que casam".
 */
export interface NodeSetRef {
  kind: 'NODE_SET';
  nodeIds: string[];
}

export interface SelectorRef {
  kind: 'SELECTOR';
  selector: SemanticSelector;
}

export interface SelectionRef {
  kind: 'CURRENT_SELECTION';
}

export type SemanticReference =
  | NewEntityRef
  | NodeIdRef
  | NodeSetRef
  | SelectorRef
  | SelectionRef;

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
  /** Span do marcador de direção ("mais à direita"), para diagnósticos. */
  directionSpan?: Span;
  exclusions?: SemanticSelector[];
  /** Elipse: o tipo foi herdado de uma menção saliente do discurso. */
  elidedFrom?: ConceptId;
  /** Restringe aos nós citados (ex.: o antecedente saliente de "a outra"). */
  nodeIds?: string[];
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
  /** Pedido indireto registrado ("você pode…", "quero…", "por favor"). */
  politeness?: boolean;
}

export interface UpdateCommandAst {
  kind: 'UPDATE';
  target: SemanticReference;
  mutations: AstPropertyMutation[];
  span?: Span;
  /** Pedido indireto registrado ("você pode…", "quero…", "por favor"). */
  politeness?: boolean;
}

export interface DeleteCommandAst {
  kind: 'DELETE';
  target: SemanticReference;
  span?: Span;
  /** Pedido indireto registrado ("você pode…", "quero…", "por favor"). */
  politeness?: boolean;
}

export interface MoveCommandAst {
  kind: 'MOVE';
  target: SemanticReference;
  placement: PlacementAst;
  span?: Span;
  /** Pedido indireto registrado ("você pode…", "quero…", "por favor"). */
  politeness?: boolean;
}

export interface QueryCommandAst {
  kind: 'QUERY';
  target: SemanticReference;
  span?: Span;
  /** Pedido indireto registrado ("você pode…", "quero…", "por favor"). */
  politeness?: boolean;
}

export interface NoOpCommandAst {
  kind: 'NO_OP';
  reason: 'NEGATED_ACTION' | 'UNKNOWN_COMMAND';
  negatedOperation?: string;
  /** Pedido indireto registrado ("você pode…", "quero…", "por favor"). */
  politeness?: boolean;
  span?: Span;
}

export type SemanticCommand = (
  | CreateCommandAst
  | UpdateCommandAst
  | DeleteCommandAst
  | MoveCommandAst
  | QueryCommandAst
  | NoOpCommandAst
) & {
  /**
   * Índice da oração de origem. Comandos expandidos de objetos coordenados
   * ("apague a primeira e a terceira caixa") compartilham a oração e são
   * resolvidos contra o MESMO estado; orações distintas veem o efeito das
   * anteriores.
   */
  clause?: number;
};

export interface SemanticDocumentAst {
  commands: SemanticCommand[];
}
