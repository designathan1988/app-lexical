import { describe, it, expect } from 'vitest';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { planSignature, treeSignature } from '../src/eval/signatures';

/**
 * Mecanismos de discurso e de sintagma ainda ausentes — frases próprias.
 *
 * C — comandos coordenados enxergam as entidades criadas na MESMA frase.
 * D — núcleo compartilhado por determinantes coordenados ("a primeira e a
 *     terceira caixa").
 * B — predicativo sem preposição antes do objeto ("deixe vermelha a caixa").
 * E — plural nu sem quantidade não é criação ("crie caixas").
 * H — "gostaria de" + sintagma nominal = pedido de criação.
 * J — "com o texto «…»" numa entidade que não aceita conteúdo = filho TEXT.
 * K — "o/a outro/outra X" numa referência = o X distinto do saliente.
 * G — pronome plural retoma uma coordenação ("uma caixa e um botão" → "os").
 */

const C = 'C_ENT_CONTAINER';
const B = 'C_ENT_BUTTON';
const T = 'C_ENT_TEXT';

function engine(seed: string[] = []): SemanticEngine {
  const e = new SemanticEngine(createInitialKnowledgeBase());
  for (const concept of seed) e.store.createNode(concept);
  return e;
}

function run(input: string, opts: { seed?: string[]; discourse?: string[] } = {}) {
  const e = engine(opts.seed);
  for (const d of opts.discourse ?? []) {
    const r = e.execute(d);
    expect(r.success, `${d}: ${JSON.stringify(r.compile.diagnostics)}`).toBe(true);
  }
  const analyzed = planSignature(e.analyze(input).plan);
  const r = e.execute(input);
  return {
    ok: r.success,
    codes: r.compile.diagnostics.map((d) => d.code),
    plan: planSignature(r.compile.plan),
    analyzed,
    tree: treeSignature(e.store.document, e.knowledgeBase.concepts)
  };
}

describe('C — referência, na mesma frase, a entidades recém-criadas', () => {
  const CASES: Array<[string, string[], string]> = [
    ['adicione dois botões e deixe o primeiro verde', [], `${B}{C_PROP_BG_COLOR=#16a34a}\n${B}{}`],
    ['crie três caixas e apague a segunda', [], `${C}{}\n${C}{}`],
    ['crie uma caixa e coloque-a depois do texto', [T], `${T}{}\n${C}{}`],
    [
      'crie uma caixa e um botão e mova o botão para dentro da caixa',
      [],
      `${C}{}\n  ${B}{}`
    ]
  ];
  for (const [input, seed, tree] of CASES) {
    it(`"${input}"`, () => {
      const r = run(input, { seed });
      expect(r.ok, r.codes.join(',')).toBe(true);
      expect(r.tree).toBe(tree);
    });
  }

  it('analyze produz o mesmo plano que execute para frases com várias orações', () => {
    for (const [input, seed] of CASES) {
      const r = run(input, { seed });
      expect(r.analyzed, input).toBe(r.plan);
    }
  });

  it('uma frase com várias orações é UMA transação: um undo desfaz tudo', () => {
    const e = engine();
    e.execute('crie três caixas e apague a segunda');
    e.undo();
    expect(treeSignature(e.store.document, e.knowledgeBase.concepts)).toBe('');
  });
});

describe('D — núcleo compartilhado por determinantes coordenados', () => {
  it('"apague a primeira e a terceira caixa" deixa só a do meio', () => {
    const e = engine([C, C, C]);
    e.store.setProperty('node_2', 'C_PROP_BG_COLOR', '#16a34a');
    const r = e.execute('apague a primeira e a terceira caixa');
    expect(r.success, JSON.stringify(r.compile.diagnostics)).toBe(true);
    expect(treeSignature(e.store.document, e.knowledgeBase.concepts)).toBe(`${C}{C_PROP_BG_COLOR=#16a34a}`);
  });

  it('"pinte o primeiro e o segundo botão de azul"', () => {
    const r = run('pinte o primeiro e o segundo botão de azul', { seed: [B, B, B] });
    expect(r.ok, r.codes.join(',')).toBe(true);
    expect(r.tree).toBe(`${B}{C_PROP_BG_COLOR=#2563eb}\n${B}{C_PROP_BG_COLOR=#2563eb}\n${B}{}`);
  });
});

describe('B — predicativo sem preposição antes do objeto', () => {
  it('"deixe vermelha a caixa" ≡ "deixe a caixa vermelha"', () => {
    const a = run('deixe vermelha a caixa', { seed: [C] });
    const b = run('deixe a caixa vermelha', { seed: [C] });
    expect(a.ok, a.codes.join(',')).toBe(true);
    expect(a.tree).toBe(b.tree);
  });

  it('"deixe azuis os botões" ≡ "deixe os botões azuis"', () => {
    const a = run('deixe azuis os botões', { seed: [B, B] });
    const b = run('deixe os botões azuis', { seed: [B, B] });
    expect(a.ok, a.codes.join(',')).toBe(true);
    expect(a.tree).toBe(b.tree);
  });
});

describe('E — plural nu sem quantidade', () => {
  for (const input of ['crie caixas', 'adicione textos vermelhos']) {
    it(`"${input}" → UNSUPPORTED_OPERATION (quantos?), nada criado`, () => {
      const r = run(input);
      expect(r.ok).toBe(false);
      expect(r.codes).toContain('UNSUPPORTED_OPERATION');
      expect(r.tree).toBe('');
    });
  }
});

describe('H — "gostaria de" + sintagma nominal', () => {
  it('"gostaria de dois textos verdes" cria os dois textos', () => {
    const r = run('gostaria de dois textos verdes');
    expect(r.ok, r.codes.join(',')).toBe(true);
    expect(r.tree).toBe(`${T}{C_PROP_TEXT_COLOR=#16a34a}\n${T}{C_PROP_TEXT_COLOR=#16a34a}`);
  });
});

describe('J — "com o texto «…»" conforme a entidade aceite conteúdo', () => {
  it('caixa (não aceita conteúdo) ganha um TEXT filho', () => {
    const r = run('crie uma caixa com o texto "Olá mundo"');
    expect(r.ok, r.codes.join(',')).toBe(true);
    expect(r.tree).toBe(`${C}{}\n  ${T}"Olá mundo"{}`);
  });

  it('botão (aceita conteúdo) recebe o texto', () => {
    const r = run('crie um botão com o texto "Enviar"');
    expect(r.ok, r.codes.join(',')).toBe(true);
    expect(r.tree).toBe(`${B}"Enviar"{}`);
  });
});

describe('K — "a outra X" numa referência', () => {
  it('destino de MOVE: a caixa distinta da saliente', () => {
    const r = run('mova o botão para dentro da outra caixa', {
      seed: [C, C, B],
      discourse: ['pinte a primeira caixa de azul']
    });
    expect(r.ok, r.codes.join(',')).toBe(true);
    expect(r.tree).toBe(`${C}{C_PROP_BG_COLOR=#2563eb}\n${C}{}\n  ${B}{}`);
  });
});

describe('G — pronome plural retoma uma coordenação', () => {
  it('"pinte-os de verde" depois de "crie uma caixa e um botão"', () => {
    const r = run('pinte-os de verde', { discourse: ['crie uma caixa e um botão'] });
    expect(r.ok, r.codes.join(',')).toBe(true);
    expect(r.tree).toBe(`${C}{C_PROP_BG_COLOR=#16a34a}\n${B}{C_PROP_BG_COLOR=#16a34a}`);
  });

  it('"apague-as" depois de "crie uma caixa e outra caixa"', () => {
    const r = run('apague-as', { discourse: ['crie uma caixa e outra caixa'] });
    expect(r.ok, r.codes.join(',')).toBe(true);
    expect(r.tree).toBe('');
  });
});
