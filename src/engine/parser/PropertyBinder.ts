import type { ConceptId, ValueCategory } from '../types';
import type { ConceptNode, PropertyConcept, PropertyGroupConcept } from '../ontology/Concept';
import type { AstPropertyMutation, AstValue } from '../ast/ast';
import type { Diagnostic, Span } from '../diagnostics';

export interface BindSuccess {
  ok: true;
  mutation: AstPropertyMutation;
}

export interface BindFailure {
  ok: false;
  diagnostic: Diagnostic;
}

export type BindResult = BindSuccess | BindFailure;

function describeCategories(categories: ValueCategory[]): string {
  return categories.join('/');
}

/**
 * Resolve a associação propriedade/valor na ordem:
 *   1. propriedade explicitamente mencionada;
 *   2. PropertyGroup compatível com a categoria do valor;
 *   3. binding padrão da entidade;
 *   4. constraints da ontologia (categoria do valor).
 *
 * Nunca lança: devolve resultado tipado com diagnóstico estruturado.
 */
export class PropertyBinder {
  constructor(private concepts: Record<ConceptId, ConceptNode>) {}

  bind(
    entityConceptId: ConceptId | undefined,
    mutation: AstPropertyMutation,
    span?: Span
  ): BindResult {
    if (mutation.kind === 'CLEAR') {
      if (mutation.propertyConceptId) {
        const property = this.concepts[mutation.propertyConceptId];
        if (property?.kind !== 'PROPERTY') {
          return {
            ok: false,
            diagnostic: {
              severity: 'ERROR',
              code: 'INVALID_PROPERTY',
              message: `Propriedade desconhecida: ${mutation.propertyConceptId}.`,
              layer: 'binder',
              span,
              start: span?.start,
              end: span?.end,
              candidates: Object.values(this.concepts)
                .filter((c): c is PropertyConcept => c.kind === 'PROPERTY')
                .map((c) => c.id)
            }
          };
        }
      }
      if (mutation.propertyGroupId) {
        const group = this.concepts[mutation.propertyGroupId];
        if (group?.kind !== 'PROPERTY_GROUP') {
          return {
            ok: false,
            diagnostic: {
              severity: 'ERROR',
              code: 'INVALID_PROPERTY',
              message: `Grupo de propriedades desconhecido: ${mutation.propertyGroupId}.`,
              layer: 'binder',
              span,
              start: span?.start,
              end: span?.end
            }
          };
        }
      }
      return { ok: true, mutation };
    }

    const category = mutation.value.category;

    if (mutation.propertyConceptId) {
      const property = this.concepts[mutation.propertyConceptId];
      if (property?.kind !== 'PROPERTY') {
        return {
          ok: false,
          diagnostic: {
            severity: 'ERROR',
            code: 'INVALID_PROPERTY',
            message: `Propriedade desconhecida: ${mutation.propertyConceptId}.`,
            layer: 'binder',
            span,
            start: span?.start,
            end: span?.end
          }
        };
      }

      if (!property.valueCategories.includes(category)) {
        return this.invalidCategory(mutation.propertyConceptId, property.valueCategories, category, span);
      }

      if (
        entityConceptId &&
        !this.entityAccepts(entityConceptId, property.id)
      ) {
        return this.entityDoesNotAccept(entityConceptId, property.id, span);
      }

      return { ok: true, mutation };
    }

    if (mutation.propertyGroupId) {
      const group = this.concepts[mutation.propertyGroupId];
      if (group?.kind !== 'PROPERTY_GROUP') {
        return {
          ok: false,
          diagnostic: {
            severity: 'ERROR',
            code: 'INVALID_PROPERTY',
            message: `Grupo de propriedades desconhecido: ${mutation.propertyGroupId}.`,
            layer: 'binder',
            span,
            start: span?.start,
            end: span?.end
          }
        };
      }

      const propertyId = group.bindingByValueCategory[category];
      if (!propertyId) {
        return this.invalidCategory(
          group.id,
          acceptedCategoriesOf(group, this.concepts),
          category,
          span
        );
      }

      if (entityConceptId && !this.entityAccepts(entityConceptId, propertyId)) {
        return this.entityDoesNotAccept(entityConceptId, propertyId, span);
      }

      return {
        ok: true,
        mutation: { kind: 'SET', propertyConceptId: propertyId, value: mutation.value }
      };
    }

    if (!entityConceptId) {
      const preferred = this.preferredPropertyFor(mutation.value);
      if (preferred) {
        return {
          ok: true,
          mutation: { kind: 'SET', propertyConceptId: preferred, value: mutation.value }
        };
      }
      return {
        ok: false,
        diagnostic: {
          severity: 'ERROR',
          code: 'UNSUPPORTED_OPERATION',
          message:
            'Não é possível inferir a propriedade: nenhuma propriedade foi mencionada e ' +
            'não há entidade em foco para fornecer o binding padrão.',
          layer: 'binder',
          span,
          start: span?.start,
          end: span?.end
        }
      };
    }

    // Valor com propriedade idiomaticamente associada ("redondo" → radius).
    const preferred = this.preferredPropertyFor(mutation.value, entityConceptId);
    if (preferred) {
      return {
        ok: true,
        mutation: { kind: 'SET', propertyConceptId: preferred, value: mutation.value }
      };
    }

    const entity = this.concepts[entityConceptId];
    if (entity?.kind !== 'ENTITY') {
      return {
        ok: false,
        diagnostic: {
          severity: 'ERROR',
          code: 'INVALID_PROPERTY',
          message: `Entidade desconhecida: ${entityConceptId}.`,
          layer: 'binder',
          span,
          start: span?.start,
          end: span?.end
        }
      };
    }

    const propertyId = entity.capabilities.defaultValueBindings[category];
    if (!propertyId) {
      return {
        ok: false,
        diagnostic: {
          severity: 'ERROR',
          code: 'INVALID_PROPERTY',
          message:
            `A entidade ${entity.id} não define propriedade padrão para valores de categoria ` +
            `${category}. Informe a propriedade explicitamente (ex.: "cor de fundo", "borda").`,
          layer: 'binder',
          span,
          start: span?.start,
          end: span?.end,
          candidates: entity.capabilities.acceptedPropertyIds,
          scores: []
        }
      };
    }

    if (!this.entityAccepts(entityConceptId, propertyId)) {
      return this.entityDoesNotAccept(entityConceptId, propertyId, span);
    }

    return {
      ok: true,
      mutation: { kind: 'SET', propertyConceptId: propertyId, value: mutation.value }
    };
  }

  private entityAccepts(entityConceptId: ConceptId, propertyId: ConceptId): boolean {
    const entity = this.concepts[entityConceptId];
    return entity?.kind === 'ENTITY'
      ? entity.capabilities.acceptedPropertyIds.includes(propertyId)
      : true;
  }

  /**
   * Valor com propriedade idiomaticamente associada ("redondo" → border
   * radius). Só vale quando a entidade aceita essa propriedade.
   */
  private preferredPropertyFor(
    value: AstValue,
    entityConceptId?: ConceptId
  ): ConceptId | null {
    if (!value.valueConceptId) return null;
    const concept = this.concepts[value.valueConceptId];
    if (concept?.kind !== 'VALUE' || !concept.preferredPropertyId) return null;
    if (entityConceptId && !this.entityAccepts(entityConceptId, concept.preferredPropertyId)) {
      return null;
    }
    return concept.preferredPropertyId;
  }

  private invalidCategory(
    propertyId: ConceptId,
    accepted: ValueCategory[],
    received: ValueCategory,
    span?: Span
  ): BindFailure {
    return {
      ok: false,
      diagnostic: {
        severity: 'ERROR',
        code: 'INVALID_VALUE_CATEGORY',
        message:
          `A propriedade ${propertyId} aceita valores de categoria ${describeCategories(accepted)}, ` +
          `mas recebeu um valor de categoria ${received}.`,
        layer: 'binder',
        span,
        start: span?.start,
        end: span?.end,
        candidates: accepted
      }
    };
  }

  private entityDoesNotAccept(
    entityConceptId: ConceptId,
    propertyId: ConceptId,
    span?: Span
  ): BindFailure {
    const entity = this.concepts[entityConceptId];
    const accepted = entity?.kind === 'ENTITY' ? entity.capabilities.acceptedPropertyIds : [];
    return {
      ok: false,
      diagnostic: {
        severity: 'ERROR',
        code: 'INVALID_PROPERTY',
        message: `A entidade ${entityConceptId} não aceita a propriedade ${propertyId}.`,
        layer: 'binder',
        span,
        start: span?.start,
        end: span?.end,
        candidates: accepted
      }
    };
  }
}

function acceptedCategoriesOf(
  group: PropertyGroupConcept,
  concepts: Record<ConceptId, ConceptNode>
): ValueCategory[] {
  const out = new Set<ValueCategory>();
  for (const id of group.members) {
    const member = concepts[id];
    if (member?.kind === 'PROPERTY') {
      for (const c of member.valueCategories) out.add(c);
    }
  }
  return Array.from(out);
}
