import type { ConceptId, TempNodeId } from '../types';
import type { ConceptNode } from '../ontology/Concept';
import type { DocumentModel } from '../document/DocumentModel';
import { ReferenceResolver } from '../document/ReferenceResolver';
import { PropertyBinder } from '../parser/PropertyBinder';
import type {
  SemanticReference,
  SemanticDocumentAst,
  CreateCommandAst,
  UpdateCommandAst,
  DeleteCommandAst,
  MoveCommandAst,
  QueryCommandAst,
  NewEntityAst,
  AstPropertyMutation
} from '../ast/ast';
import type { ExecutionPlan, ExecutableReference } from './ExecutionPlan';
import type { Diagnostic } from '../diagnostics';
import { diagnostic } from '../diagnostics';
import type { EngineSettings } from '../EngineSettings';
import type { DiscourseContext, NodeLookup, Liveness } from '../parser/DiscourseContext';

/**
 * Converte a SemanticAST em um plano de execução explícito e determinístico,
 * com IDs determinísticos dentro de cada compilação e spans herdados da AST.
 */
export class ExecutionPlanner {
  private stepCounter = 0;

  constructor(
    private concepts: Record<ConceptId, ConceptNode>,
    private document: DocumentModel,
    private settings?: EngineSettings,
    private discourse?: DiscourseContext,
    private nodeLookup?: NodeLookup,
    private liveness?: Liveness,
    private layerForReference = 'planner'
  ) {}

  private stepId(): string {
    this.stepCounter++;
    return `step_${this.stepCounter}`;
  }

  build(ast: SemanticDocumentAst): ExecutionPlan {
    const plan: ExecutionPlan = { steps: [], diagnostics: [] };
    const resolver = new ReferenceResolver(this.document);

    for (const command of ast.commands) {
      switch (command.kind) {
        case 'NO_OP':
          plan.diagnostics.push(
            diagnostic('planner', 'INFO', 'NEGATED_ACTION',
              'A ação pedida foi explicitamente negada; nada foi executado.',
              command.span, { subcode: command.negatedOperation })
          );
          break;
        case 'CREATE':
          this.planCreate(command, plan, resolver);
          break;
        case 'UPDATE':
          this.planUpdate(command, plan, resolver);
          break;
        case 'DELETE':
          this.planDelete(command, plan, resolver);
          break;
        case 'MOVE':
          this.planMove(command, plan, resolver);
          break;
        case 'QUERY':
          this.planQuery(command, plan, resolver);
          break;
      }
    }

    return plan;
  }

  // ---- CREATE -------------------------------------------------------------

  private expandEntities(entities: NewEntityAst[]): {
    copies: NewEntityAst[];
    groupMap: Map<TempNodeId, TempNodeId[]>;
  } {
    const copies: NewEntityAst[] = [];
    const groupMap = new Map<TempNodeId, TempNodeId[]>();

    for (const entity of entities) {
      const quantity = Math.max(1, entity.quantity);
      const ids: TempNodeId[] = [];
      for (let i = 0; i < quantity; i++) {
        const tempId = quantity === 1 ? entity.tempId : `${entity.tempId}_${i + 1}`;
        ids.push(tempId);
        copies.push({
          ...entity,
          tempId,
          quantity: 1,
          mutations: entity.mutations.map((mutation) => ({ ...mutation }))
        });
      }
      groupMap.set(entity.tempId, ids);
    }

    return { copies, groupMap };
  }

  private planCreate(
    command: CreateCommandAst,
    plan: ExecutionPlan,
    resolver: ReferenceResolver
  ): void {
    const { copies, groupMap } = this.expandEntities(command.entities);

    const originalTempIds = new Map<TempNodeId, TempNodeId>();
    for (const [original, ids] of groupMap) {
      for (const id of ids) originalTempIds.set(id, original);
    }

    for (const entity of copies) {
      plan.steps.push({
        kind: 'CREATE_NODE',
        stepId: this.stepId(),
        tempId: entity.tempId,
        sourceTempId: originalTempIds.get(entity.tempId) ?? entity.tempId,
        entityConceptId: entity.entityConceptId,
        text: entity.text,
        span: entity.span
      });

      this.emitMutations(
        { kind: 'TEMP', tempId: entity.tempId },
        entity.entityConceptId,
        entity.mutations,
        plan
      );
    }

    for (const placement of command.placements) {
      const sources = this.expandReference(placement.source, groupMap, resolver, plan);
      const targets = this.expandReference(placement.target, groupMap, resolver, plan);

      if (!targets.length) {
        if (!this.hasAmbiguity(plan)) {
          plan.diagnostics.push(
            diagnostic('planner', 'ERROR', 'TARGET_NOT_FOUND',
              'O alvo do posicionamento não foi encontrado no documento.', placement.span)
          );
        }
        continue;
      }

      if (!sources.length) {
        if (!this.hasAmbiguity(plan)) {
          plan.diagnostics.push(
            diagnostic('planner', 'ERROR', 'TARGET_NOT_FOUND',
              'A origem do posicionamento não foi encontrada.', placement.span)
          );
        }
        continue;
      }

      const target = targets[0];
      for (const source of sources) {
        plan.steps.push({
          kind: 'PLACE_NODE',
          stepId: this.stepId(),
          source,
          relationConceptId: placement.relationConceptId,
          target,
          span: placement.span
        });
      }
    }
  }

  private emitMutations(
    target: ExecutableReference,
    entityConceptId: ConceptId,
    mutations: AstPropertyMutation[],
    plan: ExecutionPlan
  ): void {
    const binder = new PropertyBinder(this.concepts);

    for (const original of mutations) {
      const result = binder.bind(entityConceptId, original, original.span);
      if (!result.ok) {
        plan.diagnostics.push(result.diagnostic);
        continue;
      }
      const mutation = result.mutation;

      if (mutation.kind === 'SET') {
        plan.steps.push({
          kind: 'SET_PROPERTY',
          stepId: this.stepId(),
          target,
          propertyConceptId: mutation.propertyConceptId!,
          value: mutation.value.literal,
          span: mutation.span
        });
        continue;
      }

      if (mutation.propertyConceptId) {
        plan.steps.push({
          kind: 'CLEAR_PROPERTY',
          stepId: this.stepId(),
          target,
          propertyConceptId: mutation.propertyConceptId,
          span: mutation.span
        });
        continue;
      }

      if (mutation.propertyGroupId) {
        const group = this.concepts[mutation.propertyGroupId];
        if (group?.kind !== 'PROPERTY_GROUP') continue;
        for (const propertyId of group.clearPropertyIds) {
          plan.steps.push({
            kind: 'CLEAR_PROPERTY',
            stepId: this.stepId(),
            target,
            propertyConceptId: propertyId,
            span: mutation.span
          });
        }
      }
    }
  }

  // ---- UPDATE -------------------------------------------------------------

  private planUpdate(
    command: UpdateCommandAst,
    plan: ExecutionPlan,
    resolver: ReferenceResolver
  ): void {
    const nodeIds = resolver.resolve(command.target, this.resolveOptions(plan));

    if (!nodeIds.length) {
      if (!this.hasAmbiguity(plan)) {
        plan.diagnostics.push(
          diagnostic('planner', 'ERROR', 'TARGET_NOT_FOUND',
            'O alvo da atualização não foi encontrado.', command.span)
        );
      }
      return;
    }

    for (const nodeId of nodeIds) {
      const node = this.document.nodes.get(nodeId);
      if (!node) continue;
      this.emitMutations({ kind: 'NODE', nodeId }, node.entityConceptId, command.mutations, plan);
    }
  }

  // ---- DELETE -------------------------------------------------------------

  private planDelete(
    command: DeleteCommandAst,
    plan: ExecutionPlan,
    resolver: ReferenceResolver
  ): void {
    const nodeIds = resolver.resolve(command.target, this.resolveOptions(plan));

    for (const nodeId of nodeIds) {
      plan.steps.push({
        kind: 'DELETE_NODE',
        stepId: this.stepId(),
        targetNodeId: nodeId,
        span: command.span
      });
    }

    if (!nodeIds.length) {
      if (!this.hasAmbiguity(plan)) {
        plan.diagnostics.push(
          diagnostic('planner', 'ERROR', 'TARGET_NOT_FOUND',
            'O alvo da exclusão não foi encontrado.', command.span)
        );
      }
    }
  }

  // ---- MOVE ---------------------------------------------------------------

  private planMove(
    command: MoveCommandAst,
    plan: ExecutionPlan,
    resolver: ReferenceResolver
  ): void {
    const sourceIds = resolver.resolve(command.target, this.resolveOptions(plan));
    const targetRefs = this.expandReference(
      command.placement.target,
      new Map(),
      resolver,
      plan
    );

    if (!sourceIds.length) {
      if (!this.hasAmbiguity(plan)) {
        plan.diagnostics.push(
          diagnostic('planner', 'ERROR', 'TARGET_NOT_FOUND',
            'O elemento a mover não foi encontrado.', command.span)
        );
      }
      return;
    }

    if (!targetRefs.length) {
      plan.diagnostics.push(
        diagnostic('planner', 'ERROR', 'TARGET_NOT_FOUND',
          'O destino do movimento não foi encontrado.', command.placement.span)
      );
      return;
    }

    for (const sourceNodeId of sourceIds) {
      plan.steps.push({
        kind: 'MOVE_NODE',
        stepId: this.stepId(),
        sourceNodeId,
        relationConceptId: command.placement.relationConceptId,
        target: targetRefs[0],
        span: command.span
      });
    }
  }

  // ---- QUERY --------------------------------------------------------------

  private planQuery(
    command: QueryCommandAst,
    plan: ExecutionPlan,
    resolver: ReferenceResolver
  ): void {
    const ids = resolver.resolve(command.target, this.resolveOptions(plan));
    if (!ids.length) {
      if (!this.hasAmbiguity(plan)) {
        plan.diagnostics.push(
          diagnostic('planner', 'ERROR', 'TARGET_NOT_FOUND',
            'Nenhum elemento corresponde à seleção pedida.', command.span)
        );
      }
      return;
    }
    for (const nodeId of ids) {
      plan.steps.push({
        kind: 'QUERY_NODE',
        stepId: this.stepId(),
        targetNodeId: nodeId,
        span: command.span
      });
    }
  }

  private resolveOptions(plan: ExecutionPlan) {
    return {
      diagnostics: plan.diagnostics,
      settings: this.settings,
      discourse: this.discourse,
      nodeLookup: this.nodeLookup,
      liveness: this.liveness,
      layer: this.layerForReference
    };
  }


  /** A referência deste comando já falhou com AMBIGUOUS_REFERENCE (sem cascata). */
  private hasAmbiguity(plan: ExecutionPlan): boolean {
    return plan.diagnostics.some((d) => d.code === 'AMBIGUOUS_REFERENCE');
  }

  private expandReference(
    reference: SemanticReference,
    groupMap: Map<TempNodeId, TempNodeId[]>,
    resolver: ReferenceResolver,
    plan: ExecutionPlan
  ): ExecutableReference[] {
    if (reference.kind === 'NEW_ENTITY') {
      const ids = groupMap.get(reference.tempId) ?? [reference.tempId];
      return ids.map((tempId) => ({ kind: 'TEMP', tempId }));
    }

    return resolver
      .resolve(reference, this.resolveOptions(plan))
      .map((nodeId) => ({ kind: 'NODE', nodeId }));
  }
}
