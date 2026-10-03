import type { ConceptId } from '../engine/types';
import type { ConceptNode } from '../engine/ontology/Concept';

/**
 * Mapeia propriedades armazenadas por ConceptId para propriedades CSS reais.
 * O modelo vivo guarda ConceptId; o renderizador traduz para o DOM.
 */
export const PROPERTY_TO_CSS: Record<string, string> = {
  C_PROP_BG_COLOR: 'backgroundColor',
  C_PROP_TEXT_COLOR: 'color',
  C_PROP_BORDER_COLOR: 'borderColor',
  C_PROP_BORDER_WIDTH: 'borderWidth',
  C_PROP_BORDER_STYLE: 'borderStyle',
  C_PROP_PADDING: 'padding',
  C_PROP_FONT_SIZE: 'fontSize'
};

export function cssPropertyName(conceptId: ConceptId): string {
  return PROPERTY_TO_CSS[conceptId] ?? conceptId;
}

export function toCssValue(
  conceptId: ConceptId,
  value: string | number | boolean
): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/** Estilos padrão da entidade vindos da ontologia. */
export function entityDefaultStyles(concept: ConceptNode): Record<string, string> {
  if (concept.kind !== 'ENTITY') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(concept.rendering.defaultStyles)) {
    out[k] = String(v);
  }
  return out;
}

/**
 * Monta o estilo inline final de um nó.
 *
 * Regra de precedência: estilos padrão da ontologia são a base; propriedades
 * EXPLÍCITAS do nó (definidas por comandos) sempre vencem. Uma borda só é
 * escondida quando o próprio documento declara `borderStyle = none`, nunca por
 * causa de um valor padrão.
 */
export function nodeStyle(
  properties: Record<ConceptId, string | number | boolean>,
  concept?: ConceptNode
): Record<string, string> {
  const base = concept ? entityDefaultStyles(concept) : {};
  const style: Record<string, string> = { ...base };

  // Um padrão de borda "none" não deve mascarar bordas definidas explicitamente.
  if (style['borderStyle'] === 'none' && !properties['C_PROP_BORDER_STYLE']) {
    delete style['borderStyle'];
  }

  for (const [conceptId, value] of Object.entries(properties)) {
    style[cssPropertyName(conceptId)] = toCssValue(conceptId, value);
  }

  // O documento pediu explicitamente uma borda sem estilo: mantém 'none'.
  if (properties['C_PROP_BORDER_STYLE'] === 'none') {
    delete style['borderColor'];
    delete style['borderWidth'];
    return style;
  }

  // Há largura/cor de borda mas nenhum estilo declarado: aplica um estilo visível.
  const hasWidth = style['borderWidth'] !== undefined && style['borderWidth'] !== '0px';
  const hasColor = style['borderColor'] !== undefined;
  if ((hasWidth || hasColor) && !style['borderStyle']) {
    style['borderStyle'] = 'solid';
  }
  if (hasWidth && !style['borderColor']) {
    style['borderColor'] = '#000000';
  }
  if (hasColor && !style['borderWidth']) {
    style['borderWidth'] = '1px';
  }

  return style;
}
