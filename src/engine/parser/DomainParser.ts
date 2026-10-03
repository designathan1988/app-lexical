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
import { ClauseCanonicalizer, type CanonicalClause } from '../syntax/ClauseCanonicalizer';
import { tempNodeId, isTempNodeId, tempIdOf } from '../planning/TempNodes';

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

interface Agreement {
  gender?: GrammaticalGender;
  number?: GrammaticalNumber;
}

/** Concordância de coordenação: plural; masculino se houver algum masculino. */
function coordinationAgreement(members: Array<Agreement | undefined>): Agreement {
  const genders = members.map((m) => m?.gender);
  return {
    gender: genders.includes('MASC') ? 'MASC' : genders.every((g) => g === 'FEM') ? 'FEM' : undefined,
    number: 'PLURAL'
  };
}

function agrees(adjective: Agreement, head: Agreement): boolean {
  const free = (x?: string) => !x || x === 'INVARIANT';
  const gender = free(adjective.gender) || free(head.gender) || adjective.gender === head.gender;
  const number = free(adjective.number) || free(head.number) || adjective.number === head.number;
  return gender && number;
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
  private canonicalizer: ClauseCanonicalizer;
  /**
   * Índice, no cursor do comando corrente, onde começam os sintagmas
   * espaciais de CENA (topicalizados/interpostos e devolvidos ao fim da
   * oração pelo canonicalizador). `null` quando não houve deslocamento.
   */
  private sceneStart: number | null = null;
  /** Reordenações feitas pelo canonicalizador, por comando (trace). */
  canonicalization: Array<{ commandIndex: number; moved: CanonicalClause['moved'] }> = [];
  /**
   * Perfis de concordância aceitos para um adjetivo nu no ponto atual
   * (núcleo próprio e, em coordenação, o plural da coordenação). `null` =
   * sem verificação (o chamador já resolveu a concordância).
   */
  private agreementContext: Agreement[] | null = null;
  /** Concordância do núcleo da última referência analisada. */
  private lastReferenceAgreement: Agreement | undefined;
  /** Tipo de cada entidade criada na frase (pronome que a retoma: "pinte-a"). */
  private tempTypes = new Map<TempNodeId, ConceptId>();
  /** Entidades que um pronome NÃO pode ter como antecedente (Princípio B). */
  private pronounExcludedTemps = new Set<TempNodeId>();

  constructor(ctx: ParserContext) {
    this.ctx = ctx;
    this.binder = new PropertyBinder(ctx.concepts);
    this.canonicalizer = new ClauseCanonicalizer({
      isVerb: (t) => this.isVerbToken(t),
      isSpatialRelation: (t) => {
        const spatial = this.spatialOf(t);
        return Boolean(spatial && !spatial.direction);
      },
      isDirection: (t) => Boolean(this.spatialOf(t)?.direction),
      hasOperator: (t, op) => this.hasOperator(t, op),
      isEntity: (t) => candidatesOfKind(t, this.ctx.concepts, 'ENTITY').length > 0,
      isPronoun: (t) => this.isPronounToken(t),
      isValue: (t) =>
        t?.literal?.kind === 'COLOR' ||
        t?.literal?.kind === 'SIZE' ||
        candidatesOfKind(t, this.ctx.concepts, 'VALUE').some((c) => {
          const concept = this.ctx.concepts[c.conceptId] as ValueConcept;
          return concept.valueCategory !== 'ORDINAL' && concept.valueCategory !== 'CARDINAL';
        }),
      isNumeral: (t) =>
        this.cardinalOf(t) !== null || this.ordinalOf(t) !== null || t?.literal?.kind === 'NUMBER'
    });
  }

  /**
   * Núcleo compartilhado à direita: a partir do cursor (logo após um
   * sintagma sem núcleo), pula coordenadores e determinantes/ordinais/numerais
   * e devolve a primeira entidade encontrada — "a primeira e a terceira caixa".
   */
  private sharedHeadAhead(
    cursor: SemanticCursor
  ): { conceptId: ConceptId; gender?: GrammaticalGender } | null {
    let i = 0;
    let crossedCoordinator = false;
    for (;;) {
      if (this.isCoordinatorAt(cursor, i)) {
        crossedCoordinator = true;
        i++;
        continue;
      }
      const token = cursor.peek(i);
      if (!token) return null;
      const isPrefix =
        this.hasOperator(token, 'DEFINITE_ARTICLE') ||
        this.hasOperator(token, 'INDEFINITE_ARTICLE') ||
        this.ordinalOf(token) !== null ||
        this.cardinalOf(token) !== null;
      if (isPrefix) {
        i++;
        continue;
      }
      if (!crossedCoordinator) return null;
      const entity = candidatesOfKind(token, this.ctx.concepts, 'ENTITY')[0];
      return entity ? { conceptId: entity.conceptId, gender: entity.morphology?.gender } : null;
    }
  }

  /** Tipo de um nó do documento ou de uma entidade criada na frase (`tmp:`). */
  private typeOfNodeId(id: DocumentNodeId): ConceptId | undefined {
    if (isTempNodeId(id)) return this.tempTypes.get(tempIdOf(id));
    return this.ctx.nodeLookup(id)?.entityConceptId;
  }

  /** Remove posicionamentos repetidos (mesma origem, relação e alvo). */
  private uniquePlacements(placements: PlacementAst[]): PlacementAst[] {
    const seen = new Set<string>();
    return placements.filter((p) => {
      const key = JSON.stringify([p.source, p.relationConceptId, p.target]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** Executa `fn` com um contexto de concordância (restaura ao final). */
  private withAgreement<T>(profiles: Agreement[] | null, fn: () => T): T {
    const saved = this.agreementContext;
    this.agreementContext = profiles;
    try {
      return fn();
    } finally {
      this.agreementContext = saved;
    }
  }

  /** Executa `fn` proibindo pronomes de se ligarem às entidades dadas. */
  private withPronounExclusion<T>(tempIds: TempNodeId[], fn: () => T): T {
    const saved = this.pronounExcludedTemps;
    this.pronounExcludedTemps = new Set([...saved, ...tempIds]);
    try {
      return fn();
    } finally {
      this.pronounExcludedTemps = saved;
    }
  }

  private spatialOf(token: SemanticToken | undefined): SpatialConcept | null {
    const spatials = candidatesOfKind(token, this.ctx.concepts, 'SPATIAL');
    return spatials.length ? (this.ctx.concepts[spatials[0].conceptId] as SpatialConcept) : null;
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
      const canonical = this.canonicalizer.canonicalize(group);
      if (canonical.moved.length) {
        this.canonicalization.push({ commandIndex: commands.length, moved: canonical.moved });
      }
      this.sceneStart = canonical.sceneStart;
      const cursor = new SemanticCursor(canonical.tokens);
      const diagnosticsBefore = this.diagnostics.length;
      try {
        const produced = this.parseCommand(cursor);
        for (const command of produced) command.clause = groupIndex;
        commands.push(...produced);
        this.reportUnconsumed(cursor, produced[produced.length - 1]);
      } catch (error) {
        // Comando abortado: o resto do grupo não pode sumir em silêncio —
        // salvo quando o próprio comando já emitiu o erro que o explica
        // (B2: um diagnóstico por problema, sem cascata).
        const emittedOwnError = this.diagnostics
          .slice(diagnosticsBefore)
          .some((d) => d.severity === 'ERROR');
        if (!emittedOwnError) this.reportLeftovers(cursor);
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

      // "e" ou vírgula seguidos de verbo (ou de negação + verbo) iniciam um
      // novo comando coordenado: "crie uma caixa, crie um botão".
      if (this.hasOperator(token, 'COORDINATION') || this.isCommaToken(token)) {
        const next = tokens[i + 1];
        const afterNext = tokens[i + 2];
        const startsCommand =
          this.isVerbToken(next) ||
          (this.hasOperator(next, 'NEGATION') && this.isVerbToken(afterNext));
        // A vírgula só separa comandos se o trecho anterior já tem verbo;
        // antes disso ela fecha um constituinte topicalizado
        // ("dentro da caixa, crie um botão").
        const closesClause =
          this.hasOperator(token, 'COORDINATION') || current.some((t) => this.isVerbToken(t));

        if (startsCommand && closesClause) {
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
    // NO_OP: ação negada já cobre o grupo inteiro com o INFO; palavra
    // desconhecida já foi reportada como UNKNOWN_WORD (B1). Nada a acrescentar.
    if (command.kind === 'NO_OP') return;
    this.reportLeftovers(cursor);
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

  /**
   * Um grupo de tokens (já canonicalizado) produz UM OU MAIS comandos: a
   * coordenação de argumentos ("apague a caixa e o botão") expande o verbo
   * sobre cada objeto, com o mesmo predicado, numa única transação.
   */
  private parseCommand(cursor: SemanticCursor): SemanticCommand[] {
    const startSpan = cursor.peek()?.span;

    // G7 — Pedido indireto: "[eu] quero …", "[você] pode/poderia …",
    // "gostaria de …", "por favor". O wrapper é gramatical: o comando interno
    // é o comando de verdade, e a cortesia fica registrada.
    const polite = this.consumePoliteWrapper(cursor);

    const negated = this.consumeOperator(cursor, 'NEGATION');
    const action = this.consumeAction(cursor);

    // 3.G Tempo e modo: é ordem o imperativo e o infinitivo (este nos
    // pedidos indiretos e nas ordens impessoais). Indicativo ("crio",
    // "criou") e demais tempos são relato, não comando — a leitura de
    // imperativo de formas como "cria" vem do paradigma, não de exceção.
    if (action) {
      const verbToken = cursor.tokens[cursor.index - 1];
      const acceptable = verbToken?.candidates.some((c) => {
        const mood = c.morphology?.mood;
        return mood === 'IMPERATIVE' || mood === 'INFINITIVE' || mood === undefined;
      });
      if (verbToken && verbToken.candidates.length && !acceptable) {
        this.emit({
          severity: 'ERROR',
          code: 'UNSUPPORTED_OPERATION',
          subcode: 'NOT_A_COMMAND',
          message:
            `"${verbToken.rawTokens.map((t) => t.raw).join(' ')}" não é um comando ` +
            '(tempo do relato); use o imperativo.',
          span: verbToken.span,
          start: verbToken.span.start,
          end: verbToken.span.end,
          layer: 'syntax'
        });
        // A oração inteira é o relato recusado: seus tokens são cobertos por
        // esta recusa (invariante de consumo), sem diagnósticos em cascata.
        cursor.consumeRest();
        throw new ParseError(
          'UNSUPPORTED_OPERATION',
          `"${verbToken.rawTokens.map((t) => t.raw).join(' ')}" não é um comando; use o imperativo.`,
          verbToken.span
        );
      }
    }

    if (polite && !action) {
      // "quero um botão vermelho": desejo + sintagma nominal = CREATE.
      const inner = this.parseCreate(cursor, startSpan);
      inner.politeness = true;
      this.consumeTrailingPoliteness(cursor);
      return [inner];
    }

    if (negated) {
      // A ação negada é ignorada por inteiro; o span do comando cobre todo o
      // grupo para que nenhum token fique silenciosamente sem tratamento.
      const last = cursor.tokens[cursor.tokens.length - 1];
      const span = {
        start: startSpan?.start ?? 0,
        end: last?.span.end ?? startSpan?.end ?? 0
      };
      return [
        {
          kind: 'NO_OP',
          reason: 'NEGATED_ACTION',
          negatedOperation: action?.operation,
          span: cursor.fullSpan() ?? span
        }
      ];
    }

    if (!action) return [this.parseImplicitCommand(cursor)];

    let commands: SemanticCommand[];
    switch (action.operation) {
      case 'CREATE':
        commands = [this.parseCreate(cursor, startSpan)];
        break;
      case 'UPDATE':
        commands = this.parseUpdate(cursor, startSpan);
        break;
      case 'DELETE':
        commands = this.parseDelete(cursor, startSpan);
        break;
      case 'MOVE':
        commands = this.parseMove(cursor, startSpan);
        break;
      case 'QUERY':
        commands = this.parseQuery(cursor, startSpan);
        break;
    }
    if (polite) for (const command of commands) command.politeness = true;
    this.consumeTrailingPoliteness(cursor);
    return commands;
  }

  /**
   * Wrapper de pedido indireto (dados): [sujeito] + verbo de cortesia +
   * opcional "de". Consome o wrapper e devolve `true`; senão não move o cursor.
   */
  private consumePoliteWrapper(cursor: SemanticCursor): boolean {
    const checkpoint = cursor.index;
    let consumed = false;

    // Sujeito pronominal opcional: "eu gostaria", "você pode".
    if (this.hasOperator(cursor.peek(), 'SUBJECT_PRONOUN')) {
      cursor.consume();
      consumed = true;
    }

    if (
      !this.hasOperator(cursor.peek(), 'POLITE_REQUEST') &&
      !this.hasOperator(cursor.peek(), 'POLITE_DESIRE')
    ) {
      cursor.index = checkpoint;
      return false;
    }

    const desire = this.hasOperator(cursor.peek(), 'POLITE_DESIRE');
    cursor.consume();
    consumed = true;

    // "por favor, crie…": a vírgula depois da cortesia inicial é dela.
    if (this.isCommaToken(cursor.peek())) cursor.consume();

    // "gostaria de apagar…" (infinitivo) ou "gostaria de uma caixa" (SN): o
    // "de" do complemento pertence ao wrapper.
    if (this.hasOperator(cursor.peek(), 'PARTITIVE')) {
      const after = cursor.peek(1);
      const afterIsAction = candidatesOfKind(after, this.ctx.concepts, 'ACTION').length > 0;
      // "gostaria de apagar…" (infinitivo) ou "gostaria de uma caixa" (SN).
      const afterIsNominal = desire && this.startsReference(after) && !this.hasOperator(after, 'PARTITIVE');
      if (afterIsAction || afterIsNominal) cursor.consume();
    }

    return consumed;
  }

  /** "por favor" no fim da frase apenas marca cortesia (vírgula opcional). */
  private consumeTrailingPoliteness(cursor: SemanticCursor): void {
    for (;;) {
      const token = cursor.peek();
      if (!token) return;
      if (this.hasOperator(token, 'POLITE_REQUEST')) {
        cursor.consume();
        continue;
      }
      const isPunct = token.rawTokens.every((rt) => rt.type === 'PUNCT');
      const next = cursor.peek(1);
      if (isPunct && next && this.hasOperator(next, 'POLITE_REQUEST')) {
        cursor.consume();
        continue;
      }
      return;
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
      // O NO_OP de comando desconhecido assume a oração inteira: o erro
      // aponta só a palavra, mas nenhum token do grupo fica sem dono.
      cursor.consumeRest();
      return { kind: 'NO_OP', reason: 'UNKNOWN_COMMAND', span: cursor.fullSpan() ?? span };
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
    /** Núcleos coordenados no nível superior ("uma caixa e um botão"). */
    const coordinated: NewEntityAst[] = [first];

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

          // "com um botão dentro": o "dentro" sem alvo próprio só confirma o
          // containment; com alvo ("dentro dela") é tratado pelo laço como
          // relação explícita — e o posicionamento repetido é unificado.
          const trailing = this.peekSpatial(cursor);
          const trailingTarget = cursor.peek(1);
          if (
            trailing &&
            this.isContainment(trailing.id) &&
            (!trailingTarget || this.isCommaToken(trailingTarget) || this.isCoordinatorAt(cursor, 1))
          ) {
            cursor.consume();
          }

          if (this.distributeAdjacentMutation(cursor, entities, 'SUBORDINATED')) continue;
          continue;
        }

        cursor.index = checkpoint;
        break;
      }

      if (this.isCoordinatorAt(cursor)) {
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
          coordinated.push(sibling);
          current = sibling;
          if (this.distributeAdjacentMutation(cursor, entities)) continue;
          continue;
        }

        cursor.index = checkpoint;
        break;
      }

      const inScene = this.sceneStart !== null && cursor.index >= this.sceneStart;
      const spatial = this.parseSpatial(cursor);
      if (spatial) {
        if (inScene) {
          // Locativo de cena (topicalizado/interposto): vale para todas as
          // entidades criadas no nível superior da oração, não só a última.
          const roots = entities.filter(
            (e) => !placements.some((p) => p.source.kind === 'NEW_ENTITY' && p.source.tempId === e.tempId)
          );
          const before = placements.length;
          const anchor = roots[0] ?? current;
          const next = this.withPronounExclusion(
            roots.map((root) => root.tempId),
            () => this.parseSpatialTarget(cursor, anchor, spatial, entities, placements)
          );
          if (!next) break;
          const added = placements.slice(before).filter(
            (p) => p.source.kind === 'NEW_ENTITY' && p.source.tempId === anchor.tempId
          );
          // Ordem mencionada preservada: com relações que inserem logo depois
          // do alvo, cada entidade vai depois da anterior.
          roots.slice(1).forEach((root, i) => {
            for (const p of added) {
              placements.push({
                ...p,
                source: { kind: 'NEW_ENTITY', tempId: root.tempId },
                target: this.insertsAfterTarget(p.relationConceptId)
                  ? { kind: 'NEW_ENTITY', tempId: roots[i].tempId }
                  : p.target
              });
            }
          });
          continue;
        }
        const next = this.withPronounExclusion([current.tempId], () =>
          this.parseSpatialTarget(cursor, current, spatial, entities, placements)
        );
        if (!next) break;
        current = next;
        continue;
      }

      // Mutação nua da entidade corrente: "um botão azul", "um botão sem borda".
      if (this.pushMutation(cursor, current)) continue;

      break;
    }

    // A coordenação é um referente plural para o discurso: "crie uma caixa e
    // um botão" → "pinte-os" retoma os dois (gênero da coordenação).
    if (coordinated.length > 1) {
      const types = new Set(coordinated.map((e) => e.entityConceptId));
      const agreement = coordinationAgreement(coordinated.map((e) => this.entityAgreement.get(e.tempId)));
      this.ctx.discourse.stage({
        reference: { kind: 'NODE_SET', nodeIds: coordinated.map((e) => tempNodeId(e.tempId)) },
        entityConceptId: types.size === 1 ? coordinated[0].entityConceptId : undefined,
        gender: agreement.gender,
        number: 'PLURAL'
      });
    }

    return { kind: 'CREATE', entities, placements: this.uniquePlacements(placements), span: startSpan };
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
    // Atributo nu da entidade criada: concorda com o núcleo dela.
    const agreement = this.entityAgreement.get(entity.tempId);
    const mutations = this.withAgreement(agreement ? [agreement] : null, () =>
      this.parseMutations(cursor, entity.entityConceptId)
    );
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
    // "caixa com um botão dentro [e …]": sem alvo próprio (fim, vírgula ou
    // coordenação), o espacial de contenção apenas CONFIRMA o containment já
    // estabelecido por "com".
    const noTarget = !token || this.isCommaToken(token) || this.isCoordinatorAt(cursor);
    if (noTarget && this.isContainment(spatial.id)) {
      return current;
    }
    if (!token) {
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

    // O alvo de um posicionamento aceita filtros de propriedade ("da caixa
    // preta"): sem isso, o adjetivo vazaria como mutação da entidade corrente.
    const reference = this.parseReference(cursor, undefined, true, false);
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
   *
   * Objetos coordenados ("a caixa e o botão") produzem um comando por objeto;
   * o predicado é re-analisado para o tipo de cada um.
   */
  private parseUpdate(cursor: SemanticCursor, startSpan?: Span): UpdateCommandAst[] {
    const start = cursor.index;
    const diagnosticsBefore = this.diagnostics.length;

    const propertyAttempt = this.tryPropertyFirst(cursor, start, startSpan);
    if (propertyAttempt.commands) return propertyAttempt.commands;

    const valueAttempt = this.tryValueFirst(cursor, start, startSpan);
    if (valueAttempt.commands) return valueAttempt.commands;

    const targetAttempt = this.tryTargetFirst(cursor, start, startSpan);
    if (targetAttempt.commands) return targetAttempt.commands;

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
  ): { commands?: UpdateCommandAst[]; failure?: Diagnostic } {
    const diagnosticsBefore = this.diagnostics.length;
    cursor.index = start;

    this.parseNominalPrefix(cursor);
    const headToken = cursor.peek();
    const propHead = this.parsePropertyHead(cursor);
    if (!propHead) {
      cursor.index = start;
      return {};
    }

    if (this.hasOperator(cursor.peek(), 'PARTITIVE')) {
      cursor.consume();
      // Leitura especulativa: se "de X" não for um possuidor ("o texto de
      // verde"), a leitura desiste sem erro e cede às outras.
      let first: SemanticReference;
      try {
        first = this.parseReference(cursor);
      } catch {
        this.diagnostics.length = diagnosticsBefore;
        cursor.index = start;
        return {};
      }
      // Possuidor exige núcleo explícito (nome ou pronome): "de verde" sem
      // núcleo é predicado ("pinte o texto de verde"), não elipse de possuidor.
      if (first.kind === 'SELECTOR' && first.selector.elidedFrom) {
        this.diagnostics.length = diagnosticsBefore;
        cursor.index = start;
        return {};
      }
      // "a cor de fundo da caixa E DO botão": possuidores coordenados.
      const targets = this.expandMixedSets(
        this.parseCoordinatedReferences(cursor, first, () => this.parseReference(cursor), true)
      );
      this.skipValueConnector(cursor);
      // B3 — o span do valor é do VALOR (não do comando inteiro).
      const valueStart = cursor.index;
      const value = this.parseValue(cursor, { allowText: this.propertyAcceptsText(propHead) });
      const valueSpan = cursor.spanFrom(valueStart);
      if (!value) {
        this.diagnostics.length = diagnosticsBefore;
        cursor.index = start;
        return {};
      }

      const afterValue = cursor.index;
      let end = afterValue;
      const commands: UpdateCommandAst[] = [];
      for (const target of targets) {
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
        cursor.index = afterValue;
        const chain = this.parsePropertyChain(cursor, propHead, entityConceptId);
        end = Math.max(end, cursor.index);
        commands.push({ kind: 'UPDATE', target, mutations: [bound.mutation, ...chain], span: startSpan });
      }
      cursor.index = end;
      return { commands };
    }

    // "deixe o texto azul": quando o núcleo também é uma ENTIDADE ("texto"),
    // a leitura de alvo ("o texto") tem prioridade sobre a de grupo de
    // propriedades sem possuidor — a leitura de grupo fica para o caminho
    // "texto do botão". Sem entidade alternativa, o grupo segue valendo
    // ("deixe a borda azul").
    if (candidatesOfKind(headToken, this.ctx.concepts, 'ENTITY').length > 0) {
      cursor.index = start;
      return {};
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
      commands: [
        {
          kind: 'UPDATE',
          target: { kind: 'CURRENT_SELECTION' },
          mutations: [bound.mutation, ...chain],
          span: startSpan
        }
      ]
    };
  }

  private tryValueFirst(
    cursor: SemanticCursor,
    start: number,
    startSpan?: Span
  ): { commands?: UpdateCommandAst[] } {
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
      return { commands: [{ kind: 'UPDATE', target, mutations: [mutation], span: startSpan }] };
    } catch {
      this.diagnostics.length = diagnosticsBefore;
      cursor.index = start;
      return {};
    }
  }

  /**
   * Alvo primeiro, com coordenação: cada conjunto pode ter predicado próprio
   * ("deixe o botão azul e o texto vermelho"); conjuntos sem predicado herdam
   * o do conjunto seguinte ("deixe a caixa e o botão vermelhos"). O predicado
   * é re-analisado para o tipo de cada alvo, porque o binding depende dele.
   */
  private tryTargetFirst(
    cursor: SemanticCursor,
    start: number,
    startSpan?: Span
  ): { commands?: UpdateCommandAst[]; failure?: Diagnostic } {
    const diagnosticsBefore = this.diagnostics.length;
    cursor.index = start;

    interface Conjunct {
      parts: SemanticReference[];
      first: AstPropertyMutation[];
      predicate: { start: number; end: number } | null;
    }

    try {
      const conjuncts: Conjunct[] = [];
      const agreements: Array<Agreement | undefined> = [];
      for (;;) {
        const target = this.parseReference(cursor);
        const own = this.lastReferenceAgreement;
        const parts = this.expandMixedSets([target]);
        const predicateStart = cursor.index;
        // Predicativo: concorda com o próprio alvo ou, depois de uma
        // coordenação, com o plural da coordenação ("a caixa e o botão pretos").
        const profiles: Agreement[] = [];
        if (own) profiles.push(own);
        if (conjuncts.length) profiles.push(coordinationAgreement([...agreements, own]));
        agreements.push(own);
        const mutations = this.withAgreement(profiles.length ? profiles : null, () =>
          this.parseMutations(cursor, this.entityConceptOf(parts[0]))
        );
        const predicateEnd = cursor.index;

        if (target.kind === 'SELECTOR' && this.hasOperator(cursor.peek(), 'EXCEPT')) {
          cursor.consume();
          target.selector.exclusions = this.parseExclusions(cursor, target.selector.entityConceptId);
        }

        conjuncts.push({
          parts,
          first: mutations,
          predicate: mutations.length ? { start: predicateStart, end: predicateEnd } : null
        });

        if (this.isCoordinatorAt(cursor) && this.startsReference(cursor.peek(1))) {
          cursor.consume();
          continue;
        }
        break;
      }

      // Predicado compartilhado: herda do conjunto seguinte mais próximo.
      for (let i = conjuncts.length - 2; i >= 0; i--) {
        if (!conjuncts[i].predicate) conjuncts[i].predicate = conjuncts[i + 1].predicate;
      }
      if (conjuncts.some((c) => !c.predicate)) {
        this.diagnostics.length = diagnosticsBefore;
        cursor.index = start;
        return {};
      }

      const end = cursor.index;
      const commands: UpdateCommandAst[] = [];
      for (const conjunct of conjuncts) {
        conjunct.parts.forEach((part, partIndex) => {
          let mutations = partIndex === 0 && conjunct.first.length ? conjunct.first : null;
          if (!mutations) {
            const range = conjunct.predicate!;
            cursor.index = range.start;
            mutations = this.parseMutations(cursor, this.entityConceptOf(part));
          }
          commands.push({ kind: 'UPDATE', target: part, mutations, span: startSpan });
        });
      }
      cursor.index = end;
      return { commands };
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
  // Coordenação de argumentos
  // -------------------------------------------------------------------------

  private isCommaToken(token: SemanticToken | undefined): boolean {
    return Boolean(
      token &&
        token.rawTokens.every((r) => r.type === 'PUNCT') &&
        token.rawTokens.map((r) => r.raw).join('') === ','
    );
  }

  /** O token inicia uma referência/sintagma nominal. */
  private startsReference(token: SemanticToken | undefined): boolean {
    if (!token) return false;
    return (
      this.hasOperator(token, 'DEFINITE_ARTICLE') ||
      this.hasOperator(token, 'INDEFINITE_ARTICLE') ||
      this.hasOperator(token, 'UNIVERSAL_QUANTIFIER') ||
      this.hasOperator(token, 'ALTERNATIVE_DETERMINER') ||
      this.hasOperator(token, 'PARTITIVE') ||
      this.cardinalOf(token) !== null ||
      this.ordinalOf(token) !== null ||
      token.literal?.kind === 'NUMBER' ||
      this.isPronounToken(token) ||
      candidatesOfKind(token, this.ctx.concepts, 'ENTITY').length > 0
    );
  }

  /** Coordenador no cursor: "e", ou vírgula seguida de início de sintagma. */
  private isCoordinatorAt(cursor: SemanticCursor, offset = 0): boolean {
    const token = cursor.peek(offset);
    if (this.hasOperator(token, 'COORDINATION')) return true;
    return this.isCommaToken(token) && this.startsReference(cursor.peek(offset + 1));
  }

  /**
   * Referências coordenadas: "a caixa e o botão", "a caixa, o botão e o
   * texto"; com `possessive`, o "de" repetido do possuidor ("da caixa e do
   * botão") é parte do coordenador.
   */
  private parseCoordinatedReferences(
    cursor: SemanticCursor,
    first: SemanticReference,
    parseNext: () => SemanticReference,
    possessive = false
  ): SemanticReference[] {
    const references = [first];
    while (this.isCoordinatorAt(cursor)) {
      const checkpoint = cursor.index;
      const diagnosticsBefore = this.diagnostics.length;
      cursor.consume();
      if (possessive && this.hasOperator(cursor.peek(), 'PARTITIVE')) cursor.consume();
      if (!this.startsReference(cursor.peek()) || this.hasOperator(cursor.peek(), 'PARTITIVE')) {
        cursor.index = checkpoint;
        break;
      }
      try {
        references.push(parseNext());
      } catch {
        this.diagnostics.length = diagnosticsBefore;
        cursor.index = checkpoint;
        break;
      }
    }
    return references;
  }

  /** Exclusões coordenadas: "menos o primeiro e o terceiro". */
  private parseExclusions(cursor: SemanticCursor, entityConceptId?: ConceptId): SemanticSelector[] {
    const exclusions = [this.parseSelector(cursor, entityConceptId, false)];
    while (this.isCoordinatorAt(cursor) && this.startsReference(cursor.peek(1))) {
      const checkpoint = cursor.index;
      cursor.consume();
      try {
        exclusions.push(this.parseSelector(cursor, entityConceptId, false));
      } catch {
        cursor.index = checkpoint;
        break;
      }
    }
    return exclusions;
  }

  /**
   * Grupo pronominal de tipos mistos ("eles" = uma caixa e um botão) vira um
   * alvo por nó: o binding de uma cor depende do tipo de cada elemento.
   */
  private expandMixedSets(references: SemanticReference[]): SemanticReference[] {
    return references.flatMap((reference): SemanticReference[] => {
      if (reference.kind !== 'NODE_SET') return [reference];
      const types = new Set(reference.nodeIds.map((id) => this.typeOfNodeId(id)));
      if (types.size <= 1) return [reference];
      return reference.nodeIds.map((nodeId) => ({ kind: 'NODE_ID' as const, nodeId }));
    });
  }

  /** Relações que inserem o nó logo DEPOIS do alvo (a ordem mencionada exige encadear). */
  private insertsAfterTarget(relationConceptId: ConceptId): boolean {
    const concept = this.ctx.concepts[relationConceptId];
    return (
      concept?.kind === 'SPATIAL' &&
      (concept.relation === 'AFTER' || concept.relation === 'BESIDE' || concept.relation === 'BELOW')
    );
  }

  // -------------------------------------------------------------------------
  // DELETE / MOVE / QUERY
  // -------------------------------------------------------------------------

  private parseDelete(cursor: SemanticCursor, startSpan?: Span): DeleteCommandAst[] {
    const first = this.parseReference(cursor, undefined, true);
    const targets = this.parseCoordinatedReferences(cursor, first, () =>
      this.parseReference(cursor, undefined, true)
    );
    return targets.map((target) => ({ kind: 'DELETE', target, span: startSpan }));
  }

  private parseMove(cursor: SemanticCursor, startSpan?: Span): MoveCommandAst[] {
    // O sintagma espacial que segue o alvo é o DESTINO, não um filtro de pai.
    const first = this.parseReference(cursor, undefined, true, false);
    const targets = this.parseCoordinatedReferences(cursor, first, () =>
      this.parseReference(cursor, undefined, true, false)
    );
    const last = targets[targets.length - 1];

    if (this.hasOperator(cursor.peek(), 'PARTITIVE')) {
      const checkpoint = cursor.index;
      cursor.consume();
      const spatial = this.parseSpatial(cursor);
      if (spatial && this.isContainment(spatial.id) && last.kind === 'SELECTOR') {
        last.selector.parent = this.parseSelector(cursor);
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

    const destination = this.parseReference(cursor, this.entityConceptOf(first), true);

    // B8 — "dela MESMA": o reforço reflexivo é do pronome, consumido aqui.
    if (this.hasOperator(cursor.peek(), 'REFLEXIVE')) cursor.consume();

    // "mova A e B para depois da caixa": a ordem mencionada é preservada —
    // com relações que inserem logo depois do alvo, B vai depois de A.
    const chain = this.insertsAfterTarget(relation.id);
    return targets.map((target, i) => ({
      kind: 'MOVE',
      target,
      placement: {
        source: target,
        relationConceptId: relation.id,
        target: chain && i > 0 ? targets[i - 1] : destination,
        span: startSpan
      },
      span: startSpan
    }));
  }

  private parseQuery(cursor: SemanticCursor, startSpan?: Span): SemanticCommand[] {
    const first = this.parseReference(cursor, undefined, true);
    const targets = this.parseCoordinatedReferences(cursor, first, () =>
      this.parseReference(cursor, undefined, true)
    );
    return targets.map((target) => ({ kind: 'QUERY', target, span: startSpan }));
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
      case 'NODE_SET': {
        // Grupo pronominal ("eles"): o tipo comum, se houver um só.
        const types = new Set(reference.nodeIds.map((id) => this.typeOfNodeId(id)));
        return types.size === 1 ? [...types][0] : undefined;
      }
      case 'NEW_ENTITY':
        // Entidade criada antes nesta frase ("crie uma caixa e pinte-a").
        return this.tempTypes.get(reference.tempId);
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

    // Plural nu ("crie caixas"): sem determinante nem numeral não há
    // cardinalidade — o motor pergunta em vez de inventar uma quantidade.
    if (prefix.definiteness === 'UNSPECIFIED' && prefix.quantity === null && head.number === 'PLURAL') {
      const span = { start: startSpan?.start ?? head.span.start, end: head.span.end };
      const message =
        'Plural sem quantidade: informe quantos (dois, três, …). O motor não inventa uma cardinalidade.';
      this.emit({
        severity: 'ERROR',
        code: 'UNSUPPORTED_OPERATION',
        subcode: 'BARE_PLURAL',
        message,
        span,
        start: span.start,
        end: span.end,
        layer: 'syntax'
      });
      throw new ParseError('UNSUPPORTED_OPERATION', message, span);
    }

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
    this.tempTypes.set(tempId, entity.entityConceptId);

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
    const startIndex = cursor.index;
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
    } else if (!entityConceptId && this.sharedHeadAhead(cursor)) {
      // "a primeira e a terceira caixa": o núcleo do último conjunto vale
      // para os determinantes coordenados antes dele.
      const shared = this.sharedHeadAhead(cursor)!;
      entityConceptId = shared.conceptId;
      gender = shared.gender;
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

    // "a outra caixa": a instância distinta da menção saliente desse tipo.
    if (prefix.other && entityConceptId) {
      const salient = this.ctx.discourse.salientMentionOfConcept(
        this.ctx.nodeLookup,
        this.ctx.countMatches,
        entityConceptId
      );
      const reference = salient?.reference;
      if (reference?.kind === 'NODE_ID') selector.distinctFrom = { nodeIds: [reference.nodeId] };
      else if (reference?.kind === 'NODE_SET') selector.distinctFrom = { nodeIds: reference.nodeIds };
      else if (reference?.kind === 'SELECTOR') selector.distinctFrom = reference.selector;
    }

    const text = cursor.peek()?.literal;
    if (text?.kind === 'TEXT') {
      selector.textEquals = String(text.value);
      cursor.consume();
    }

    if (parsePropertyFilter && entityConceptId) {
      const valueSpan = cursor.peek()?.span;
      const value = this.withAgreement(head ? [{ gender, number }] : null, () =>
        this.parseValue(cursor, { agreement: true })
      );
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
      selector.directionSpan = cursor.peek()!.span;
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
      selector.exclusions = this.parseExclusions(cursor, entityConceptId);
    }

    if (registerMention && entityConceptId) {
      this.ctx.discourse.stage({
        reference: { kind: 'SELECTOR', selector },
        entityConceptId,
        gender,
        number
      });
    }

    // B3 — O span do seletor cobre o sintagma INTEIRO (determinante ao último
    // modificador): diagnósticos de referência apontam o NP, não só 'o'.
    selector.span = cursor.spanFrom(startIndex) ?? selector.span;
    if (registerMention) this.lastReferenceAgreement = head ? { gender, number } : undefined;

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
      const excluded = this.pronounExcludedTemps;
      const resolved = this.ctx.discourse.resolvePronoun(
        this.ctx.nodeLookup,
        this.ctx.countMatches,
        entry?.morphology?.gender,
        entry?.morphology?.number,
        // Princípio B: o pronome não se liga à entidade sendo posicionada.
        (mention) => !(mention.reference.kind === 'NEW_ENTITY' && excluded.has(mention.reference.tempId))
      );
      this.lastReferenceAgreement = {
        gender: entry?.morphology?.gender,
        number: entry?.morphology?.number
      };

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
      const groupConcept = this.ctx.concepts[group.conceptId] as PropertyGroupConcept;
      const entity = entityConceptId ? this.ctx.concepts[entityConceptId] : undefined;
      // O grupo só serve se a entidade aceita ALGUM de seus membros; caso
      // contrário, o token (que também é entidade, ex.: "texto") vale como
      // núcleo nominal — "crie uma caixa com texto" cria um TEXT filho.
      const accepted =
        entity?.kind !== 'ENTITY' ||
        groupConcept.members.some((member) =>
          entity.capabilities.acceptedPropertyIds.includes(member)
        );
      const couldBeEntity = candidatesOfKind(token, this.ctx.concepts, 'ENTITY').length > 0;

      if (accepted || !couldBeEntity) {
        cursor.consume();
        return {
          kind: 'PROPERTY_GROUP',
          conceptId: group.conceptId,
          concept: groupConcept
        };
      }
      return null;
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
    opts: { allowText?: boolean; agreement?: boolean } = {}
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

    // Concordância nominal (restrição rígida): um adjetivo nu precisa
    // concordar em gênero e número com algum perfil aceito no contexto.
    let pool = values;
    if (opts.agreement && this.agreementContext?.length) {
      const profiles = this.agreementContext;
      const adjectives = values.filter((c) => c.pos === 'ADJECTIVE');
      if (adjectives.length) {
        const agreeing = values.filter(
          (c) =>
            c.pos !== 'ADJECTIVE' ||
            profiles.some((p) =>
              agrees({ gender: c.morphology?.gender, number: c.morphology?.number }, p)
            )
        );
        if (!agreeing.length) {
          const surface = token.rawTokens.map((t) => t.raw).join(' ');
          const message =
            `O adjetivo "${surface}" não concorda em gênero/número com o elemento a que se ` +
            'refere; nada foi executado.';
          this.emit({
            severity: 'ERROR',
            code: 'AGREEMENT_MISMATCH',
            message,
            span: token.span,
            start: token.span.start,
            end: token.span.end,
            layer: 'syntax'
          });
          throw new ParseError('AGREEMENT_MISMATCH', message, token.span);
        }
        pool = agreeing;
      }
    }

    const top = pool[0];
    const tied = pool.filter((c) => Math.abs(c.score - top.score) < 0.02);
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
    // "com o texto «…»": o artigo antes do nome da propriedade é opcional.
    const offset = this.hasOperator(cursor.peek(), 'DEFINITE_ARTICLE') ? 1 : 0;
    const token = cursor.peek(offset);
    if (!token || !entityConceptId) return null;

    const entity = this.ctx.concepts[entityConceptId];
    if (entity?.kind !== 'ENTITY') return null;

    // Propriedade de conteúdo textual aceita pela entidade — diretamente ou
    // via grupo cujo binding para TEXT ela aceita ("texto": cor/conteúdo/fonte).
    let contentPropertyId: ConceptId | undefined;
    for (const c of token.candidates) {
      const concept = this.ctx.concepts[c.conceptId];
      const propertyId =
        concept?.kind === 'PROPERTY' && concept.valueCategories.includes('TEXT')
          ? concept.id
          : concept?.kind === 'PROPERTY_GROUP'
            ? concept.bindingByValueCategory.TEXT
            : undefined;
      if (propertyId && entity.capabilities.acceptedPropertyIds.includes(propertyId)) {
        contentPropertyId = propertyId;
        break;
      }
    }
    if (!contentPropertyId) return null;
    const contentCandidate = { conceptId: contentPropertyId };

    const checkpoint = cursor.index;
    for (let i = 0; i <= offset; i++) cursor.consume();
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
        // Depois de "de/para/com" a cor é complemento nominal ("pinte os
        // botões de verde", "mude para azul"): não há concordância a exigir.
        const batch = this.withAgreement(null, () => this.parseMutations(cursor, entityConceptId));
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

        // B8 — "azul e não vermelho": a negação de um valor significa que
        // ele NÃO é aplicado; o valor positivo que veio antes permanece.
        if (this.hasOperator(cursor.peek(), 'NEGATION')) {
          const negStart = cursor.peek()!.span.start;
          const negCheckpoint = cursor.index;
          cursor.consume();
          const negated = this.parseValue(cursor);
          if (negated) {
            this.emit({
              severity: 'INFO',
              code: 'NO_EFFECT',
              message:
                'Valor negado ("não …") não é aplicado; permanece o valor positivo anterior.',
              span: { start: negStart, end: cursor.previousSpan()?.end ?? negStart },
              start: negStart,
              end: cursor.previousSpan()?.end ?? negStart,
              layer: 'syntax'
            });
            continue;
          }
          cursor.index = negCheckpoint;
        }

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

    // Comparativo ("mais escura"): fora do domínio de valores — recusa
    // explicada com o span do sintagma, nunca UNKNOWN_WORD.
    if (this.hasOperator(cursor.peek(), 'COMPARATIVE')) {
      const marker = cursor.peek()!;
      const end = cursor.peek(1)?.span.end ?? marker.span.end;
      const span = { start: marker.span.start, end };
      this.emit({
        severity: 'ERROR',
        code: 'UNSUPPORTED_OPERATION',
        subcode: 'COMPARATIVE',
        message:
          'Comparativo ("mais/menos <adjetivo>") não é suportado: o motor não ' +
          'calcula gradações — use um valor absoluto ("azul", "escuro" não existe).',
        span,
        start: span.start,
        end: span.end,
        layer: 'syntax'
      });
      throw new ParseError(
        'UNSUPPORTED_OPERATION',
        'Comparativo não é suportado; use um valor absoluto.',
        span
      );
    }

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
      this.skipValueConnector(cursor);
      // O span do valor é do VALOR, não da cabeça da propriedade (B3): o
      // diagnóstico do binder aponta o trecho que originou o problema.
      const valueStart = cursor.index;
      const value = this.parseValue(cursor, {
        allowText: this.propertyAcceptsText(explicitProperty)
      });
      if (!value) {
        cursor.index = initialIndex;
        return [];
      }
      const valueSpan = cursor.spanFrom(valueStart);
      const first = this.bindOrThrow(explicitProperty, value, entityConceptId, valueSpan);
      const chain = this.parsePropertyChain(cursor, explicitProperty, entityConceptId);
      return [first, ...chain];
    }

    const valueStart = cursor.index;
    const value = this.parseValue(cursor, { agreement: true });
    if (value) {
      return [this.bindValueOnly(value, entityConceptId, cursor.spanFrom(valueStart))];
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
