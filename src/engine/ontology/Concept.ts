/**
 * Ontologia: união discriminada real de conceitos.
 *
 * Uma ação não possui `domTag`; uma cor não possui affordance de filhos;
 * uma relação espacial não possui propriedades de renderização.
 */
import type { ConceptId, ValueCategory } from '../types';

export type RuntimeOperation =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'MOVE'
  | 'QUERY';

export interface EntityConcept {
  kind: 'ENTITY';
  id: ConceptId;

  capabilities: {
    canContainChildren: boolean;
    allowedChildConceptIds?: ConceptId[];
    allowedParentConceptIds?: ConceptId[];
    acceptedPropertyIds: ConceptId[];
    defaultValueBindings: Partial<Record<ValueCategory, ConceptId>>;
  };

  rendering: {
    rendererId: string;
    domTag?: string;
    defaultAttributes: Record<string, string | number | boolean>;
    defaultStyles: Record<string, string | number>;
  };
}

export interface ActionConcept {
  kind: 'ACTION';
  id: ConceptId;
  operation: RuntimeOperation;
  /** A ação destrói ou desloca estado existente (não pode ser adivinhada). */
  destructive: boolean;
  allowedArgumentRoles: Array<
    'TARGET' | 'ENTITY' | 'PROPERTY' | 'VALUE' | 'DESTINATION'
  >;
}

export interface PropertyConcept {
  kind: 'PROPERTY';
  id: ConceptId;
  runtimeProperty: string;
  valueCategories: ValueCategory[];
  groupId?: ConceptId;
  clearValue?: string | number | boolean | null;
  /** Campo do nó do documento que esta propriedade alimenta. */
  targetField?: 'text';
}

export interface PropertyGroupConcept {
  kind: 'PROPERTY_GROUP';
  id: ConceptId;
  members: ConceptId[];
  bindingByValueCategory: Partial<Record<ValueCategory, ConceptId>>;
  clearPropertyIds: ConceptId[];
}

export interface ValueConcept {
  kind: 'VALUE';
  id: ConceptId;
  valueCategory: ValueCategory;
  literal: string | number | boolean;
  /**
   * Propriedade idiomaticamente associada a este valor quando nenhuma
   * propriedade é mencionada ("redondo" → border radius). Vem antes do
   * binding padrão da entidade e depois de uma propriedade explícita.
   */
  preferredPropertyId?: ConceptId;
}

export type SpatialRelation =
  | 'CHILD_OF'
  | 'BEFORE'
  | 'AFTER'
  | 'BESIDE'
  | 'ABOVE'
  | 'BELOW';

export interface SpatialConcept {
  kind: 'SPATIAL';
  id: ConceptId;
  relation: SpatialRelation;
  /**
   * B4 — Eixo espacial, quando o marcador nomeia uma EXTREMIDADE
   * ("da direita" → RIGHTMOST). Ausente em relações de posicionamento.
   */
  direction?: 'LEFTMOST' | 'RIGHTMOST' | 'TOPMOST' | 'BOTTOMMOST';
}

/**
 * Operadores gramaticais e lógicos. São DADOS: o parser consulta o operador,
 * nunca a palavra portuguesa.
 */
export type OperatorKind =
  | 'NEGATION'
  | 'WITHOUT'
  | 'EXCEPT'
  | 'COMITATIVE'
  | 'ALLATIVE'
  | 'PARTITIVE'
  | 'COORDINATION'
  | 'DEFINITE_ARTICLE'
  | 'INDEFINITE_ARTICLE'
  | 'UNIVERSAL_QUANTIFIER'
  | 'ALTERNATIVE_DETERMINER'
  /** Oração relativa de estado: "que está dentro da caixa". */
  | 'RELATIVE_STATE'
  /** Oração relativa possessiva: "que tem borda azul". */
  | 'RELATIVE_HAVE'
  /** Sujeito pronominal de pedido indireto ("eu", "você"). */
  | 'SUBJECT_PRONOUN'
  /** Pedido indireto neutro: "você pode criar…", "poderia…", "por favor". */
  | 'POLITE_REQUEST'
  /** Desejo que implica criação/ação: "quero um botão", "gostaria de apagar…". */
  | 'POLITE_DESIRE'
  /** Comparativo "mais/menos <adjetivo>": não suportado como mutação. */
  | 'COMPARATIVE';

export interface OperatorConcept {
  kind: 'OPERATOR';
  id: ConceptId;
  operator: OperatorKind;
}

export interface QueryConcept {
  kind: 'QUERY';
  id: ConceptId;
  query: 'INSPECT' | 'COUNT' | 'EXISTS' | 'SELECT';
}

export type ConceptNode =
  | EntityConcept
  | ActionConcept
  | PropertyConcept
  | PropertyGroupConcept
  | ValueConcept
  | SpatialConcept
  | OperatorConcept
  | QueryConcept;

export type ConceptKind = ConceptNode['kind'];
