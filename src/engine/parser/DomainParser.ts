import type {
  ConceptId,
  DocumentNodeId,
  GrammaticalGender,
  GrammaticalNumber,
  TempNodeId
} from '../types';
import type {
  ConceptNode,
  EntityConcept,
  ActionConcept,
  SpatialConcept,
  PropertyConcept,
  PropertyGroupConcept,
  ValueConcept,
  OperatorKind
} from '../ontology/Concept';
import type { SemanticToken, ConceptCandidate } from './SemanticToken';
import type { LexicalIndex } from '../lexical/LexicalIndex';
import type {
  SemanticReference,
  SemanticSelector,
  SemanticCommand,
  SemanticDocumentAst,
  CreateCommandAst,
  UpdateCommandAst,
  DeleteCommandAst,
  MoveCommandAst,
  NewEntityAst,
  PlacementAst,
  AstValue,
  AstPropertyMutation
} from '../ast/ast';
import { SemanticCursor } from './SemanticCursor';
import { DiscourseContext, type NodeLookup } from './DiscourseContext';
import { PropertyBinder } from './PropertyBinder';
import { entriesFor, type GrammarIndex, type GrammarEntry } from './GrammarIndex';
import { ParseError, type Diagnostic, type Span } from '../diagnostics';
import type { EngineSettings } from '../EngineSettings';

function candidatesOfKind<K extends ConceptNode['kind']>(
  token: SemanticToken | undefined,
  concepts: Record<ConceptId, ConceptNode>,
  kind: K
): ConceptCandidate[] {
  if (!token) return [];
  return token.candidates
    .filter((c) => concepts[c.conceptId]?.kind === kind)
    .sort((a, b) => b.score - a.score);
}

interface EntityHead {
  concept: EntityConcept;
  gender?: GrammaticalGender;
  number?: GrammaticalNumber;
  span: Span;
}

interface NominalPrefix {
  definiteness: 'DEFINITE' | 'INDEFINITE' | 'UNSPECIFIED';
  quantity: number | 'ALL' | 'VAGUE' | null;
  ordinal: number | null;
  other: boolean;
}

type PropertyHead =
  | { kind: 'PROPERTY'; conceptId: ConceptId; concept: PropertyConcept }
  | { kind: 'PROPERTY_GROUP'; conceptId: ConceptId; concept: PropertyGroupConcept };

export interface ParserContext {
  concepts: Record<ConceptId, ConceptNode>;
  grammar: GrammarIndex;
  discourse: DiscourseContext;
  lexicalIndex: LexicalIndex;
  settings: EngineSettings;
  nodeLookup: NodeLookup;
  /** Quantos nós do documento casam com o seletor agora (vivacidade). */
  countMatches: (selector: SemanticSelector) => number;
  /** Todos os ids de nós existentes no documento. */
  nodeIds: () => DocumentNodeId[];
  defaults: { impliedContainmentRelationId: ConceptId; textContentPropertyId: ConceptId };
}

/**
 * Parser sintático-semântico de domínio.
 *
 * Trabalha sobre relações entre ocorrências (mentions, discurso, containment,
 * coordenação, negação, exclusão). Não há `currentEntity` global nem decisão
 * por ordem superficial: toda palavra consultada vem dos DADOS (GrammarIndex).
 */
export class DomainParser {
  private tempCounter = 0;
  private binder: PropertyBinder;
  /** Concordância do núcleo de cada entidade recém-criada (G1–G6). */
  private entityAgreement = new Map<TempNodeId, { gender?: GrammaticalGender; number?: GrammaticalNumber }>();
  diagnostics: Diagnostic[] = [];
  /**
   * Consumo por comando: índices globais dos tokens consumidos (invariante
   * F1.3 — todo token com leitura/literal é consumido por algum nó do AST ou
   * reportado em diagnóstico).
   */
  consumption: Array<{ commandIndex: number; consumedTokenIndices: number[] }> = [];
  private ctx: ParserContext;

  constructor(ctx: ParserContext) {
    this.ctx = ctx;
    this.binder = new PropertyBinder(ctx.concepts);
  }

  private nextTempId(): TempNodeId {
    this.tempCounter++;
    return `tmp_${this.tempCounter}`;
  }

  private emit(diagnostic: Diagnostic): void {
    this.diagnostics.push(diagnostic);
  }

  // -------------------------------------------------------------------------
  // Entrada
  // -------------------------------------------------------------------------

  parse(tokens: SemanticToken[]): SemanticDocumentAst {
    this.diagnostics = [];
    this.tempCounter = 0;
    this.consumption = [];

    const globalIndex = new Map<SemanticToken, number>();
    tokens.forEach((token, i) => globalIndex.set(token, i));

    const { groups, separators } = this.splitCommands(tokens);
    const commands: SemanticCommand[] = [];

    groups.forEach((group, groupIndex) => {
      const separatorTokens = separators[groupIndex] ?? [];
      if (!group.length) {
        if (separatorTokens.length) {
          this.consumption.push({
            commandIndex: commands.length,
            consumedTokenIndices: separatorTokens
              .map((token) => globalIndex.get(token))
              .filter((i): i is number => i !== undefined)
              .sort((a, b) => a - b)
          });
        }
        return;
      }
      const cursor = new SemanticCursor(group);
      try {
        const command = this.parseCommand(cursor);
        commands.push(command);
        this.reportUnconsumed(cursor, command);
      } catch (error) {
        // Comando abortado: o resto do grupo não pode sumir em silêncio.
        this.reportLeftovers(cursor);
        throw error;
      } finally {
        // Mesmo quando o comando aborta (ParseError), os tokens que o parser
        // consumiu até ali contam para a invariante de consumo (F1.3).
        const consumed = [...cursor.consumed, ...separatorTokens];
        this.consumption.push({
          commandIndex: commands.length,
          consumedTokenIndices: consumed
            .map((token) => globalIndex.get(token))
            .filter((i): i is number => i !== undefined)
            .sort((a, b) => a - b)
        });
      }
    });

    return { commands };
  }

  private isVerbToken(token: SemanticToken | undefined): boolean {
    return candidatesOfKind(token, this.ctx.concepts, 'ACTION').length > 0;
  }

  private hasOperator(token: SemanticToken | undefined, operator: OperatorKind): boolean {
    return this.operatorEntry(token, operator) !== undefined;
  }

  /**
   * Operador gramatical de um token. Cobre tanto palavras isoladas (consultadas
   * no GrammarIndex) quanto expressões multiword, cujo operador vem do conceito
   * associado à expressão ("que tem" → RELATIVE_HAVE).
   */
  private operatorEntry(
    token: SemanticToken | undefined,
    operator: OperatorKind
  ): GrammarEntry | undefined {
    if (!token) return undefined;

    for (const candidate of token.candidates) {
      const concept = this.ctx.concepts[candidate.conceptId];
      if (concept?.kind === 'OPERATOR' && concept.operator === operator) {
        return {
          lexemeId: candidate.lexemeId ?? candidate.conceptId,
          lemma: token.rawTokens.map((t) => t.raw).join(' '),
          conceptId: concept.id,
          operator: concept.operator,
          gender: candidate.morphology?.gender,
          number: candidate.morphology?.number
        };
      }
    }

    const word = token.rawTokens[0]?.normalized ?? null;
    return entriesFor(this.ctx.grammar, word).find((e) => e.operator === operator);
  }

  private consumeOperator(cursor: SemanticCursor, operator: OperatorKind): boolean {
    if (!this.hasOperator(cursor.peek(), operator)) return false;
    cursor.consume();
    return true;
  }

  private splitCommands(tokens: SemanticToken[]): {
    groups: SemanticToken[][];
    /** Conectores usados como fronteira de comando, por grupo encerrado. */
    separators: SemanticToken[][];
  } {
    const groups: SemanticToken[][] = [];
    const separators: SemanticToken[][] = [];
    let current: SemanticToken[] = [];

    const closeGroup = (separator?: SemanticToken) => {
      groups.push(current);
      separators.push(separator ? [separator] : []);
      current = [];
    };

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const raw = token.rawTokens.map((x) => x.raw).join('');

      if (raw === ';') {
        closeGroup(token);
        continue;
      }

      if (this.hasOperator(token, 'COORDINATION')) {
        const next = tokens[i + 1];
        const afterNext = tokens[i + 2];
        const startsCommand =
          this.isVerbToken(next) ||
          (this.hasOperator(next, 'NEGATION') && this.isVerbToken(afterNext));

        if (startsCommand) {
          closeGroup(token);
          continue;
        }
      }

      current.push(token);
    }

    if (current.length) {
      groups.push(current);
      separators.push([]);
    }
    return { groups, separators };
  }

  private reportUnconsumed(cursor: SemanticCursor, command: SemanticCommand): void {
    // Um NO_OP cujo span já cobre o grupo inteiro (ex.: ação negada) reportou
    // tudo o que havia para reportar; os demais deixam sobras.
    this.reportLeftovers(cursor, command.kind === 'NO_OP' ? command.span : undefined);
  }

  /**
   * Reporta tokens que sobraram sem tratamento (fim de comando ou resto de um
   * comando que abortou). Parte da invariante F1.3: nenhum token com leitura
   * ou literal desaparece em silêncio. Tokens já cobertos por `coveredSpan`
   * (o comando que os absorveu) não são repetidos.
   */
  private reportLeftovers(cursor: SemanticCursor, coveredSpan?: Span): void {
    const leftovers = cursor.tokens.slice(cursor.index);
    const content = leftovers.filter((token) => {
      if (coveredSpan && token.span.start >= coveredSpan.start && token.span.end <= coveredSpan.end) {
        return false;
      }
      if (token.candidates.length > 0) return true;
      if (token.literal) return true;
      const word = token.rawTokens[0]?.normalized;
      return Boolean(word && !this.isFunctionWord(word));
    });

    if (!content.length) return;

    const first = content[0];
    const last = content[content.length - 1];
    this.emit({
      severity: 'ERROR',
      code: 'UNCONSUMED_INPUT',
      message: `Não foi possível compreender: "${content
        .flatMap((t) => t.rawTokens.map((r) => r.raw))
        .join(' ')}".`,
      span: { start: first.span.start, end: last.span.end },
      start: first.span.start,
      end: last.span.end,
      layer: 'syntax',
      candidates: content.flatMap((t) => t.candidates.map((c) => c.conceptId))
    });
  }

  private isFunctionWord(word: string): boolean {
    return entriesFor(this.ctx.grammar, word).length > 0;
  }

  // -------------------------------------------------------------------------
  // Comando
  // -------------------------------------------------------------------------

  private parseCommand(cursor: SemanticCursor): SemanticCommand {
    const startSpan = cursor.peek()?.span;
    const negated = this.consumeOperator(cursor, 'NEGATION');
    const action = this.consumeAction(cursor);

    if (negated) {
      // A ação negada é ignorada por inteiro; o span do comando cobre todo o
      // grupo para que nenhum token fique silenciosamente sem tratamento.
      const last = cursor.tokens[cursor.tokens.length - 1];
      const span = {
        start: startSpan?.start ?? 0,
        end: last?.span.end ?? startSpan?.end ?? 0
      };
      return {
        kind: 'NO_OP',
        reason: 'NEGATED_ACTION',
        negatedOperation: action?.operation,
        span
      };
    }

    if (!action) return this.parseImplicitCommand(cursor);

    switch (action.operation) {
      case 'CREATE':
        return this.parseCreate(cursor, startSpan);
      case 'UPDATE':
        return this.parseUpdate(cursor, startSpan);
      case 'DELETE':
        return this.parseDelete(cursor, startSpan);
      case 'MOVE':
        return this.parseMove(cursor, startSpan);
      case 'QUERY':
        return this.parseQuery(cursor, startSpan);
    }
  }

  private consumeAction(cursor: SemanticCursor): ActionConcept | null {
    const token = cursor.peek();
    if (!token) return null;

    const candidates = candidatesOfKind(token, this.ctx.concepts, 'ACTION');
    if (!candidates.length) return null;

    const distinct: ActionConcept[] = [];
    for (const candidate of candidates) {
      const concept = this.ctx.concepts[candidate.conceptId] as ActionConcept;
      if (!distinct.some((d) => d.id === concept.id)) distinct.push(concept);
    }

    let chosen: ActionConcept;
    if (distinct.length === 1) {
      chosen = distinct[0];
    } else {
      chosen = this.disambiguateAction(cursor, distinct, token);
    }

    cursor.consume();
    return chosen;
  }

  /**
   * Desambiguação de sentido verbal por evidência estrutural: determinante
   * indefinido ou cardinal → criação; definido, ordinal ou pronome →
   * movimento/atualização.
   */
  private disambiguateAction(
    cursor: SemanticCursor,
    actions: ActionConcept[],
    token: SemanticToken
  ): ActionConcept {
    const next = cursor.peek(1);
    let preferred: 'CREATE' | 'MOVE' | 'UPDATE' | null = null;

    if (next) {
      if (this.hasOperator(next, 'INDEFINITE_ARTICLE') || this.cardinalOf(next) !== null) {
        preferred = 'CREATE';
      } else if (
        this.hasOperator(next, 'DEFINITE_ARTICLE') ||
        this.hasOperator(next, 'UNIVERSAL_QUANTIFIER') ||
        this.ordinalOf(next) !== null ||
        this.isPronounToken(next)
      ) {
        preferred = actions.some((a) => a.operation === 'MOVE') ? 'MOVE' : 'UPDATE';
      } else if (candidatesOfKind(next, this.ctx.concepts, 'ENTITY').length > 0) {
        // Núcleo nominal nu e plural ("coloque botões"): sintagma indefinido,
        // não pode ser referência definida a algo existente.
        preferred = 'CREATE';
      }
    }

    const match = preferred ? actions.find((a) => a.operation === preferred) : undefined;
    if (match) {
      this.emit({
        severity: 'INFO',
        code: 'AMBIGUOUS_SENSE',
        subcode: 'RESOLVED_BY_STRUCTURE',
        message:
          `O verbo "${token.rawTokens.map((t) => t.raw).join(' ')}" tem mais de um sentido ` +
          `(criar/mover); resolvido como ${match.operation} pela estrutura do complemento.`,
        span: token.span,
        start: token.span.start,
        end: token.span.end,
        layer: 'syntax',
        candidates: actions.map((a) => a.id)
      });
      return match;
    }

    this.emit({
      severity: 'ERROR',
      code: 'AMBIGUOUS_SENSE',
      message:
        `O verbo "${token.rawTokens.map((t) => t.raw).join(' ')}" tem sentidos incompatíveis ` +
        `(${actions.map((a) => a.operation).join(', ')}) sem evidência para escolher.`,
      span: token.span,
      start: token.span.start,
      end: token.span.end,
      layer: 'syntax',
      candidates: actions.map((a) => a.id)
    });
    return actions[0];
  }

  private parseImplicitCommand(cursor: SemanticCursor): SemanticCommand {
    const token = cursor.peek();
    const span = token?.span;

    if (span && token.candidates.length === 0 && token.literal === undefined) {
      this.emit({
        severity: 'ERROR',
        code: 'UNKNOWN_WORD',
        message: `Não foi possível compreender: "${token.rawTokens.map((t) => t.raw).join(' ')}".`,
        span,
        start: span.start,
        end: span.end,
        layer: 'morphology'
      });
      cursor.consume();
      return { kind: 'NO_OP', reason: 'NEGATED_ACTION', span };
    }

    throw new ParseError(
      'UNSUPPORTED_OPERATION',
      'Comando sem verbo de ação: informe a operação (criar, mudar, apagar, mover).',
      span
    );
  }

  // -------------------------------------------------------------------------
  // CREATE
  // -------------------------------------------------------------------------

  private parseCreate(cursor: SemanticCursor, startSpan?: Span): CreateCommandAst {
    const entities: NewEntityAst[] = [];
    const placements: PlacementAst[] = [];

    const first = this.parseNewEntity(cursor);
    if (!first) {
      throw new ParseError(
        'UNSUPPORTED_OPERATION',
        'A criação exige uma entidade (caixa, botão, texto).',
        cursor.peek()?.span
      );
    }
    entities.push(first);
    let current = first;

    while (!cursor.eof()) {
      if (this.hasOperator(cursor.peek(), 'COMITATIVE')) {
        const checkpoint = cursor.index;
        cursor.consume();

        if (this.pushMutation(cursor, current)) continue;

        const child = this.parseNewEntity(cursor);
        if (child) {
          entities.push(child);
          placements.push({
            source: { kind: 'NEW_ENTITY', tempId: child.tempId },
            relationConceptId: this.ctx.defaults.impliedContainmentRelationId,
            target: { kind: 'NEW_ENTITY', tempId: current.tempId },
            span: child.span
          });
          current = child;

          const trailing = this.peekSpatial(cursor);
          if (trailing && this.isContainment(trailing.id)) cursor.consume();

          if (this.distributeAdjacentMutation(cursor, entities, 'SUBORDINATED')) continue;
          continue;
        }

        cursor.index = checkpoint;
        break;
      }

      if (this.hasOperator(cursor.peek(), 'COORDINATION')) {
        const checkpoint = cursor.index;
        cursor.consume();
        const leadingConnector =
          this.consumeOperator(cursor, 'COMITATIVE') ||
          this.consumeOperator(cursor, 'ALLATIVE');

        if (this.pushMutation(cursor, current)) continue;

        if (leadingConnector) {
          cursor.index = checkpoint;
          break;
        }

        const sibling = this.parseNewEntity(cursor);
        if (sibling) {
          entities.push(sibling);
          current = sibling;
          if (this.distributeAdjacentMutation(cursor, entities)) continue;
          continue;
        }

        cursor.index = checkpoint;
        break;
      }

      const spatial = this.parseSpatial(cursor);
      if (spatial) {
        const next = this.parseSpatialTarget(cursor, current, spatial, entities, placements);
        if (!next) break;
        current = next;
        continue;
      }

      // Mutação nua da entidade corrente: "um botão azul", "um botão sem borda".
      if (this.pushMutation(cursor, current)) continue;

      break;
    }

    return { kind: 'CREATE', entities, placements, span: startSpan };
  }

  /** Tenta interpretar a posição como mutação da entidade corrente. */
  private pushMutation(cursor: SemanticCursor, entity: NewEntityAst): boolean {
    const content = this.parseTextContentMutation(cursor, entity.entityConceptId);
    if (content) {
      entity.mutations.push(content);
      return true;
    }

    // "uma caixa que tenha borda azul": a oração relativa é uma mutação da
    // entidade que está sendo criada.
    if (this.hasOperator(cursor.peek(), 'RELATIVE_HAVE')) {
      const marker = cursor.peek()!;
      cursor.consume();
      const head = this.parsePropertyHead(cursor, entity.entityConceptId);
      if (head) {
        this.skipValueConnector(cursor);
        const value = this.parseValue(cursor, { allowText: this.propertyAcceptsText(head) });
        if (value) {
          const bound = this.binder.bind(
            entity.entityConceptId,
            this.propertyMutation(head, value, cursor.previousSpan()),
            cursor.previousSpan()
          );
          if (bound.ok) {
            entity.mutations.push(bound.mutation);
            return true;
          }
          this.emit(bound.diagnostic);
          throw new ParseError(bound.diagnostic.code, bound.diagnostic.message, bound.diagnostic.span);
        }
      }
      // A oração relativa não pôde ser compreendida: aborta o comando sem
      // mutação. Não há como "adiar" o marcador — reiniciar o cursor aqui
      // fazia o laço de `parseCreate` reprocessar o mesmo token para sempre.
      throw new ParseError(
        'UNSUPPORTED_OPERATION',
        'A oração relativa "que tem …" exige uma propriedade e um valor ' +
          '(por exemplo, "que tem borda azul").',
        marker.span
      );
    }

    const start = cursor.index;
    const mutations = this.parseMutations(cursor, entity.entityConceptId);
    if (mutations.length) {
      entity.mutations.push(...mutations);
      return true;
    }
    cursor.index = start;
    return false;
  }

  private parseSpatialTarget(
    cursor: SemanticCursor,
    current: NewEntityAst,
    spatial: SpatialConcept,
    entities: NewEntityAst[],
    placements: PlacementAst[]
  ): NewEntityAst | null {
    const token = cursor.peek();
    if (!token) {
      // "caixa com um botão dentro": o espacial final apenas CONFIRMA o
      // containment já estabelecido pela coordenação anterior.
      if (this.isContainment(spatial.id)) {
        return current;
      }
      throw new ParseError(
        'UNSUPPORTED_OPERATION',
        'A relação espacial exige um alvo.',
        cursor.previousSpan()
      );
    }

    if (this.operatorEntry(token, 'ALTERNATIVE_DETERMINER')) {
      return this.parseAlternativeTarget(cursor, current, spatial, entities, placements);
    }

    if (this.hasOperator(token, 'INDEFINITE_ARTICLE')) {
      const target = this.parseNewEntity(cursor);
      if (!target) {
        throw new ParseError(
          'UNSUPPORTED_OPERATION',
          'A relação espacial exige uma entidade alvo.',
          token.span
        );
      }
      entities.push(target);
      placements.push({
        source: { kind: 'NEW_ENTITY', tempId: current.tempId },
        relationConceptId: spatial.id,
        target: { kind: 'NEW_ENTITY', tempId: target.tempId },
        span: token.span
      });
      return target;
    }

    const reference = this.parseReference(cursor);
    placements.push({
      source: { kind: 'NEW_ENTITY', tempId: current.tempId },
      relationConceptId: spatial.id,
      target: reference,
      span: token.span
    });
    return current;
  }

  /**
   * "outro/outra": entidade DISTINTA da menção de mesmo tipo já presente na
   * frase. Sem instância existente compatível → nova entidade; com exatamente
   * uma → referencia essa; com várias → saliência e, se empatado,
   * AMBIGUOUS_REFERENCE.
   */
  private parseAlternativeTarget(
    cursor: SemanticCursor,
    current: NewEntityAst,
    spatial: SpatialConcept,
    entities: NewEntityAst[],
    placements: PlacementAst[]
  ): NewEntityAst | null {
    const otherToken = cursor.peek()!;
    const checkpoint = cursor.index;
    cursor.consume();

    this.parseNominalPrefix(cursor);
    const head = this.parseEntityHead(cursor);
    if (!head) {
      cursor.index = checkpoint;
      return null;
    }

    const existing = this.ctx.nodeIds().filter((id) => {
      const node = this.ctx.nodeLookup(id);
      return node?.entityConceptId === head.concept.id;
    });

    if (existing.length === 0) {
      const target = this.parseNewEntityTail(head, cursor);
      entities.push(target);
      placements.push({
        source: { kind: 'NEW_ENTITY', tempId: current.tempId },
        relationConceptId: spatial.id,
        target: { kind: 'NEW_ENTITY', tempId: target.tempId },
        span: otherToken.span
      });
      return target;
    }

    if (existing.length === 1) {
      placements.push({
        source: { kind: 'NEW_ENTITY', tempId: current.tempId },
        relationConceptId: spatial.id,
        target: {
          kind: 'SELECTOR',
          selector: {
            entityConceptId: head.concept.id,
            quantity: { mode: 'ONE' },
            span: otherToken.span
          }
        },
        span: otherToken.span
      });
      return current;
    }

    const salient = this.ctx.discourse.salientMentionOfConcept(
      this.ctx.nodeLookup,
      this.ctx.countMatches,
      head.concept.id
    );
    if (salient && salient.reference.kind === 'NODE_ID') {
      placements.push({
        source: { kind: 'NEW_ENTITY', tempId: current.tempId },
        relationConceptId: spatial.id,
        target: salient.reference,
        span: otherToken.span
      });
      return current;
    }

    this.emit({
      severity: 'ERROR',
      code: 'AMBIGUOUS_REFERENCE',
      message:
        `"outra ${head.concept.id}" é ambíguo: existem ${existing.length} instâncias e ` +
        'nenhuma é saliente no discurso.',
      span: otherToken.span,
      start: otherToken.span.start,
      end: otherToken.span.end,
      layer: 'syntax',
      candidates: existing
    });
    return current;
  }

  // -------------------------------------------------------------------------
  // UPDATE
  // -------------------------------------------------------------------------

  /**
   * UPDATE com leitura especulativa.
   *
   * Três leituras possíveis, em ordem de especificidade:
   *   1. propriedade primeiro ("mude o fundo do botão para azul");
   *   2. valor primeiro   ("mude para vermelho o botão X");
   *   3. alvo primeiro    ("mude o botão para azul").
   *
   * Uma leitura só é aceita se PRODUZIR um comando válido. Se a leitura como
   * propriedade falhar (ex.: categoria incompatível) e a leitura como alvo
   * funcionar, vale a segunda — "deixe o texto azul" é o elemento TEXT, não a
   * propriedade de conteúdo. Se nenhuma funcionar, o diagnóstico mais
   * específico (o do binder) é preservado.
   */
  private parseUpdate(cursor: SemanticCursor, startSpan?: Span): UpdateCommandAst {
    const start = cursor.index;
    const diagnosticsBefore = this.diagnostics.length;

    const propertyAttempt = this.tryPropertyFirst(cursor, start, startSpan);
    if (propertyAttempt.command) return propertyAttempt.command;

    const valueAttempt = this.tryValueFirst(cursor, start, startSpan);
    if (valueAttempt.command) return valueAttempt.command;

    const targetAttempt = this.tryTargetFirst(cursor, start, startSpan);
    if (targetAttempt.command) return targetAttempt.command;

    // Nenhuma leitura produziu comando: reporta a falha mais informativa.
    const specific = propertyAttempt.failure ?? targetAttempt.failure;
    this.diagnostics.length = diagnosticsBefore;
    if (specific) {
      this.emit(specific);
      throw new ParseError(specific.code, specific.message, specific.span);
    }
    throw new ParseError(
      'UPDATE_REQUIRES_VALUE',
      'A atualização exige ao menos uma propriedade e um valor.',
      cursor.peek()?.span
    );
  }

  private tryPropertyFirst(
    cursor: SemanticCursor,
    start: number,
    startSpan?: Span
  ): { command?: UpdateCommandAst; failure?: Diagnostic } {
    const diagnosticsBefore = this.diagnostics.length;
    cursor.index = start;

    this.parseNominalPrefix(cursor);
    const propHead = this.parsePropertyHead(cursor);
    if (!propHead) {
      cursor.index = start;
      return {};
    }

    if (this.hasOperator(cursor.peek(), 'PARTITIVE')) {
      cursor.consume();
      const target = this.parseReference(cursor);
      this.skipValueConnector(cursor);
      const valueSpan = cursor.spanFrom(start);
      const value = this.parseValue(cursor, { allowText: this.propertyAcceptsText(propHead) });
      if (!value) {
        this.diagnostics.length = diagnosticsBefore;
        cursor.index = start;
        return {};
      }

      const entityConceptId = this.entityConceptOf(target);
      const bound = this.binder.bind(
        entityConceptId,
        this.propertyMutation(propHead, value, valueSpan),
        valueSpan
      );
      if (!bound.ok) {
        this.diagnostics.length = diagnosticsBefore;
        cursor.index = start;
        return { failure: bound.diagnostic };
      }

      const chain = this.parsePropertyChain(cursor, propHead, entityConceptId);
      return { command: { kind: 'UPDATE', target, mutations: [bound.mutation, ...chain], span: startSpan } };
    }

    this.skipValueConnector(cursor);
    const valueSpan = cursor.spanFrom(start);
    const value = this.parseValue(cursor, { allowText: this.propertyAcceptsText(propHead) });
    if (!value) {
      this.diagnostics.length = diagnosticsBefore;
      cursor.index = start;
      return {};
    }

    const bound = this.binder.bind(
      undefined,
      this.propertyMutation(propHead, value, valueSpan),
      valueSpan
    );
    if (!bound.ok) {
      this.diagnostics.length = diagnosticsBefore;
      cursor.index = start;
      return { failure: bound.diagnostic };
    }

    const chain = this.parsePropertyChain(cursor, propHead, undefined);
    return {
      command: {
        kind: 'UPDATE',
        target: { kind: 'CURRENT_SELECTION' },
        mutations: [bound.mutation, ...chain],
        span: startSpan
      }
    };
  }

  private tryValueFirst(
    cursor: SemanticCursor,
    start: number,
    startSpan?: Span
  ): { command?: UpdateCommandAst } {
    cursor.index = start;

    if (
      !this.hasOperator(cursor.peek(), 'ALLATIVE') &&
      !this.hasOperator(cursor.peek(), 'COMITATIVE')
    ) {
      return {};
    }

    const diagnosticsBefore = this.diagnostics.length;
    const checkpoint = cursor.index;
    cursor.consume();
    const value = this.parseValue(cursor, { allowText: true });
    if (!value) {
      cursor.index = checkpoint;
      return {};
    }

    try {
      const target = this.parseReference(cursor);
      const mutation = this.bindValueOnly(value, this.entityConceptOf(target), cursor.previousSpan());
      return { command: { kind: 'UPDATE', target, mutations: [mutation], span: startSpan } };
    } catch {
      this.diagnostics.length = diagnosticsBefore;
      cursor.index = start;
      return {};
    }
  }

  private tryTargetFirst(
    cursor: SemanticCursor,
    start: number,
    startSpan?: Span
  ): { command?: UpdateCommandAst; failure?: Diagnostic } {
    const diagnosticsBefore = this.diagnostics.length;
    cursor.index = start;

    try {
      const target = this.parseReference(cursor);
      const mutations = this.parseMutations(cursor, this.entityConceptOf(target));

      while (this.hasOperator(cursor.peek(), 'EXCEPT') && target.kind === 'SELECTOR') {
        cursor.consume();
        target.selector.exclusions = [
          this.parseSelector(cursor, target.selector.entityConceptId, false)
        ];
      }

      if (!mutations.length) {
        this.diagnostics.length = diagnosticsBefore;
        cursor.index = start;
        return {};
      }

      return { command: { kind: 'UPDATE', target, mutations, span: startSpan } };
    } catch (error) {
      const diagnostic = this.diagnosticFrom(error);
      this.diagnostics.length = diagnosticsBefore;
      cursor.index = start;
      return { failure: diagnostic };
    }
  }

  private diagnosticFrom(error: unknown): Diagnostic | undefined {
    const candidate = error as { code?: string; message?: string; span?: Span };
    if (candidate && typeof candidate.code === 'string') {
      return {
        severity: 'ERROR',
        code: candidate.code,
        message: candidate.message ?? String(error),
        span: candidate.span,
        start: candidate.span?.start,
        end: candidate.span?.end,
        layer: 'syntax'
      };
    }
    return undefined;
  }

  private skipValueConnector(cursor: SemanticCursor): void {
    if (
      this.hasOperator(cursor.peek(), 'ALLATIVE') ||
      this.hasOperator(cursor.peek(), 'COMITATIVE')
    ) {
      cursor.consume();
    }
  }

  // -------------------------------------------------------------------------
  // DELETE / MOVE / QUERY
  // -------------------------------------------------------------------------

  private parseDelete(cursor: SemanticCursor, startSpan?: Span): DeleteCommandAst {
    return {
      kind: 'DELETE',
      target: this.parseReference(cursor, undefined, true),
      span: startSpan
    };
  }

  private parseMove(cursor: SemanticCursor, startSpan?: Span): MoveCommandAst {
    // O sintagma espacial que segue o alvo é o DESTINO, não um filtro de pai.
    const target = this.parseReference(cursor, undefined, true, false);

    if (this.hasOperator(cursor.peek(), 'PARTITIVE')) {
      const checkpoint = cursor.index;
      cursor.consume();
      const spatial = this.parseSpatial(cursor);
      if (spatial && this.isContainment(spatial.id) && target.kind === 'SELECTOR') {
        target.selector.parent = this.parseSelector(cursor);
      } else {
        cursor.index = checkpoint;
      }
    }

    if (this.hasOperator(cursor.peek(), 'ALLATIVE')) cursor.consume();

    const relation = this.parseSpatial(cursor);
    if (!relation) {
      throw new ParseError(
        'UNSUPPORTED_OPERATION',
        'Mover exige um destino ("para dentro de", "para depois de", "ao lado de", …).',
        cursor.peek()?.span ?? startSpan ?? cursor.previousSpan()
      );
    }

    const destination = this.parseReference(
      cursor,
      this.entityConceptOf(target),
      true
    );

    return {
      kind: 'MOVE',
      target,
      placement: {
        source: target,
        relationConceptId: relation.id,
        target: destination,
        span: startSpan
      },
      span: startSpan
    };
  }

  private parseQuery(cursor: SemanticCursor, startSpan?: Span): SemanticCommand {
    return {
      kind: 'QUERY',
      target: this.parseReference(cursor, undefined, true),
      span: startSpan
    };
  }

  // -------------------------------------------------------------------------
  // Prefixo nominal
  // -------------------------------------------------------------------------

  private ordinalOf(token: SemanticToken | undefined): number | null {
    if (!token) return null;
    const word = token.rawTokens[0]?.normalized ?? null;
    const entry = entriesFor(this.ctx.grammar, word).find((e) => e.ordinalValue !== undefined);
    return entry?.ordinalValue ?? null;
  }

  private cardinalOf(token: SemanticToken | undefined): number | null {
    if (!token) return null;
    const word = token.rawTokens[0]?.normalized ?? null;
    const entry = entriesFor(this.ctx.grammar, word).find((e) => e.cardinalValue !== undefined);
    return entry?.cardinalValue ?? null;
  }

  private isPronounToken(token: SemanticToken | undefined): boolean {
    if (!token) return false;
    return token.candidates.some((c) => c.pos === 'PRONOUN');
  }

  /**
   * Tipo de entidade de uma referência já resolvida. Para pronomes, a
   * referência é um NODE_ID: o tipo vem do documento vivo.
   */
  private entityConceptOf(reference: SemanticReference): ConceptId | undefined {
    switch (reference.kind) {
      case 'SELECTOR':
        return reference.selector.entityConceptId;
      case 'NODE_ID':
        return this.ctx.nodeLookup(reference.nodeId)?.entityConceptId;
      case 'NEW_ENTITY':
        return undefined;
      case 'CURRENT_SELECTION':
        return undefined;
    }
  }

  private parseNominalPrefix(cursor: SemanticCursor): NominalPrefix {
    let definiteness: NominalPrefix['definiteness'] = 'UNSPECIFIED';
    let quantity: NominalPrefix['quantity'] = null;
    let ordinal: number | null = null;
    let other = false;

    // Aceita determinantes e numerais em qualquer ordem:
    // "os dois últimos" ≡ "os últimos dois".
    let consumed = true;
    while (consumed && !cursor.eof()) {
      consumed = false;
      const token = cursor.peek();

      if (this.consumeOperator(cursor, 'DEFINITE_ARTICLE')) {
        definiteness = 'DEFINITE';
        consumed = true;
        continue;
      }
      // Artigo indefinido no plural ("uns botões", "umas caixas") expressa
      // cardinalidade vaga: não pode virar uma quantidade inventada.
      {
        const token = cursor.peek();
        const article = this.operatorEntry(token, 'INDEFINITE_ARTICLE');
        if (article) {
          if (article.number === 'PLURAL') {
            quantity = 'VAGUE';
          } else if (definiteness === 'UNSPECIFIED') {
            definiteness = 'INDEFINITE';
          }
          cursor.consume();
          consumed = true;
          continue;
        }
      }
      if (this.consumeOperator(cursor, 'UNIVERSAL_QUANTIFIER')) {
        quantity = 'ALL';
        definiteness = 'DEFINITE';
        consumed = true;
        continue;
      }
      if (this.consumeOperator(cursor, 'ALTERNATIVE_DETERMINER')) {
        other = true;
        definiteness = 'DEFINITE';
        consumed = true;
        continue;
      }

      const cardinal = this.cardinalOf(token);
      if (cardinal !== null) {
        if (cardinal < 0) quantity = 'VAGUE';
        else if (cardinal > 1) {
          quantity = cardinal;
          if (definiteness === 'UNSPECIFIED') definiteness = 'INDEFINITE';
        }
        cursor.consume();
        consumed = true;
        continue;
      }

      const ord = this.ordinalOf(token);
      if (ord !== null) {
        ordinal = ord;
        cursor.consume();
        consumed = true;
        continue;
      }

      const literal = token?.literal;
      if (literal?.kind === 'NUMBER') {
        quantity = Number(literal.value);
        cursor.consume();
        consumed = true;
        continue;
      }
    }

    return { definiteness, quantity, ordinal, other };
  }

  // -------------------------------------------------------------------------
  // Entidades
  // -------------------------------------------------------------------------

  private parseEntityHead(cursor: SemanticCursor): EntityHead | null {
    const token = cursor.peek();
    if (!token) return null;

    const candidates = candidatesOfKind(token, this.ctx.concepts, 'ENTITY');
    if (!candidates.length) return null;

    const best = candidates[0];
    const concept = this.ctx.concepts[best.conceptId] as EntityConcept;
    cursor.consume();

    return {
      concept,
      gender: best.morphology?.gender,
      number: best.morphology?.number,
      span: token.span
    };
  }

  private parseNewEntity(cursor: SemanticCursor): NewEntityAst | null {
    const startSpan = cursor.peek()?.span;
    const prefix = this.parseNominalPrefix(cursor);
    const head = this.parseEntityHead(cursor);
    if (!head) return null;

    const entity = this.parseNewEntityTail(head, cursor, startSpan);
    if (prefix.quantity === 'VAGUE') {
      this.emitVagueQuantifier(startSpan);
    } else if (typeof prefix.quantity === 'number') {
      entity.quantity = prefix.quantity;
    }

    return entity;
  }

  /**
   * Quantificador vago ("alguns", "vários", "uns") não produz cardinalidade.
   * O motor recusa em vez de inventar uma quantidade.
   */
  private emitVagueQuantifier(span?: Span): void {
    this.emit({
      severity: 'ERROR',
      code: 'UNSUPPORTED_OPERATION',
      subcode: 'VAGUE_QUANTIFIER',
      message:
        'Quantificador vago: informe a quantidade exata (dois, três, …) ou use ' +
        '"todos". O motor não inventa uma cardinalidade.',
      span,
      start: span?.start,
      end: span?.end,
      layer: 'syntax'
    });
  }

  private parseNewEntityTail(
    head: EntityHead,
    cursor: SemanticCursor,
    startSpan?: Span
  ): NewEntityAst {
    const tempId = this.nextTempId();
    const entity: NewEntityAst = {
      tempId,
      entityConceptId: head.concept.id,
      quantity: 1,
      mutations: [],
      span: startSpan ?? head.span
    };

    const literal = cursor.peek()?.literal;
    if (literal?.kind === 'TEXT') {
      entity.text = String(literal.value);
      cursor.consume();
    }

    this.entityAgreement.set(tempId, { gender: head.gender, number: head.number });

    this.ctx.discourse.stage({
      reference: { kind: 'NEW_ENTITY', tempId },
      entityConceptId: entity.entityConceptId,
      gender: head.gender,
      number: head.number
    });

    return entity;
  }

  /**
   * 3.G/G1–G6 — Concordância de adjetivo com coordenação/adjunção.
   *
   * Depois de "crie uma caixa e um botão", o adjetivo seguinte distribui:
   *   - plural concordando com a coordenação (gênero = masc. se houver algum
   *     masculino) → aplica a TODOS os núcleos;
   *   - singular (ou gênero determinado) → vale só para o núcleo mais próximo
   *     que concorda ("caixa com um botão preta" → caixa);
   *   - nenhum núcleo concorda → AGREEMENT_MISMATCH, comando não executa.
   */
  private distributeAdjacentMutation(
    cursor: SemanticCursor,
    entities: NewEntityAst[],
    /** COORDINATED = núcleos no mesmo nível ("X e Y"); SUBORDINATED = "X com Y". */
    scope: 'COORDINATED' | 'SUBORDINATED' = 'COORDINATED'
  ): boolean {
    if (entities.length < 2) return false;
    const token = cursor.peek();
    if (!token) return false;

    let adjective: { gender?: GrammaticalGender; number?: GrammaticalNumber } | null = null;
    for (const candidate of token.candidates) {
      if (candidate.pos === 'ADJECTIVE') {
        adjective = {
          gender: candidate.morphology?.gender,
          number: candidate.morphology?.number
        };
        break;
      }
    }
    if (!adjective) return false;

    const genders = entities.map((e) => this.entityAgreement.get(e.tempId)?.gender);
    const coordinationGender = genders.includes('MASC')
      ? 'MASC'
      : genders.includes('FEM')
        ? 'FEM'
        : undefined;

    const targets: NewEntityAst[] = [];
    if (scope === 'COORDINATED' && adjective.number === 'PLURAL') {
      if (adjective.gender && coordinationGender && adjective.gender !== coordinationGender) {
        this.emit({
          severity: 'ERROR',
          code: 'AGREEMENT_MISMATCH',
          message:
            `O adjetivo "${token.rawTokens.map((t) => t.raw).join(' ')}" ` +
            `(${adjective.gender === 'MASC' ? 'masculino' : 'feminino'} plural) não concorda ` +
            'com a coordenação (o plural misto é masculino).',
          span: token.span,
          start: token.span.start,
          end: token.span.end,
          layer: 'syntax'
        });
        throw new ParseError(
          'AGREEMENT_MISMATCH',
          `O adjetivo "${token.rawTokens.map((t) => t.raw).join(' ')}" não concorda com os núcleos coordenados.`,
          token.span
        );
      }
      targets.push(...entities);
    } else {
      for (let i = entities.length - 1; i >= 0; i--) {
        const gender = this.entityAgreement.get(entities[i].tempId)?.gender;
        if (!adjective.gender || !gender || adjective.gender === gender) {
          targets.push(entities[i]);
          break;
        }
      }
      if (!targets.length) {
        this.emit({
          severity: 'ERROR',
          code: 'AGREEMENT_MISMATCH',
          message:
            `O adjetivo "${token.rawTokens.map((t) => t.raw).join(' ')}" não concorda ` +
            'com nenhum dos núcleos mencionados.',
          span: token.span,
          start: token.span.start,
          end: token.span.end,
          layer: 'syntax'
        });
        throw new ParseError(
          'AGREEMENT_MISMATCH',
          `O adjetivo "${token.rawTokens.map((t) => t.raw).join(' ')}" não concorda com nenhum núcleo.`,
          token.span
        );
      }
    }

    // Os tokens da mutação são consumidos uma única vez: reconstrói-se a
    // mesma mutação por núcleo a partir do mesmo checkpoint (determinístico).
    const checkpoint = cursor.index;
    let lastIndex = cursor.index;
    for (const target of targets) {
      cursor.index = checkpoint;
      const mutations = this.parseMutations(cursor, target.entityConceptId);
      if (mutations.length) {
        target.mutations.push(...mutations);
      } else {
        cursor.index = lastIndex;
        return false;
      }
      lastIndex = cursor.index;
    }
    cursor.index = lastIndex;
    return true;
  }

  // -------------------------------------------------------------------------
  // Seletores e referências
  // -------------------------------------------------------------------------

  private parseSelector(
    cursor: SemanticCursor,
    inheritedEntityConceptId?: ConceptId,
    registerMention = true,
    parsePropertyFilter = false,
    allowParent = true
  ): SemanticSelector {
    const startSpan = cursor.peek()?.span;
    const prefix = this.parseNominalPrefix(cursor);

    let entityConceptId = inheritedEntityConceptId;
    let gender: GrammaticalGender | undefined;
    let number: GrammaticalNumber | undefined;
    let elidedFrom: ConceptId | undefined;

    const head = this.parseEntityHead(cursor);
    if (head) {
      entityConceptId = head.concept.id;
      gender = head.gender;
      number = head.number;
    } else if (!entityConceptId) {
      const salient = this.ctx.discourse.salientEntityConceptId(this.ctx.nodeLookup, this.ctx.countMatches);
      if (!salient) {
        throw new ParseError(
          'INCOMPLETE_REFERENCE',
          'A referência não diz de que tipo de elemento se trata e não há antecedente no ' +
            'discurso. Especifique o elemento (caixa, botão, texto).',
          startSpan
        );
      }
      entityConceptId = salient;
      elidedFrom = salient;
      this.emit({
        severity: 'INFO',
        code: 'ELLIPSIS_RESOLVED',
        message: `Elipse resolvida para ${salient}, herdado da menção mais recente.`,
        span: startSpan,
        start: startSpan?.start,
        end: startSpan?.end,
        layer: 'syntax',
        candidates: [salient]
      });
    }

    if (prefix.quantity === 'VAGUE') {
      this.emitVagueQuantifier(startSpan);
    }

    // 3.G — Número e definitude: definido plural sem numeral vale por TODOS
    // os que casam com os filtros ("apague os botões azuis" → os dois azuis).
    const definitePlural =
      prefix.definiteness === 'DEFINITE' && number === 'PLURAL' && prefix.quantity === null;

    const selector: SemanticSelector = {
      entityConceptId,
      elidedFrom,
      quantity:
        prefix.quantity === 'ALL' || definitePlural
          ? { mode: 'ALL' }
          : typeof prefix.quantity === 'number'
            ? { mode: 'COUNT', count: prefix.quantity }
            : { mode: 'ONE' },
      span: startSpan
    };

    if (prefix.ordinal !== null) selector.ordinalIndex = prefix.ordinal;

    const text = cursor.peek()?.literal;
    if (text?.kind === 'TEXT') {
      selector.textEquals = String(text.value);
      cursor.consume();
    }

    if (parsePropertyFilter && entityConceptId) {
      const valueSpan = cursor.peek()?.span;
      const value = this.parseValue(cursor);
      if (value) {
        const bound = this.binder.bind(entityConceptId, { kind: 'SET', value }, valueSpan);
        if (bound.ok && bound.mutation.kind === 'SET' && bound.mutation.propertyConceptId) {
          selector.propertyFilter = {
            propertyConceptId: bound.mutation.propertyConceptId,
            value: bound.mutation.value.literal
          };
        }
      }
    }

    // B4 — Direção: "o botão da direita", "mais à esquerda", "de cima".
    // O marcador espacial de eixo restringe o seletor ao nó extremo naquela
    // direção (ordem do documento quando não há métricas de layout).
    const directional = this.peekSpatial(cursor);
    if (directional && 'direction' in directional && directional.direction) {
      cursor.consume();
      selector.direction = directional.direction;
    }

    // "o botão dentro da caixa" — containment restringe o seletor ao pai.
    // Desabilitado quando a referência é o alvo de um MOVE: nesse caso o
    // sintagma espacial é o DESTINO, tratado por `parseMove`.
    if (allowParent) {
      const containment = this.peekSpatial(cursor);
      if (containment && this.isContainment(containment.id)) {
        const checkpoint = cursor.index;
        cursor.consume();
        if (this.hasOperator(cursor.peek(), 'PARTITIVE')) cursor.consume();
        const parentToken = cursor.peek();
        if (parentToken && parentToken.candidates.length) {
          selector.parent = this.parseSelector(cursor, undefined, false);
        } else {
          cursor.index = checkpoint;
        }
      }
    }

    // Oração relativa: restringe o antecedente por estado ou por propriedade.
    this.applyRelativeClause(cursor, selector, entityConceptId);

    if (this.hasOperator(cursor.peek(), 'EXCEPT')) {
      cursor.consume();
      selector.exclusions = [this.parseSelector(cursor, entityConceptId, false)];
    }

    if (registerMention && entityConceptId) {
      this.ctx.discourse.stage({
        reference: { kind: 'SELECTOR', selector },
        entityConceptId,
        gender,
        number
      });
    }

    return selector;
  }

  /**
   * Oração relativa simples.
   *
   *   "que está dentro da caixa"  → restrição espacial (parent)
   *   "que tem borda azul"        → restrição de propriedade (propertyFilter)
   *
   * Compõe restrições sobre o MESMO seletor; não cria uma segunda referência.
   * Se o conteúdo não for reconhecido, emite `UNSUPPORTED_OPERATION` em vez de
   * deixar a oração por compreender.
   */
  private applyRelativeClause(
    cursor: SemanticCursor,
    selector: SemanticSelector,
    entityConceptId?: ConceptId
  ): void {
    while (
      this.hasOperator(cursor.peek(), 'RELATIVE_HAVE') ||
      this.hasOperator(cursor.peek(), 'RELATIVE_STATE')
    ) {
      const marker = cursor.peek()!;
      const isHave = this.hasOperator(marker, 'RELATIVE_HAVE');
      const checkpoint = cursor.index;
      cursor.consume();

      if (isHave) {
        const head = this.parsePropertyHead(cursor, entityConceptId);
        if (head) {
          this.skipValueConnector(cursor);
          const value = this.parseValue(cursor, { allowText: this.propertyAcceptsText(head) });
          if (value) {
            const bound = this.binder.bind(
              entityConceptId,
              this.propertyMutation(head, value, cursor.previousSpan()),
              cursor.previousSpan()
            );
            if (bound.ok && bound.mutation.kind === 'SET' && bound.mutation.propertyConceptId) {
              selector.propertyFilter = {
                propertyConceptId: bound.mutation.propertyConceptId,
                value: bound.mutation.value.literal
              };
              continue;
            }
          }
        }

        // Valor direto: "que tem azul"
        const direct = this.parseValue(cursor);
        if (direct) {
          const bound = this.binder.bind(entityConceptId, { kind: 'SET', value: direct });
          if (bound.ok && bound.mutation.kind === 'SET' && bound.mutation.propertyConceptId) {
            selector.propertyFilter = {
              propertyConceptId: bound.mutation.propertyConceptId,
              value: bound.mutation.value.literal
            };
            continue;
          }
        }

        this.emit({
          severity: 'ERROR',
          code: 'UNSUPPORTED_OPERATION',
          subcode: 'RELATIVE_CLAUSE',
          message:
            'A oração relativa "que tem …" exige uma propriedade e um valor ' +
            '(por exemplo, "que tem borda azul").',
          span: marker.span,
          start: marker.span.start,
          end: marker.span.end,
          layer: 'syntax'
        });
        cursor.index = checkpoint;
        return;
      }

      // "que está dentro da caixa"
      const spatial = this.parseSpatial(cursor);
      if (!spatial) {
        this.emit({
          severity: 'ERROR',
          code: 'UNSUPPORTED_OPERATION',
          subcode: 'RELATIVE_CLAUSE',
          message:
            'A oração relativa "que está …" exige uma relação espacial ' +
            '(por exemplo, "que está dentro da caixa").',
          span: marker.span,
          start: marker.span.start,
          end: marker.span.end,
          layer: 'syntax'
        });
        cursor.index = checkpoint;
        return;
      }

      if (this.hasOperator(cursor.peek(), 'PARTITIVE')) cursor.consume();
      selector.parent = this.parseSelector(cursor, undefined, false);
    }
  }

  private parseReference(
    cursor: SemanticCursor,
    inheritedEntityConceptId?: ConceptId,
    parsePropertyFilter = false,
    allowParent = true
  ): SemanticReference {
    const token = cursor.peek();

    if (this.isPronounToken(token)) {
      const word = token!.rawTokens[0]?.normalized ?? '';
      cursor.consume();

      const entry = token!.candidates.find((c) => c.pos === 'PRONOUN');
      const resolved = this.ctx.discourse.resolvePronoun(
        this.ctx.nodeLookup,
        this.ctx.countMatches,
        entry?.morphology?.gender,
        entry?.morphology?.number
      );

      if (!resolved) {
        throw new ParseError(
          'UNRESOLVED_PRONOUN',
          `Não é possível determinar a que "${word}" se refere: não há antecedente ` +
            'compatível e ainda presente no documento.',
          token!.span
        );
      }
      return resolved;
    }

    return {
      kind: 'SELECTOR',
      selector: this.parseSelector(
        cursor,
        inheritedEntityConceptId,
        true,
        parsePropertyFilter,
        allowParent
      )
    };
  }

  // -------------------------------------------------------------------------
  // Espaciais
  // -------------------------------------------------------------------------

  private parseSpatial(cursor: SemanticCursor): SpatialConcept | null {
    const spatials = candidatesOfKind(cursor.peek(), this.ctx.concepts, 'SPATIAL');
    if (!spatials.length) return null;
    cursor.consume();
    return this.ctx.concepts[spatials[0].conceptId] as SpatialConcept;
  }

  private peekSpatial(cursor: SemanticCursor): SpatialConcept | null {
    const spatials = candidatesOfKind(cursor.peek(), this.ctx.concepts, 'SPATIAL');
    return spatials.length ? (this.ctx.concepts[spatials[0].conceptId] as SpatialConcept) : null;
  }

  private isContainment(conceptId: ConceptId): boolean {
    const concept = this.ctx.concepts[conceptId];
    return concept?.kind === 'SPATIAL' && concept.relation === 'CHILD_OF';
  }

  // -------------------------------------------------------------------------
  // Propriedades e valores
  // -------------------------------------------------------------------------

  /**
   * Cabeça de propriedade. Quando a entidade corrente NÃO aceita a propriedade
   * mas o mesmo token também pode ser um núcleo nominal, a leitura como
   * propriedade é descartada — é a desambiguação por dados do §A4:
   * "com texto X" é propriedade se a entidade aceita conteúdo; caso contrário,
   * é uma entidade TEXT filha.
   */
  private parsePropertyHead(
    cursor: SemanticCursor,
    entityConceptId?: ConceptId
  ): PropertyHead | null {
    const token = cursor.peek();
    if (!token) return null;

    const property = candidatesOfKind(token, this.ctx.concepts, 'PROPERTY')[0];
    if (property) {
      const entity = entityConceptId ? this.ctx.concepts[entityConceptId] : undefined;
      const accepted =
        entity?.kind !== 'ENTITY' ||
        entity.capabilities.acceptedPropertyIds.includes(property.conceptId);

      const couldBeEntity = candidatesOfKind(token, this.ctx.concepts, 'ENTITY').length > 0;

      if (accepted || !couldBeEntity) {
        cursor.consume();
        return {
          kind: 'PROPERTY',
          conceptId: property.conceptId,
          concept: this.ctx.concepts[property.conceptId] as PropertyConcept
        };
      }
      return null;
    }

    const group = candidatesOfKind(token, this.ctx.concepts, 'PROPERTY_GROUP')[0];
    if (group) {
      cursor.consume();
      return {
        kind: 'PROPERTY_GROUP',
        conceptId: group.conceptId,
        concept: this.ctx.concepts[group.conceptId] as PropertyGroupConcept
      };
    }

    return null;
  }

  private propertyAcceptsText(head: PropertyHead): boolean {
    return head.kind === 'PROPERTY'
      ? head.concept.valueCategories.includes('TEXT')
      : Boolean(head.concept.bindingByValueCategory.TEXT);
  }

  private parseValue(
    cursor: SemanticCursor,
    opts: { allowText?: boolean } = {}
  ): AstValue | null {
    const token = cursor.peek();
    if (!token) return null;

    if (token.literal) {
      switch (token.literal.kind) {
        case 'COLOR':
          cursor.consume();
          return { category: 'COLOR', literal: token.literal.value };
        case 'SIZE':
          cursor.consume();
          return { category: 'SIZE', literal: `${token.literal.value}${token.literal.unit}` };
        case 'NUMBER':
          cursor.consume();
          return { category: 'NUMBER', literal: token.literal.value };
        case 'TEXT':
          if (!opts.allowText) return null;
          cursor.consume();
          return { category: 'TEXT', literal: token.literal.value, text: token.literal.value };
      }
    }

    const values = candidatesOfKind(token, this.ctx.concepts, 'VALUE').filter((c) => {
      const concept = this.ctx.concepts[c.conceptId] as ValueConcept;
      return concept.valueCategory !== 'ORDINAL' && concept.valueCategory !== 'CARDINAL';
    });
    if (!values.length) return null;

    const top = values[0];
    const tied = values.filter((c) => Math.abs(c.score - top.score) < 0.02);
    if (tied.length > 1 && new Set(tied.map((c) => c.conceptId)).size > 1) {
      this.emit({
        severity: 'ERROR',
        code: 'AMBIGUOUS_SENSE',
        message:
          `"${token.rawTokens.map((t) => t.raw).join(' ')}" pode significar ` +
          `${tied.map((c) => c.conceptId).join(' ou ')}; não há evidência para escolher.`,
        span: token.span,
        start: token.span.start,
        end: token.span.end,
        layer: 'syntax',
        candidates: tied.map((c) => c.conceptId),
        scores: tied.map((c) => c.score)
      });
    }

    const chosen = this.ctx.concepts[top.conceptId] as ValueConcept;
    cursor.consume();
    return {
      category: chosen.valueCategory,
      literal: chosen.literal,
      valueConceptId: chosen.id
    };
  }

  /** "com texto X" / "com o texto X" / "escrito X" / "que diz X". */
  private parseTextContentMutation(
    cursor: SemanticCursor,
    entityConceptId?: ConceptId
  ): AstPropertyMutation | null {
    const token = cursor.peek();
    if (!token || !entityConceptId) return null;

    const entity = this.ctx.concepts[entityConceptId];
    if (entity?.kind !== 'ENTITY') return null;

    const contentCandidate = token.candidates.find((c) => {
      const concept = this.ctx.concepts[c.conceptId];
      return (
        concept?.kind === 'PROPERTY' &&
        concept.valueCategories.includes('TEXT') &&
        entity.capabilities.acceptedPropertyIds.includes(concept.id)
      );
    });
    if (!contentCandidate) return null;

    const checkpoint = cursor.index;
    cursor.consume();
    if (this.hasOperator(cursor.peek(), 'PARTITIVE')) cursor.consume();

    const literal = cursor.peek()?.literal;
    if (literal?.kind !== 'TEXT') {
      cursor.index = checkpoint;
      return null;
    }
    cursor.consume();

    return {
      kind: 'SET',
      propertyConceptId: contentCandidate.conceptId,
      value: { category: 'TEXT', literal: String(literal.value), text: String(literal.value) },
      span: token.span
    };
  }

  /** Consome zero ou mais mutações da entidade corrente. */
  private parseMutations(
    cursor: SemanticCursor,
    entityConceptId?: ConceptId
  ): AstPropertyMutation[] {
    const out: AstPropertyMutation[] = [];

    while (!cursor.eof()) {
      const before = cursor.index;

      // Conectores que apenas ligam a mutação ao alvo: "para azul", "com fundo".
      if (
        this.hasOperator(cursor.peek(), 'ALLATIVE') ||
        this.hasOperator(cursor.peek(), 'COMITATIVE') ||
        this.hasOperator(cursor.peek(), 'PARTITIVE')
      ) {
        const checkpoint = cursor.index;
        cursor.consume();
        const batch = this.parseMutations(cursor, entityConceptId);
        if (batch.length) {
          out.push(...batch);
          continue;
        }
        const value = this.parseValue(cursor, { allowText: true });
        if (value) {
          out.push(this.bindValueOnly(value, entityConceptId, cursor.previousSpan()));
          continue;
        }
        cursor.index = checkpoint;
        break;
      }

      if (this.hasOperator(cursor.peek(), 'COORDINATION')) {
        const checkpoint = cursor.index;
        cursor.consume();
        const batch = this.parseMutations(cursor, entityConceptId);
        if (batch.length) {
          out.push(...batch);
          continue;
        }
        if (this.hasOperator(cursor.peek(), 'ALLATIVE')) {
          cursor.consume();
          const value = this.parseValue(cursor, { allowText: true });
          if (value) {
            out.push(this.bindValueOnly(value, entityConceptId, cursor.previousSpan()));
            continue;
          }
        }
        cursor.index = checkpoint;
        break;
      }

      const content = this.parseTextContentMutation(cursor, entityConceptId);
      if (content) {
        out.push(content);
        continue;
      }

      const batch = this.parseOneMutation(cursor, entityConceptId);
      if (batch.length) {
        out.push(...batch);
        continue;
      }

      if (before === cursor.index) break;
    }

    return out;
  }

  /** Uma propriedade com valor, possivelmente encadeando grupos. */
  private parseOneMutation(
    cursor: SemanticCursor,
    entityConceptId?: ConceptId
  ): AstPropertyMutation[] {
    const initialIndex = cursor.index;

    if (this.hasOperator(cursor.peek(), 'WITHOUT')) {
      const span = cursor.peek()!.span;
      cursor.consume();
      const property = this.parsePropertyHead(cursor, entityConceptId);
      if (!property) {
        cursor.index = initialIndex;
        return [];
      }
      if (property.kind === 'PROPERTY' && entityConceptId) {
        const entity = this.ctx.concepts[entityConceptId];
        if (
          entity?.kind === 'ENTITY' &&
          !entity.capabilities.acceptedPropertyIds.includes(property.conceptId)
        ) {
          cursor.index = initialIndex;
          return [];
        }
      }
      return [
        property.kind === 'PROPERTY'
          ? { kind: 'CLEAR', propertyConceptId: property.conceptId, span }
          : { kind: 'CLEAR', propertyGroupId: property.conceptId, span }
      ];
    }

    const explicitProperty = this.parsePropertyHead(cursor, entityConceptId);
    if (explicitProperty) {
      const valueSpan = cursor.spanFrom(initialIndex);
      this.skipValueConnector(cursor);
      const value = this.parseValue(cursor, {
        allowText: this.propertyAcceptsText(explicitProperty)
      });
      if (!value) {
        cursor.index = initialIndex;
        return [];
      }
      const first = this.bindOrThrow(explicitProperty, value, entityConceptId, valueSpan);
      const chain = this.parsePropertyChain(cursor, explicitProperty, entityConceptId);
      return [first, ...chain];
    }

    const value = this.parseValue(cursor);
    if (value) {
      return [this.bindValueOnly(value, entityConceptId, cursor.previousSpan())];
    }

    cursor.index = initialIndex;
    return [];
  }

  /**
   * `PROPERTY_GROUP valor (de|com)? valor …` — resolve cada valor adicional
   * pelo mesmo grupo ("borda azul de 3px" → borderColor + borderWidth).
   */
  private parsePropertyChain(
    cursor: SemanticCursor,
    head: PropertyHead,
    entityConceptId?: ConceptId
  ): AstPropertyMutation[] {
    const out: AstPropertyMutation[] = [];
    if (head.kind !== 'PROPERTY_GROUP') return out;

    for (;;) {
      const checkpoint = cursor.index;
      const hadConnector =
        this.hasOperator(cursor.peek(), 'PARTITIVE') ||
        this.hasOperator(cursor.peek(), 'COMITATIVE');
      if (!hadConnector) break;
      cursor.consume();

      const nextValue = this.parseValue(cursor);
      if (!nextValue) {
        cursor.index = checkpoint;
        break;
      }

      const bound = this.binder.bind(
        entityConceptId,
        { kind: 'SET', propertyGroupId: head.conceptId, value: nextValue },
        cursor.previousSpan()
      );

      if (!bound.ok) {
        cursor.index = checkpoint;
        break;
      }

      out.push(bound.mutation);
    }

    return out;
  }

  /** Mutação ainda não resolvida a partir de uma cabeça de propriedade. */
  private propertyMutation(
    head: PropertyHead,
    value: AstValue,
    span?: Span
  ): AstPropertyMutation {
    return head.kind === 'PROPERTY'
      ? { kind: 'SET', propertyConceptId: head.conceptId, value, span }
      : { kind: 'SET', propertyGroupId: head.conceptId, value, span };
  }

  private bindOrThrow(
    head: PropertyHead,
    value: AstValue,
    entityConceptId: ConceptId | undefined,
    span?: Span
  ): AstPropertyMutation {
    const unresolved = this.propertyMutation(head, value, span);
    const result = this.binder.bind(entityConceptId, unresolved, span);
    if (!result.ok) {
      this.emit(result.diagnostic);
      throw new ParseError(result.diagnostic.code, result.diagnostic.message, span);
    }
    return result.mutation;
  }

  private bindValueOnly(
    value: AstValue,
    entityConceptId: ConceptId | undefined,
    span?: Span
  ): AstPropertyMutation {
    const result = this.binder.bind(entityConceptId, { kind: 'SET', value, span }, span);
    if (!result.ok) {
      this.emit(result.diagnostic);
      throw new ParseError(result.diagnostic.code, result.diagnostic.message, span);
    }
    return result.mutation;
  }
}
