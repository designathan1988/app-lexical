import { describe, it, expect } from 'vitest';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import type { SemanticDocumentAst } from '../src/engine/ast/ast';

function analyze(input: string): SemanticDocumentAst {
  const engine = new SemanticEngine(createInitialKnowledgeBase());
  return engine.analyze(input).ast;
}

describe('Parser — estrutura e direção do containment', () => {
  it('produz BUTTON CHILD_OF CONTAINER, nunca o inverso', () => {
    const ast = analyze('crie um botão dentro de uma caixa azul');
    const cmd = ast.commands[0];
    expect(cmd.kind).toBe('CREATE');
    if (cmd.kind !== 'CREATE') return;
    expect(cmd.entities.map((e) => e.entityConceptId)).toEqual([
      'C_ENT_BUTTON',
      'C_ENT_CONTAINER'
    ]);
    expect(cmd.placements[0].relationConceptId).toBe('C_SPAT_INSIDE');
    const source = cmd.placements[0].source;
    const target = cmd.placements[0].target;
    expect(source.kind).toBe('NEW_ENTITY');
    expect(target.kind).toBe('NEW_ENTITY');
    if (source.kind === 'NEW_ENTITY' && target.kind === 'NEW_ENTITY') {
      const button = cmd.entities.find((e) => e.tempId === source.tempId)!;
      const container = cmd.entities.find((e) => e.tempId === target.tempId)!;
      expect(button.entityConceptId).toBe('C_ENT_BUTTON');
      expect(container.entityConceptId).toBe('C_ENT_CONTAINER');
    }
  });

  it('com = containment implícito', () => {
    const ast = analyze('crie uma caixa azul com um botão vermelho dentro');
    const cmd = ast.commands[0];
    expect(cmd.kind).toBe('CREATE');
    if (cmd.kind !== 'CREATE') return;
    expect(cmd.placements[0].relationConceptId).toBe('C_SPAT_INSIDE');
    const container = cmd.entities.find((e) => e.entityConceptId === 'C_ENT_CONTAINER')!;
    expect(container.mutations).toHaveLength(1);
    expect(container.mutations[0]).toMatchObject({
      kind: 'SET',
      propertyConceptId: 'C_PROP_BG_COLOR',
      value: { category: 'COLOR', literal: '#2563eb' }
    });
  });
});

describe('Parser — quantidade', () => {
  it('produz quantidade > 1 na AST', () => {
    const ast = analyze('crie três botões');
    const cmd = ast.commands[0];
    if (cmd.kind !== 'CREATE') throw new Error('expected CREATE');
    expect(cmd.entities[0].quantity).toBe(3);
  });

  it('plural sem numeral não vira quantidade', () => {
    const ast = analyze('crie botões');
    const cmd = ast.commands[0];
    if (cmd.kind !== 'CREATE') throw new Error('expected CREATE');
    expect(cmd.entities[0].quantity).toBe(1);
  });
});

describe('Parser — ordinal', () => {
  it('segundo → ordinalIndex 1', () => {
    const ast = analyze('apague o segundo botão');
    const cmd = ast.commands[0];
    expect(cmd.kind).toBe('DELETE');
    if (cmd.kind !== 'DELETE' || cmd.target.kind !== 'SELECTOR') return;
    expect(cmd.target.selector.ordinalIndex).toBe(1);
    expect(cmd.target.selector.entityConceptId).toBe('C_ENT_BUTTON');
  });
});

describe('Parser — negação', () => {
  it('não apague → NO_OP (escopo sobre a ação)', () => {
    const ast = analyze('não apague o botão');
    expect(ast.commands[0]).toMatchObject({ kind: 'NO_OP', reason: 'NEGATED_ACTION' });
  });

  it('sem borda → CLEAR do grupo (escopo sobre a propriedade)', () => {
    const ast = analyze('crie um botão azul sem borda');
    const cmd = ast.commands[0];
    if (cmd.kind !== 'CREATE') throw new Error('expected CREATE');
    const btn = cmd.entities[0];
    const clear = btn.mutations.find((m) => m.kind === 'CLEAR');
    expect(clear).toMatchObject({ kind: 'CLEAR', propertyGroupId: 'C_PROP_GROUP_BORDER' });
  });
});

describe('Parser — exclusão', () => {
  it('menos o primeiro → exclusion no selector', () => {
    const ast = analyze('deixe todos os botões azuis menos o primeiro');
    const cmd = ast.commands[0];
    expect(cmd.kind).toBe('UPDATE');
    if (cmd.kind !== 'UPDATE' || cmd.target.kind !== 'SELECTOR') return;
    expect(cmd.target.selector.quantity).toEqual({ mode: 'ALL' });
    expect(cmd.target.selector.exclusions).toHaveLength(1);
    expect(cmd.target.selector.exclusions![0].ordinalIndex).toBe(0);
  });
});

describe('Parser — pronomes (coreferência)', () => {
  it('ela resolve para a caixa (FEM)', () => {
    const ast = analyze('crie uma caixa e um botão ao lado dela');
    const cmd = ast.commands[0];
    if (cmd.kind !== 'CREATE') throw new Error('expected CREATE');
    const placement = cmd.placements[0];
    expect(placement.relationConceptId).toBe('C_SPAT_BESIDE');
    expect(placement.source.kind).toBe('NEW_ENTITY');
    expect(placement.target.kind).toBe('NEW_ENTITY');
    const placementTarget = placement.target;
    if (placementTarget.kind === 'NEW_ENTITY') {
      const target = cmd.entities.find((e) => e.tempId === placementTarget.tempId)!;
      expect(target.entityConceptId).toBe('C_ENT_CONTAINER');
    }
  });

  it('pronome sem antecedente → erro', () => {
    const engine = new SemanticEngine(createInitialKnowledgeBase());
    const res = engine.analyze('crie um botão ao lado dela');
    expect(res.diagnostics.some((d) => d.code === 'UNRESOLVED_PRONOUN')).toBe(true);
  });
});

describe('Property binding', () => {
  it('borda azul → borderColor', () => {
    const ast = analyze('deixe a borda azul');
    const cmd = ast.commands[0];
    if (cmd.kind !== 'UPDATE') throw new Error('expected UPDATE');
    expect(cmd.mutations[0]).toMatchObject({
      kind: 'SET',
      propertyConceptId: 'C_PROP_BORDER_COLOR',
      value: { category: 'COLOR', literal: '#2563eb' }
    });
  });

  it('borda 2px → borderWidth', () => {
    const ast = analyze('deixe a borda com 2px');
    const cmd = ast.commands[0];
    if (cmd.kind !== 'UPDATE') throw new Error('expected UPDATE');
    expect(cmd.mutations[0]).toMatchObject({
      kind: 'SET',
      propertyConceptId: 'C_PROP_BORDER_WIDTH',
      value: { category: 'SIZE', literal: '2px' }
    });
  });

  it('fundo azul → backgroundColor (propriedade explícita)', () => {
    const ast = analyze('deixe o fundo azul');
    const cmd = ast.commands[0];
    if (cmd.kind !== 'UPDATE') throw new Error('expected UPDATE');
    expect(cmd.mutations[0]).toMatchObject({ propertyConceptId: 'C_PROP_BG_COLOR' });
  });

  it('botão azul → backgroundColor (binding padrão do BUTTON)', () => {
    const ast = analyze('mude o botão para azul');
    const cmd = ast.commands[0];
    if (cmd.kind !== 'UPDATE') throw new Error('expected UPDATE');
    expect(cmd.mutations[0]).toMatchObject({ propertyConceptId: 'C_PROP_BG_COLOR' });
  });
});

describe('Parser — ação ambígua (colocar)', () => {
  it('colocar + indefinido → CREATE', () => {
    const ast = analyze('coloque dois botões');
    expect(ast.commands[0].kind).toBe('CREATE');
  });

  it('colocar + definido → MOVE', () => {
    const ast = analyze('coloque o botão depois da caixa');
    expect(ast.commands[0].kind).toBe('MOVE');
  });
});
