import type {
  ConceptId,
  GrammaticalGender,
  GrammaticalNumber,
  DocumentNodeId,
  TempNodeId
} from '../types';
import type { SemanticReference, SemanticSelector } from '../ast/ast';
import { isTempNodeId, tempIdOf } from '../planning/TempNodes';

export interface Mention {
  reference: SemanticReference;
  entityConceptId?: ConceptId;
  gender?: GrammaticalGender;
  number?: GrammaticalNumber;
  /** Ordem de aparição (crescente). */
  seq: number;
}

/** Consulta ao documento vivo: o discurso nunca aponta para nó inexistente. */
export interface NodeLookup {
  (nodeId: DocumentNodeId): { entityConceptId: ConceptId } | undefined;
}

/**
 * Vivacidade de uma referência: quantos nós do documento ela casa agora.
 * Permite descartar menções cujo alvo sumiu (undo, delete) ou mudou de tipo.
 */
export interface Liveness {
  (selector: SemanticSelector): number;
}

/**
 * Contexto de discurso TRANSACIONAL.
 *
 * Durante o parsing, as menções do comando corrente vão para um buffer de
 * STAGING. Só após execução bem-sucedida o staging é promovido ao discurso
 * persistente, com as referências materializadas em NODE_ID quando apontam
 * para um único nó.
 *
 * Em falha, análise ou rollback, o staging é descartado — nunca sobra menção
 * órfã apontando para um nó que não existe.
 */
export class DiscourseContext {
  private mentions: Mention[] = [];
  private staging: Mention[] = [];
  private counter = 0;

  stage(mention: Omit<Mention, 'seq'>): void {
    this.staging.push({ ...mention, seq: ++this.counter });
  }

  private visible(): Mention[] {
    return [...this.mentions, ...this.staging];
  }

  discard(): void {
    this.staging = [];
  }

  /**
   * Promove o staging ao discurso persistente:
   *  - NEW_ENTITY → NODE_ID do nó recém-criado;
   *  - SELECTOR que casa um único nó → NODE_ID (referência estável);
   *  - SELECTOR sem casamento ou com vários → descartado.
   */
  commit(tempToNode: Record<TempNodeId, DocumentNodeId>, liveness?: Liveness): void {
    for (const mention of this.staging) {
      if (mention.reference.kind === 'NEW_ENTITY') {
        const tempId = mention.reference.tempId;
        // Criação plural: a menção agrupa TODAS as instâncias do temp
        // ("tmp_1" → "tmp_1_1", "tmp_1_2") numa referência de grupo.
        const instanceIds = Object.entries(tempToNode)
          .filter(([temp]) => temp.startsWith(`${tempId}_`))
          .map(([, nodeId]) => nodeId);
        const ids = instanceIds.length
          ? instanceIds
          : tempToNode[tempId]
            ? [tempToNode[tempId]]
            : [];
        if (!ids.length) continue;
        mention.reference =
          ids.length === 1
            ? { kind: 'NODE_ID', nodeId: ids[0] }
            : { kind: 'NODE_SET', nodeIds: ids };
        this.mentions.push(mention);
        continue;
      }

      // Grupo de coordenação criado na frase: ids temporários → nós reais.
      if (mention.reference.kind === 'NODE_SET' && mention.reference.nodeIds.some(isTempNodeId)) {
        const ids = mention.reference.nodeIds.flatMap((id) => {
          if (!isTempNodeId(id)) return [id];
          const temp = tempIdOf(id);
          const instances = Object.entries(tempToNode)
            .filter(([t]) => t.startsWith(`${temp}_`))
            .map(([, nodeId]) => nodeId);
          return instances.length ? instances : tempToNode[temp] ? [tempToNode[temp]] : [];
        });
        if (!ids.length) continue;
        mention.reference = { kind: 'NODE_SET', nodeIds: ids };
        this.mentions.push(mention);
        continue;
      }

      if (mention.reference.kind === 'SELECTOR' && liveness) {
        if (liveness(mention.reference.selector) === 1) {
          this.mentions.push(mention);
        }
        continue;
      }

      this.mentions.push(mention);
    }
    this.staging = [];
  }

  clear(): void {
    this.mentions = [];
    this.staging = [];
    this.counter = 0;
  }

  /** Remove menções cujo nó sumiu ou mudou de tipo. */
  pruneStale(lookup: NodeLookup, liveness?: Liveness): void {
    this.mentions = this.mentions.filter((mention) => {
      if (mention.reference.kind === 'NODE_ID') {
        const node = lookup(mention.reference.nodeId);
        if (!node) return false;
        if (mention.entityConceptId && node.entityConceptId !== mention.entityConceptId) {
          return false;
        }
        return true;
      }
      if (mention.reference.kind === 'SELECTOR' && liveness) {
        return liveness(mention.reference.selector) > 0;
      }
      if (mention.reference.kind === 'NODE_SET') {
        mention.reference = {
          kind: 'NODE_SET',
          nodeIds: mention.reference.nodeIds.filter((id) => {
            const node = lookup(id);
            return node && (!mention.entityConceptId || node.entityConceptId === mention.entityConceptId);
          })
        };
        return mention.reference.nodeIds.length > 0;
      }
      return true;
    });
  }

  /** Menção mais recente compatível, cujo alvo ainda existe no documento. */
  private salienceMatch(
    lookup: NodeLookup,
    liveness: Liveness | undefined,
    predicate?: (mention: Mention) => boolean
  ): Mention | null {
    const ordered = this.visible()
      .slice()
      .sort((a, b) => b.seq - a.seq);

    for (const mention of ordered) {
      if (predicate && !predicate(mention)) continue;

      if (mention.reference.kind === 'NODE_ID') {
        const node = lookup(mention.reference.nodeId);
        if (!node) continue;
        if (mention.entityConceptId && node.entityConceptId !== mention.entityConceptId) continue;
        return mention;
      }

      if (mention.reference.kind === 'SELECTOR') {
        if (!liveness) continue;
        const count = liveness(mention.reference.selector);
        // Só serve como antecedente se apontar para exatamente um elemento.
        if (count !== 1) continue;
        return mention;
      }

      if (mention.reference.kind === 'NODE_SET') {
        const alive = mention.reference.nodeIds.filter((id) => lookup(id));
        if (!alive.length) continue;
        return mention;
      }

      if (mention.reference.kind === 'NEW_ENTITY') {
        return mention;
      }
    }
    return null;
  }

  /**
   * Resolve pronome por concordância de gênero e número e por saliência,
   * descartando menções cujo alvo não existe mais.
   */
  resolvePronoun(
    lookup: NodeLookup,
    liveness: Liveness | undefined,
    gender?: GrammaticalGender,
    number?: GrammaticalNumber,
    /** Restrição sintática adicional sobre o antecedente (ex.: Princípio B). */
    accept: (mention: Mention) => boolean = () => true
  ): SemanticReference | null {
    const match = this.salienceMatch(lookup, liveness, (mention) => {
      if (gender && mention.gender && gender !== mention.gender) return false;
      if (number && mention.number && mention.number !== number) return false;
      return accept(mention);
    });
    return match ? match.reference : null;
  }

  /** Tipo de entidade mais saliente (base da resolução de elipse nominal). */
  salientEntityConceptId(lookup: NodeLookup, liveness?: Liveness): ConceptId | null {
    const match = this.salienceMatch(lookup, liveness, (m) => Boolean(m.entityConceptId));
    return match?.entityConceptId ?? null;
  }

  /** Menção mais recente de um tipo cujo alvo ainda existe. */
  salientMentionOfConcept(
    lookup: NodeLookup,
    liveness: Liveness | undefined,
    conceptId: ConceptId
  ): Mention | null {
    return this.salienceMatch(
      lookup,
      liveness,
      (m) => m.entityConceptId === conceptId && m.reference.kind !== 'NEW_ENTITY'
    );
  }

  mentionsCount(): number {
    return this.mentions.length;
  }

  stagedCount(): number {
    return this.staging.length;
  }

  /** Instantâneo para depuração. */
  snapshot(): Mention[] {
    return this.visible().map((m) => ({ ...m }));
  }
}
