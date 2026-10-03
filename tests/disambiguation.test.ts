import { describe, it, expect } from 'vitest';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { Disambiguator, type DisambiguationRule } from '../src/engine/syntax/Disambiguator';
import type { SemanticToken } from '../src/engine/parser/SemanticToken';

function analyze(input: string, discourse: string[] = []) {
  const e = new SemanticEngine(createInitialKnowledgeBase());
  for (const d of discourse) e.execute(d);
  return e.analyze(input);
}

const posOf = (token: SemanticToken) => [...new Set(token.candidates.map((c) => c.pos))].sort();

describe('Desambiguação por restrições — regras da base', () => {
  it('clítico de ênclise fica só com a leitura de pronome (DIS-CLITIC-PRONOUN)', () => {
    const r = analyze('deixe-os vermelhos', ['crie dois botões']);
    const clitic = r.trace.semanticTokens[1];
    expect(posOf(clitic)).toEqual(['PRONOUN']);
    expect(r.trace.disambiguation?.some((a) => a.ruleId === 'DIS-CLITIC-PRONOUN' && a.tokenIndex === 1)).toBe(
      true
    );
  });

  it('artigo antes de núcleo nominal perde leituras de pronome', () => {
    const r = analyze('apague os botões', ['crie dois botões']);
    expect(posOf(r.trace.semanticTokens[1])).not.toContain('PRONOUN');
  });

  it('o trace registra cada aplicação com id, token e leituras removidas', () => {
    const r = analyze('deixe-os vermelhos', ['crie dois botões']);
    for (const app of r.trace.disambiguation ?? []) {
      expect(app.ruleId).toMatch(/^DIS-/);
      expect(app.removed).toBeGreaterThan(0);
    }
  });
});

describe('Desambiguador — garantias do formalismo', () => {
  const kb = createInitialKnowledgeBase();
  const token = (pos: string[]): SemanticToken => ({
    rawTokens: [{ type: 'WORD', raw: 'x', normalized: 'x', start: 0, end: 1 }],
    span: { start: 0, end: 1 },
    candidates: pos.map((p) => ({ conceptId: '', score: 1, source: 'EXACT' as const, pos: p as never }))
  });

  it('nunca remove a última leitura', () => {
    const rule: DisambiguationRule = { id: 'R', action: 'REMOVE', target: { pos: ['NOUN'] }, conditions: [] };
    const out = new Disambiguator([rule], kb.concepts).run([token(['NOUN'])]);
    expect(out.tokens[0].candidates).toHaveLength(1);
    expect(out.applications).toEqual([]);
  });

  it('SELECT mantém só as leituras-alvo; condição negada e fronteira funcionam', () => {
    const rule: DisambiguationRule = {
      id: 'R',
      action: 'SELECT',
      target: { pos: ['VERB'] },
      conditions: [{ offset: -1, test: { boundary: 'START' } }, { offset: 1, test: { pos: ['VERB'] }, negate: true }]
    };
    const out = new Disambiguator([rule], kb.concepts).run([token(['VERB', 'NOUN']), token(['NOUN'])]);
    expect(out.tokens[0].candidates.map((c) => c.pos)).toEqual(['VERB']);
  });

  it('não altera a coorte original (o trace léxico continua íntegro)', () => {
    const original = [token(['VERB', 'NOUN'])];
    const rule: DisambiguationRule = { id: 'R', action: 'REMOVE', target: { pos: ['NOUN'] }, conditions: [] };
    new Disambiguator([rule], kb.concepts).run(original);
    expect(original[0].candidates).toHaveLength(2);
  });

  it('termina em ponto fixo dentro do teto de iterações', () => {
    const rules: DisambiguationRule[] = [
      { id: 'A', action: 'REMOVE', target: { pos: ['NOUN'] }, conditions: [] },
      { id: 'B', action: 'REMOVE', target: { pos: ['ADJECTIVE'] }, conditions: [] }
    ];
    const out = new Disambiguator(rules, kb.concepts).run([token(['NOUN', 'ADJECTIVE', 'VERB'])]);
    expect(out.iterations).toBeLessThanOrEqual(3);
    expect(out.tokens[0].candidates.map((c) => c.pos)).toEqual(['VERB']);
  });
});
