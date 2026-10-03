import { describe, it, expect } from 'vitest';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { planSignature, treeSignature } from '../src/eval/signatures';

/**
 * Estrutura da oração — classes de equivalência (PROMPT.txt §35: "frases
 * semanticamente equivalentes produzem planos equivalentes").
 *
 * Nenhuma árvore aqui é escrita à mão para uma frase escolhida: cada teste
 * afirma que variações de ORDEM e de COORDENAÇÃO produzem o mesmo plano (ou
 * o mesmo documento final) que a forma canônica. Um parser que trate cada
 * ordem como caso especial não passa nestes testes, porque eles cobrem todas
 * as relações espaciais e todas as operações.
 */

type Seed = (e: SemanticEngine) => void;

const C = 'C_ENT_CONTAINER';
const B = 'C_ENT_BUTTON';
const T = 'C_ENT_TEXT';
const BG = 'C_PROP_BG_COLOR';
const TXT = 'C_PROP_TEXT_COLOR';
const BLACK = '#000000';
const BLUE = '#2563eb';
const RED = '#dc2626';

function engine(seed?: Seed): SemanticEngine {
  const e = new SemanticEngine(createInitialKnowledgeBase());
  seed?.(e);
  return e;
}

function run(input: string, seed?: Seed, discourse: string[] = []) {
  const e = engine(seed);
  for (const d of discourse) e.execute(d);
  const result = e.execute(input);
  return {
    e,
    result,
    ok: result.success,
    plan: planSignature(result.compile.plan),
    tree: treeSignature(e.store.document, e.knowledgeBase.concepts),
    errors: result.compile.diagnostics.filter((d) => d.severity === 'ERROR').map((d) => d.code)
  };
}

/** Executa comandos em sequência e devolve a árvore final. */
function sequential(inputs: string[], seed?: Seed): string {
  const e = engine(seed);
  for (const input of inputs) {
    const r = e.execute(input);
    expect(r.success, `${input}: ${JSON.stringify(r.compile.diagnostics)}`).toBe(true);
  }
  return treeSignature(e.store.document, e.knowledgeBase.concepts);
}

const oneBox: Seed = (e) => {
  e.store.createNode(C);
};

/** Formas contraídas de cada relação espacial da base, com "a caixa". */
const SPATIAL_PPS = [
  'dentro da caixa',
  'ao lado da caixa',
  'do lado da caixa',
  'depois da caixa',
  'antes da caixa',
  'em cima da caixa',
  'embaixo da caixa'
];

describe('Ordem dos constituintes — CREATE com sintagma espacial', () => {
  for (const pp of SPATIAL_PPS) {
    const canonical = `crie um botão azul ${pp}`;
    const variants = [
      `${pp}, crie um botão azul`,
      `${pp} crie um botão azul`,
      `crie ${pp} um botão azul`,
      `crie, ${pp}, um botão azul`,
      `adicione ${pp} um botão azul`,
      `você pode criar ${pp} um botão azul?`
    ];

    it(`"${pp}": variações de ordem produzem o mesmo plano que a forma canônica`, () => {
      const base = run(canonical, oneBox);
      expect(base.ok, `${canonical}: ${base.errors.join(',')}`).toBe(true);
      for (const variant of variants) {
        const v = run(variant, oneBox);
        expect(v.ok, `${variant}: ${v.errors.join(',')}`).toBe(true);
        expect(v.plan, variant).toBe(base.plan);
        expect(v.tree, variant).toBe(base.tree);
      }
    });
  }
});

describe('Ordem dos constituintes — MOVE, DELETE e UPDATE', () => {
  const boxAndButton: Seed = (e) => {
    e.store.createNode(C);
    e.store.createNode(B);
  };

  for (const pp of ['para dentro da caixa', 'para depois da caixa', 'para antes da caixa', 'para o lado da caixa']) {
    it(`MOVE "${pp}": destino antes ou depois do objeto é o mesmo plano`, () => {
      const base = run(`mova o botão ${pp}`, boxAndButton);
      expect(base.ok, base.errors.join(',')).toBe(true);
      for (const variant of [`mova ${pp} o botão`, `${pp}, mova o botão`]) {
        const v = run(variant, boxAndButton);
        expect(v.ok, `${variant}: ${v.errors.join(',')}`).toBe(true);
        expect(v.plan, variant).toBe(base.plan);
      }
    });
  }

  const boxWithButtonPlusLoose: Seed = (e) => {
    const box = e.store.createNode(C);
    const inside = e.store.createNode(B);
    e.store.place(inside, 'CHILD_OF', box);
    e.store.createNode(B);
  };

  it('DELETE: locativo topicalizado restringe a referência como o modificador pós-nominal', () => {
    const base = run('apague o botão dentro da caixa', boxWithButtonPlusLoose);
    expect(base.ok, base.errors.join(',')).toBe(true);
    for (const variant of ['dentro da caixa, apague o botão', 'apague o botão que está dentro da caixa']) {
      const v = run(variant, boxWithButtonPlusLoose);
      expect(v.ok, `${variant}: ${v.errors.join(',')}`).toBe(true);
      expect(v.plan, variant).toBe(base.plan);
    }
  });

  it('UPDATE: predicado antes do objeto é o mesmo plano ("pinte de azul o botão")', () => {
    const button: Seed = (e) => {
      e.store.createNode(B);
    };
    const base = run('pinte o botão de azul', button);
    expect(base.ok, base.errors.join(',')).toBe(true);
    for (const variant of ['pinte de azul o botão', 'mude para azul o botão', 'deixe o botão azul']) {
      const v = run(variant, button);
      expect(v.ok, `${variant}: ${v.errors.join(',')}`).toBe(true);
      expect(v.tree, variant).toBe(base.tree);
    }
  });
});

describe('Coordenação de argumentos — o predicado vale para todos os objetos', () => {
  const mixed: Seed = (e) => {
    const box = e.store.createNode(C);
    e.store.setProperty(box, BG, BLACK);
    const button = e.store.createNode(B);
    e.store.setProperty(button, BG, BLUE);
    const text = e.store.createNode(T);
    e.store.setProperty(text, TXT, RED);
  };

  const CASES: Array<[string, string[]]> = [
    ['apague a caixa preta e o botão azul', ['apague a caixa preta', 'apague o botão azul']],
    ['apague a caixa, o botão e o texto', ['apague a caixa', 'apague o botão', 'apague o texto']],
    ['pinte o botão e o texto de verde', ['pinte o botão de verde', 'pinte o texto de verde']],
    ['deixe a caixa e o botão vermelhos', ['deixe a caixa vermelha', 'deixe o botão vermelho']],
    [
      'mova o botão e o texto para dentro da caixa',
      ['mova o botão para dentro da caixa', 'mova o texto para dentro da caixa']
    ],
    ['mude a cor de fundo da caixa e do botão para verde', [
      'mude a cor de fundo da caixa para verde',
      'mude a cor de fundo do botão para verde'
    ]]
  ];

  for (const [coordinated, separate] of CASES) {
    it(`"${coordinated}" ≡ ${separate.map((s) => `"${s}"`).join(' + ')}`, () => {
      const expected = sequential(separate, mixed);
      const r = run(coordinated, mixed);
      expect(r.ok, `${coordinated}: ${r.errors.join(',')}`).toBe(true);
      expect(r.tree).toBe(expected);
    });
  }

  it('a frase coordenada é UMA transação: um único undo restaura tudo', () => {
    const r = run('apague a caixa, o botão e o texto', mixed);
    expect(r.ok).toBe(true);
    const before = sequential([], mixed);
    r.e.undo();
    expect(treeSignature(r.e.store.document, r.e.knowledgeBase.concepts)).toBe(before);
  });
});

describe('Coordenação com vírgula na criação', () => {
  it('"X, Y e Z" ≡ "X e Y e Z"', () => {
    const a = run('crie uma caixa, um botão e um texto');
    const b = run('crie uma caixa e um botão e um texto');
    expect(a.ok, a.errors.join(',')).toBe(true);
    expect(a.plan).toBe(b.plan);
  });

  it('adjetivo plural após lista com vírgula distribui para todos os núcleos', () => {
    const coordinated = run('crie uma caixa, um botão e um texto vermelhos');
    expect(coordinated.ok, coordinated.errors.join(',')).toBe(true);
    expect(coordinated.tree).toBe(
      sequential(['crie uma caixa vermelha', 'crie um botão vermelho', 'crie um texto vermelho'])
    );
  });

  it('vírgula antes de verbo separa comandos como "e"', () => {
    const a = run('crie uma caixa, crie um botão');
    const b = run('crie uma caixa e crie um botão');
    expect(a.ok, a.errors.join(',')).toBe(true);
    expect(a.plan).toBe(b.plan);
  });
});

describe('Clíticos com predicativo — todas as combinações de gênero e número', () => {
  const CASES: Array<[string, string, string]> = [
    ['crie um botão', 'deixe-o azul', 'deixe o botão azul'],
    ['crie uma caixa', 'deixe-a azul', 'deixe a caixa azul'],
    ['crie dois botões', 'deixe-os vermelhos', 'deixe os botões vermelhos'],
    ['crie duas caixas', 'deixe-as vermelhas', 'deixe as caixas vermelhas'],
    ['crie dois botões', 'pinte-os de verde', 'pinte os botões de verde']
  ];

  for (const [setup, clitic, explicit] of CASES) {
    it(`"${clitic}" ≡ "${explicit}" após "${setup}"`, () => {
      const a = run(clitic, undefined, [setup]);
      const b = run(explicit, undefined, [setup]);
      expect(a.ok, `${clitic}: ${a.errors.join(',')}`).toBe(true);
      expect(a.tree).toBe(b.tree);
    });
  }
});

describe('Modo verbal: só imperativo, infinitivo ou pedido indireto são comandos', () => {
  for (const form of ['cria', 'crie', 'criem', 'criar']) {
    it(`"${form} um botão" é comando`, () => {
      expect(run(`${form} um botão`).ok).toBe(true);
    });
  }
  for (const form of ['crio', 'criamos', 'criei', 'criou', 'criava', 'criaremos']) {
    it(`"${form} um botão" não é comando (UNSUPPORTED_OPERATION, nada criado)`, () => {
      const r = run(`${form} um botão`);
      expect(r.ok).toBe(false);
      expect(r.errors).toContain('UNSUPPORTED_OPERATION');
      expect(r.tree).toBe('');
    });
  }
});

describe('Encadeamento: entidade irmã referida por pronoun à primeira entidade', () => {
  for (const pp of ['ao lado dela', 'depois dela', 'antes dela']) {
    it(`"crie uma caixa vermelha com um botão azul dentro e um texto preto ${pp}"`, () => {
      const chained = run(`crie uma caixa vermelha com um botão azul dentro e um texto preto ${pp}`);
      expect(chained.ok, chained.errors.join(',')).toBe(true);
      const split = sequential([
        'crie uma caixa vermelha com um botão azul dentro',
        `crie um texto preto ${pp.replace('dela', 'da caixa')}`
      ]);
      expect(chained.tree).toBe(split);
    });
  }
});
