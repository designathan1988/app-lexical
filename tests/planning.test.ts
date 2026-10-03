import { describe, it, expect } from 'vitest';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { planSignature } from '../src/eval/signatures';

function engine(): SemanticEngine {
  return new SemanticEngine(createInitialKnowledgeBase());
}

describe('ExecutionPlanner', () => {
  it('expande quantidade em passos independentes', () => {
    const e = engine();
    e.store.createNode('C_ENT_CONTAINER');
    const plan = e.analyze('crie dois botões dentro da caixa').plan;
    const creates = plan.steps.filter((s) => s.kind === 'CREATE_NODE');
    const places = plan.steps.filter((s) => s.kind === 'PLACE_NODE');
    expect(creates).toHaveLength(2);
    expect(places).toHaveLength(2);
  });

  it('gera plano determinístico', () => {
    const e1 = engine();
    const e2 = engine();
    e1.store.createNode('C_ENT_CONTAINER');
    e2.store.createNode('C_ENT_CONTAINER');
    const p1 = planSignature(e1.analyze('crie dois botões dentro da caixa').plan);
    const p2 = planSignature(e2.analyze('crie dois botões dentro da caixa').plan);
    expect(p1).toBe(p2);
  });

  it('usa IDs determinísticos (não Math.random)', () => {
    const e = engine();
    const plan = e.analyze('crie um botão').plan;
    expect(plan.steps[0].kind).toBe('CREATE_NODE');
    if (plan.steps[0].kind === 'CREATE_NODE') {
      expect(plan.steps[0].tempId).toBe('tmp_1');
      expect(plan.steps[0].stepId).toBe('step_1');
    }
  });
});

describe('ConstraintValidator', () => {
  it('bloqueia botão dentro de botão (não pode conter filhos)', () => {
    const e = engine();
    const plan = e.analyze('crie um botão dentro de um botão').plan;
    expect(plan.diagnostics.some((d) => d.code === 'INVALID_CONTAINMENT')).toBe(true);
  });

  it('bloqueia propriedade não aceita', () => {
    const e = engine();
    // TEXT aceita apenas C_PROP_TEXT_COLOR, não C_PROP_BG_COLOR.
    e.store.createNode('C_ENT_TEXT');
    const plan = e.analyze('deixe o fundo do texto para azul').plan;
    expect(plan.diagnostics.some((d) => d.code === 'INVALID_PROPERTY')).toBe(true);
  });

  it('não bloqueia containment válido', () => {
    const e = engine();
    const plan = e.analyze('crie um botão dentro de uma caixa').plan;
    expect(plan.diagnostics.filter((d) => d.severity === 'ERROR')).toHaveLength(0);
  });
});
