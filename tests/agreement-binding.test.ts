import { describe, it, expect } from 'vitest';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { treeSignature } from '../src/eval/signatures';

/**
 * Concordância nominal e ligação de pronomes — mecanismos gerais.
 *
 * Concordância: adjetivo que não concorda em gênero OU número com o seu
 * núcleo é AGREEMENT_MISMATCH e nada é executado (restrição rígida, PARTE IV
 * 3.F). Vale para o atributo na criação, o predicativo na atualização e o
 * filtro na referência. Valores uniformes em gênero ("azul", "verde") só
 * concordam em número.
 *
 * Ligação (Princípio B): o pronome de um sintagma espacial não pode ter como
 * antecedente a própria entidade que está sendo posicionada.
 */

function run(input: string, discourse: string[] = []) {
  const e = new SemanticEngine(createInitialKnowledgeBase());
  for (const d of discourse) {
    const r = e.execute(d);
    expect(r.success, `${d}: ${JSON.stringify(r.compile.diagnostics)}`).toBe(true);
  }
  const before = treeSignature(e.store.document, e.knowledgeBase.concepts);
  const r = e.execute(input);
  return {
    ok: r.success,
    codes: r.compile.diagnostics.map((d) => d.code),
    before,
    tree: treeSignature(e.store.document, e.knowledgeBase.concepts)
  };
}

describe('Concordância do adjetivo com o próprio núcleo', () => {
  const MISMATCH: Array<[string, string[]]> = [
    ['crie um texto vermelha', []],
    ['crie uma caixa amarelo', []],
    ['crie três caixas vermelhos', []],
    ['crie dois botões preta', []],
    ['deixe a caixa pretos', ['crie uma caixa']],
    ['deixe as caixas preta', ['crie duas caixas']],
    ['deixe o botão amarelas', ['crie um botão']],
    ['apague o botão amarela', ['crie um botão amarelo']]
  ];
  for (const [input, discourse] of MISMATCH) {
    it(`"${input}" → AGREEMENT_MISMATCH, documento intacto`, () => {
      const r = run(input, discourse);
      expect(r.ok).toBe(false);
      expect(r.codes).toContain('AGREEMENT_MISMATCH');
      expect(r.tree).toBe(r.before);
    });
  }

  const AGREE: Array<[string, string[]]> = [
    ['crie um texto vermelho', []],
    ['crie uma caixa amarela', []],
    ['crie três caixas vermelhas', []],
    ['crie uma caixa azul', []],
    ['crie duas caixas azuis', []],
    ['crie um botão verde', []],
    ['deixe as caixas pretas', ['crie duas caixas']],
    ['deixe a caixa e o botão pretos', ['crie uma caixa', 'crie um botão']],
    ['crie uma caixa e um botão vermelhos', []],
    ['crie uma caixa com um botão preta', []],
    ['apague o botão amarelo', ['crie um botão amarelo']]
  ];
  for (const [input, discourse] of AGREE) {
    it(`"${input}" concorda e executa`, () => {
      const r = run(input, discourse);
      expect(r.ok, r.codes.join(',')).toBe(true);
      expect(r.codes).not.toContain('AGREEMENT_MISMATCH');
    });
  }
});

describe('Ligação: o pronome não se liga à entidade que está sendo posicionada', () => {
  it('"crie um botão ao lado dele" sem antecedente → UNRESOLVED_PRONOUN', () => {
    const r = run('crie um botão ao lado dele');
    expect(r.ok).toBe(false);
    expect(r.codes).toContain('UNRESOLVED_PRONOUN');
  });

  it('"crie outra caixa depois dela" → a nova caixa vai depois da anterior', () => {
    const r = run('crie outra caixa depois dela', ['crie uma caixa amarela']);
    expect(r.ok, r.codes.join(',')).toBe(true);
    expect(r.tree).toBe('C_ENT_CONTAINER{C_PROP_BG_COLOR=#eab308}\nC_ENT_CONTAINER{}');
  });

  it('"adicione um texto antes dele" → antecedente é o botão já existente, não o texto novo', () => {
    const r = run('adicione um texto antes dele', ['crie um botão']);
    expect(r.ok, r.codes.join(',')).toBe(true);
    expect(r.tree).toBe('C_ENT_TEXT{}\nC_ENT_BUTTON{}');
  });

  it('"crie uma caixa com um botão dentro dela" continua ligando à caixa (outra entidade)', () => {
    const r = run('crie uma caixa com um botão dentro dela');
    expect(r.ok, r.codes.join(',')).toBe(true);
    expect(r.tree).toBe('C_ENT_CONTAINER{}\n  C_ENT_BUTTON{}');
  });
});
