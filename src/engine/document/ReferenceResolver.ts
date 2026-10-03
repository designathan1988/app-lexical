import type { ConceptId, DocumentNodeId } from '../types';
import type { DocumentModel, DocumentNode } from './DocumentModel';
import { preorderNodeIds } from './traversal';
import type { SemanticReference, SemanticSelector } from '../ast/ast';
import type { Diagnostic } from '../diagnostics';
import type { EngineSettings } from '../EngineSettings';
import type { DiscourseContext, NodeLookup, Liveness } from '../parser/DiscourseContext';

export interface ResolveOptions {
  /** Span do marcador de direção, quando houver (B3/B4). */
  directionSpan?: { start: number; end: number };
  /** Diagnósticos já emitidos pelo parser (B2: sem cascata no mesmo trecho). */
  priorDiagnostics?: Array<{ severity: string; code?: string; start?: number; end?: number }>;
  diagnostics?: Diagnostic[];
  settings?: EngineSettings;
  discourse?: DiscourseContext;
  nodeLookup?: NodeLookup;
  liveness?: Liveness;
  layer?: string;
}

/**
 * Consulta o documento REAL. Não mantém árvore paralela.
 *
 * A ordem dos candidatos é a ORDEM DO DOCUMENTO (pré-ordem a partir de
 * `rootIds` seguindo `childIds`) — nunca a ordem de inserção do Map. Ordinal,
 * "primeiro", "último" e COUNT usam essa ordem.
 *
 * Ordem de resolução de um definido singular:
 *   1. filtros explícitos (tipo, texto, propriedade, pai, direção);
 *   2. saliência no discurso;
 *   3. seleção atual, se compatível;
 *   4. se ainda houver mais de um → AMBIGUOUS_REFERENCE.
 */
export class ReferenceResolver {
  constructor(private document: DocumentModel) {}

  resolve(reference: SemanticReference, opts: ResolveOptions = {}): DocumentNodeId[] {
    switch (reference.kind) {
      case 'CURRENT_SELECTION':
        return [...this.document.selectionIds];
      case 'NEW_ENTITY':
        throw new Error('NEW_ENTITY references must be resolved by ExecutionPlanner');
      case 'NODE_ID':
        return this.document.nodes.has(reference.nodeId) ? [reference.nodeId] : [];
      case 'NODE_SET':
        return reference.nodeIds.filter((id) => this.document.nodes.has(id));
      case 'SELECTOR':
        return this.resolveSelector(reference.selector, opts);
    }
  }

  /** Nós do documento na ordem canônica. */
  private ordered(): DocumentNode[] {
    return preorderNodeIds(this.document)
      .map((id) => this.document.nodes.get(id))
      .filter((n): n is DocumentNode => Boolean(n));
  }

  resolveSelector(selector: SemanticSelector, opts: ResolveOptions = {}): DocumentNodeId[] {
    const layer = opts.layer ?? 'resolver';
    const span = selector.span;
    const settings = opts.settings;
    let nodes = this.ordered();

    if (selector.entityConceptId) {
      nodes = nodes.filter((node) => node.entityConceptId === selector.entityConceptId);
    }

    if (selector.textEquals !== undefined) {
      nodes = nodes.filter((node) => node.text === selector.textEquals);
    }

    if (selector.propertyFilter) {
      const { propertyConceptId, value } = selector.propertyFilter;
      nodes = nodes.filter((node) => node.properties[propertyConceptId] === value);
    }

    if (selector.parent) {
      const parents = new Set(this.resolveSelector(selector.parent, opts));
      nodes = nodes.filter((node) => node.parentId !== null && parents.has(node.parentId));
    }

    if (selector.distinctFrom) {
      const distinct = new Set(this.resolveSelector(selector.distinctFrom, opts));
      nodes = nodes.filter((node) => !distinct.has(node.id));
    }

    if (selector.direction && nodes.length) {
      nodes = this.applyDirection(nodes, selector.direction, { ...opts, directionSpan: selector.directionSpan });
    }

    if (selector.exclusions?.length) {
      const excluded = new Set<DocumentNodeId>();
      for (const exclusion of selector.exclusions) {
        for (const id of this.resolveSelector(exclusion, opts)) excluded.add(id);
      }
      nodes = nodes.filter((node) => !excluded.has(node.id));
    }

    // ---- Desambiguação por saliência / seleção -----------------------------

    if (selector.ordinalIndex === undefined && selector.quantity?.mode !== 'ALL') {
      nodes = this.disambiguate(nodes, selector, opts, layer);
    }

    // ---- Ordinal -----------------------------------------------------------

    if (selector.ordinalIndex !== undefined) {
      const count = selector.quantity?.mode === 'COUNT' ? selector.quantity.count : 1;
      const idx = selector.ordinalIndex;

      let slice: DocumentNode[];
      if (idx < 0) {
        // "os dois últimos" → os N últimos; "o último" → o último.
        const end = Math.max(0, nodes.length + idx + 1);
        slice = nodes.slice(Math.max(0, end - count), end);
      } else {
        slice = nodes.slice(idx, idx + count);
      }

      if (slice.length < count || slice.length === 0) {
        opts.diagnostics?.push({
          severity: 'ERROR',
          code: 'TARGET_NOT_FOUND',
          message:
            `A referência ordinal pede ${count} elemento(s) a partir da posição ${idx}, ` +
            `mas há ${nodes.length} elemento(s) compatível(is).`,
          span,
          start: span?.start,
          end: span?.end,
          layer,
          candidates: nodes.map((n) => n.id)
        });
        return [];
      }

      return slice.map((node) => node.id);
    }

    switch (selector.quantity?.mode) {
      case 'ALL':
        return nodes.map((node) => node.id);
      case 'COUNT':
        if (nodes.length < selector.quantity.count) {
          opts.diagnostics?.push({
            severity: 'ERROR',
            code: 'TARGET_NOT_FOUND',
            message:
              `A referência pede ${selector.quantity.count} elemento(s), mas há ` +
              `${nodes.length} compatível(is).`,
            span,
            start: span?.start,
            end: span?.end,
            layer,
            candidates: nodes.map((n) => n.id)
          });
          return [];
        }
        return nodes.slice(0, selector.quantity.count).map((node) => node.id);
      case 'ONE':
      default:
        return nodes[0] ? [nodes[0].id] : [];
    }
  }

  /**
   * Reduz candidatos por saliência de discurso e seleção. Se ainda houver mais
   * de um, emite AMBIGUOUS_REFERENCE (erro por padrão) sem escolher em silêncio.
   */
  private disambiguate(
    nodes: DocumentNode[],
    selector: SemanticSelector,
    opts: ResolveOptions,
    layer: string
  ): DocumentNode[] {
    if (nodes.length <= 1) return nodes;

    const settings = opts.settings;

    // 1. Saliência no discurso: menção mais recente desse tipo cujo nó exista.
    if (opts.discourse && opts.nodeLookup && selector.entityConceptId) {
      const mention = opts.discourse.salientMentionOfConcept(
        opts.nodeLookup,
        opts.liveness,
        selector.entityConceptId
      );
      const reference = mention?.reference;
      if (reference && reference.kind === 'NODE_ID') {
        const match = nodes.find((n) => n.id === reference.nodeId);
        if (match) return [match];
      }
    }

    // 2. Seleção atual, se compatível.
    const selected = this.document.selectionIds
      .map((id) => this.document.nodes.get(id))
      .filter((n): n is DocumentNode => Boolean(n))
      .filter((n) => nodes.some((candidate) => candidate.id === n.id));
    if (selected.length === 1) return selected;

    if (!settings?.ambiguityWarningEnabled) return nodes;

    // B2 — Não repete ambiguidade sobre um trecho que já tem erro (ex.:
    // quantificador vago recusado no mesmo span): um problema por trecho.
    const spanStart = selector.span?.start;
    const priorAndCurrent = [
      ...(opts.priorDiagnostics ?? []),
      ...(opts.diagnostics ?? [])
    ];
    const alreadyReported = priorAndCurrent.some(
      (d) => d.severity === 'ERROR' && d.start === spanStart
    );
    if (alreadyReported) return [];

    // 3. Continua ambíguo: reporta, sem escolher silenciosamente.
    opts.diagnostics?.push({
      severity: settings.ambiguityIsFatal ? 'ERROR' : 'WARNING',
      code: 'AMBIGUOUS_REFERENCE',
      message:
        `A referência casa com ${nodes.length} elementos e nenhum é saliente no discurso. ` +
        'Especifique qual (primeiro, segundo, por texto, …).',
      span: selector.span,
      start: selector.span?.start,
      end: selector.span?.end,
      layer,
      candidates: nodes.map((n) => n.id)
    });

    // Ambiguidade fatal: NENHUM alvo é devolvido — o plano não pode ganhar
    // passos para uma referência que o motor se recusa a escolher.
    return settings?.ambiguityIsFatal ? [] : nodes;
  }

  private applyDirection(
    nodes: DocumentNode[],
    direction: NonNullable<SemanticSelector['direction']>,
    opts: ResolveOptions
  ): DocumentNode[] {
    const withRect = nodes.filter((node) => node.rect);
    if (!withRect.length) {
      const fallbackSpan = opts.directionSpan;
      opts.diagnostics?.push({
        severity: 'INFO',
        code: 'ORDER_FALLBACK',
        message:
          'Sem métricas de layout disponíveis, a ordem espacial cai na ordem do documento.',
        span: fallbackSpan,
        start: fallbackSpan?.start,
        end: fallbackSpan?.end,
        layer: opts.layer ?? 'resolver'
      });
      // B4 — Sem rect, o eixo cai na ordem do documento: RIGHTMOST/BOTTOMMOST
      // são o ÚLTIMO; LEFTMOST/TOPMOST são o PRIMEIRO.
      switch (direction) {
        case 'RIGHTMOST':
        case 'BOTTOMMOST': {
          const last = nodes[nodes.length - 1];
          return last ? [last] : [];
        }
        case 'LEFTMOST':
        case 'TOPMOST': {
          const first = nodes[0];
          return first ? [first] : [];
        }
      }
    }

    const score = (node: DocumentNode): number => {
      const rect = node.rect!;
      switch (direction) {
        case 'LEFTMOST':
          return rect.x;
        case 'RIGHTMOST':
          return -(rect.x + rect.width);
        case 'TOPMOST':
          return rect.y;
        case 'BOTTOMMOST':
          return -(rect.y + rect.height);
      }
    };

    const sorted = withRect.slice().sort((a, b) => score(a) - score(b));
    // B4 — Empate no eixo (dentro da tolerância): devolve os empatados; a
    // ambiguidade é decidida pela camada de referência, não por sorte.
    const tolerance = opts.settings?.directionTieTolerance ?? 1;
    const best = score(sorted[0]);
    return sorted.filter((node) => Math.abs(score(node) - best) <= tolerance);
  }
}
