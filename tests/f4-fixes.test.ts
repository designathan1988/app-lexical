import { describe, it, expect } from 'vitest';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { treeSignature } from '../src/eval/signatures';
import type { Diagnostic } from '../src/engine/diagnostics';

/**
 * B1–B3, B8 — defeitos de diagnóstico apontados pelo auditor.
 *
 * Escritos ANTES da correção: o estado esperado é o comportamento correto,
 * não a saída atual.
 */

function engine(): SemanticEngine {
  return new SemanticEngine(createInitialKnowledgeBase());
}

const codes = (r: ReturnType<SemanticEngine['execute']>): string[] =>
  r.compile.diagnostics.map((d) => d.code);

function withButton(): SemanticEngine {
  const e = engine();
  e.store.createNode('C_ENT_BUTTON');
  return e;
}

describe('B1 — palavra desconhecida não vira NEGATED_ACTION', () => {
  it('"pague o botão": um ÚNICO UNKNOWN_WORD no verbo, com sugestões, sem NEGATED_ACTION', () => {
    const e = withButton();
    const r = e.execute('pague o botão');
    const unknown = r.compile.diagnostics.filter((d) => d.code === 'UNKNOWN_WORD');
    expect(unknown).toHaveLength(1);
    expect(unknown[0].start).toBe(0);
    expect(unknown[0].end).toBe(5);
    expect(unknown[0].message).toMatch(/apague|apagar/);
    expect(codes(r)).not.toContain('NEGATED_ACTION');
    expect(r.compile.ast.commands[0]?.kind === 'NO_OP' ? r.compile.ast.commands[0] : null).toEqual(
      expect.objectContaining({ reason: 'UNKNOWN_COMMAND' })
    );
    expect(treeSignature(e.store.document, e.knowledgeBase.concepts)).toBe('C_ENT_BUTTON{}');
  });

  it('"apgue o botão": erro aproximado bloqueado (destrutivo) com sugestão, sem apagar', () => {
    const e = withButton();
    const r = e.execute('apgue o botão');
    expect(r.success).toBe(false);
    expect(codes(r)).toContain('UNKNOWN_WORD');
    expect(codes(r)).not.toContain('NEGATED_ACTION');
    expect(treeSignature(e.store.document, e.knowledgeBase.concepts)).toBe('C_ENT_BUTTON{}');
  });

  it('"mva o botão para depois da caixa": um UNKNOWN_WORD, sem NEGATED_ACTION', () => {
    const e = engine();
    e.store.createNode('C_ENT_BUTTON');
    e.store.createNode('C_ENT_CONTAINER');
    const r = e.execute('mva o botão para depois da caixa');
    expect(r.compile.diagnostics.filter((d) => d.code === 'UNKNOWN_WORD')).toHaveLength(1);
    expect(codes(r)).not.toContain('NEGATED_ACTION');
  });
});

describe('B2 — um diagnóstico por problema, sem cascata', () => {
  it('"mude a cor de fundo do botão para 2px": um só INVALID_VALUE_CATEGORY e nenhuma cascata', () => {
    const e = withButton();
    const r = e.execute('mude a cor de fundo do botão para 2px');
    const errors = r.compile.diagnostics.filter((d) => d.severity === 'ERROR');
    expect(errors.map((d) => d.code)).toEqual(['INVALID_VALUE_CATEGORY']);
  });

  it('"apague o quinto botão" (1 botão): um só TARGET_NOT_FOUND, específico', () => {
    const e = withButton();
    const r = e.execute('apague o quinto botão');
    const notFound = r.compile.diagnostics.filter((d) => d.code === 'TARGET_NOT_FOUND');
    expect(notFound).toHaveLength(1);
    expect(notFound[0].message).toMatch(/5|quinto|posição/i);
  });

  it('"apague alguns botões": só o UNSUPPORTED_OPERATION do quantificador vago', () => {
    const e = engine();
    e.store.createNode('C_ENT_BUTTON');
    e.store.createNode('C_ENT_BUTTON');
    const r = e.execute('apague alguns botões');
    expect(codes(r)).toContain('UNSUPPORTED_OPERATION');
    expect(codes(r)).not.toContain('AMBIGUOUS_REFERENCE');
  });

  it('nenhum par de diagnósticos repete (code, start, end)', () => {
    const inputs = [
      'pague o botão',
      'mude a cor de fundo do botão para 2px',
      'apague o quinto botão',
      'apague alguns botões'
    ];
    for (const input of inputs) {
      const e = withButton();
      const r = e.execute(input);
      const seen = new Set<string>();
      for (const d of r.compile.diagnostics) {
        const key = `${d.code}|${d.start}|${d.end}`;
        expect(seen.has(key), `${input}: duplicata ${key}`).toBe(false);
        seen.add(key);
      }
    }
  });
});

describe('B3 — spans do sintagma e do comando', () => {
  interface SpanCase {
    input: string;
    seed?: number;
    code: string;
    /** Trecho que o span DEVE cobrir, exatamente como aparece na entrada. */
    spanText: string;
  }

  const CASES: SpanCase[] = [
    { input: 'apague o quinto botão', seed: 1, code: 'TARGET_NOT_FOUND', spanText: 'o quinto botão' },
    { input: 'pague o botão', seed: 1, code: 'UNKNOWN_WORD', spanText: 'pague' },
    { input: 'mude a cor de fundo do botão para 2px', seed: 1, code: 'INVALID_VALUE_CATEGORY', spanText: '2px' },
    { input: 'crie uma caixa que tem', code: 'UNSUPPORTED_OPERATION', spanText: 'que tem' },
    { input: 'deixe a caixa mais escura', seed: 1, code: 'UNSUPPORTED_OPERATION', spanText: 'mais escura' },
    { input: 'apague alguns botões', seed: 2, code: 'UNSUPPORTED_OPERATION', spanText: 'alguns' },
    { input: 'crie um botão e uma caixa pretas', code: 'AGREEMENT_MISMATCH', spanText: 'pretas' },
    { input: 'crie um botão rosa', code: 'UNKNOWN_WORD', spanText: 'rosa' },
    { input: 'crie um botão 2px', code: 'INVALID_PROPERTY', spanText: '2px' },
    { input: 'não apague o botão', seed: 1, code: 'NEGATED_ACTION', spanText: 'não apague o botão' },
    { input: 'mude o fundo do botão para 2px', seed: 1, code: 'INVALID_VALUE_CATEGORY', spanText: '2px' },
    { input: 'apague o sexto botão', seed: 1, code: 'TARGET_NOT_FOUND', spanText: 'o sexto botão' },
    { input: 'deixe o terceiro botão azul', seed: 1, code: 'TARGET_NOT_FOUND', spanText: 'o terceiro botão' },
    { input: 'crie uma caixa com um botão 2px', code: 'INVALID_PROPERTY', spanText: '2px' },
    { input: 'apague o botão mais à direita', seed: 2, code: 'ORDER_FALLBACK', spanText: 'mais à direita' }
  ];

  it('15 frases com span exato (start/end) do diagnóstico', () => {
    for (const c of CASES) {
      const e = engine();
      for (let i = 0; i < (c.seed ?? 0); i++) e.store.createNode('C_ENT_BUTTON');
      const r = e.execute(c.input);
      const match = r.compile.diagnostics.find((d: Diagnostic) => d.code === c.code);
      expect(match, `${c.input}: falta ${c.code} (obtidos: ${codes(r).join(',')})`).toBeDefined();
      const start = c.input.indexOf(c.spanText);
      expect(start, `${c.input}: trecho "${c.spanText}" não existe`).toBeGreaterThanOrEqual(0);
      expect(
        { start: match!.start, end: match!.end },
        `${c.input}: span de ${c.code} (trecho "${c.spanText}")`
      ).toEqual({ start, end: start + c.spanText.length });
    }
  });
});

describe('B8 — negação de valor e reflexivo', () => {
  it('"crie um botão azul e não vermelho": semântica definida (só azul), com INFO, sem UNCONSUMED_INPUT', () => {
    const e = engine();
    const r = e.execute('crie um botão azul e não vermelho');
    expect(r.success, JSON.stringify(r.compile.diagnostics)).toBe(true);
    expect(codes(r)).not.toContain('UNCONSUMED_INPUT');
    expect(treeSignature(e.store.document, e.knowledgeBase.concepts)).toBe(
      'C_ENT_BUTTON{C_PROP_BG_COLOR=#2563eb}'
    );
  });

  it('"mova a caixa para depois dela mesma": reflexivo é INVALID_CONTAINMENT, sem UNCONSUMED_INPUT', () => {
    const e = engine();
    e.store.createNode('C_ENT_CONTAINER');
    const r = e.execute('mova a caixa para depois dela mesma');
    expect(codes(r)).toContain('INVALID_CONTAINMENT');
    expect(codes(r)).not.toContain('UNCONSUMED_INPUT');
    expect(treeSignature(e.store.document, e.knowledgeBase.concepts)).toBe('C_ENT_CONTAINER{}');
  });
});
