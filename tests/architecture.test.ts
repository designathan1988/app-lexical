import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SemanticEngine } from '../src/engine/SemanticEngine';
import { KnowledgeBaseStore } from '../src/knowledge/KnowledgeBaseStore';
import { createInitialKnowledgeBase } from '../src/knowledge/knowledgeBase';
import { treeSignature } from '../src/eval/signatures';
import { DEV_DATASET, REGRESSION_DATASET, FINAL_DATASET } from '../src/eval/loader';
import { runRecord } from '../src/eval/runner';

function read(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

// ---------------------------------------------------------------------------
// A1 — gramática como dados
// ---------------------------------------------------------------------------

describe('A1 — a gramática é dada, não escrita no parser', () => {
  it('DomainParser não compara palavras portuguesas literais', () => {
    const source = stripComments(read('src/engine/parser/DomainParser.ts'));

    // Nomes de tipo primitivo do TypeScript são permitidos; qualquer outro
    // literal minúsculo (palavra portuguesa) em comparação é proibido.
    const allowed = new Set(['string', 'number', 'boolean', 'object', 'function', 'undefined']);

    const patterns = [
      /[!=]==\s*'([a-záàâãéêíóôõúç]{2,})'/g,
      /\.has\(\s*'([a-záàâãéêíóôõúç]{2,})'\s*\)/g,
      /includes\(\s*'([a-záàâãéêíóôõúç]{2,})'\s*\)/g
    ];

    const offenders: string[] = [];
    for (const line of source.split('\n')) {
      const trimmed = line.trim();
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match = pattern.exec(trimmed);
        while (match) {
          if (!allowed.has(match[1])) offenders.push(`${trimmed}   [literal: '${match[1]}']`);
          match = pattern.exec(trimmed);
        }
      }
    }

    expect(offenders, `comparações com palavras portuguesas:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('adicionar "salvo" como EXCEPT via DADOS faz a frase funcionar', () => {
    const store = new KnowledgeBaseStore();
    const engine = new SemanticEngine(store.kb);

    for (let i = 0; i < 3; i++) engine.store.createNode('C_ENT_BUTTON');

    // Antes: "salvo" é conhecido (já cadastrado), mas removemos para provar.
    store.removeSurfaceForm('SF_SALVO');
    engine.knowledgeBase = store.kb;
    engine.rebuild();
    expect(engine.execute('apague todos os botões salvo o primeiro').success).toBe(false);

    // Depois: cadastrar apenas o DADO faz funcionar, sem tocar no parser.
    store.addSurfaceForm({
      id: 'SF_SALVO',
      rawText: 'salvo',
      lexemeId: 'LEX_SALVO',
      formType: 'CANONICAL'
    });
    engine.knowledgeBase = store.kb;
    engine.rebuild();

    engine.resetDocument();
    for (let i = 0; i < 3; i++) engine.store.createNode('C_ENT_BUTTON');

    const result = engine.execute('apague todos os botões salvo o primeiro');
    expect(result.success, JSON.stringify(result.compile.diagnostics)).toBe(true);
    expect(treeSignature(engine.store.document, engine.knowledgeBase.concepts)).toBe(
      'C_ENT_BUTTON{}'
    );
  });

  it('adicionar um novo ordinal via DADOS funciona sem tocar no parser', () => {
    const store = new KnowledgeBaseStore();
    const engine = new SemanticEngine(store.kb);

    engine.execute('crie cinco botões');
    // "quinto" já existe; usamos uma forma nova do mesmo ordinal.
    store.addSurfaceForm({
      id: 'SF_ORD_5_ALT',
      rawText: 'quintu',
      lexemeId: 'LEX_ORD_5',
      formType: 'MISSPELLING'
    });
    engine.knowledgeBase = store.kb;
    engine.rebuild();

    const result = engine.execute('apague o quintu botão');
    expect(result.success, JSON.stringify(result.compile.diagnostics)).toBe(true);
    expect(treeSignature(engine.store.document, engine.knowledgeBase.concepts).split('\n')).toHaveLength(4);
  });

  it('adicionar uma nova preposição espacial via DADOS funciona', () => {
    const store = new KnowledgeBaseStore();
    const engine = new SemanticEngine(store.kb);

    engine.store.createNode('C_ENT_CONTAINER');
    engine.store.createNode('C_ENT_BUTTON');

    store.addMultiword({
      id: 'MWE_TESTE',
      phrase: 'na frente de',
      conceptId: 'C_SPAT_AFTER'
    });
    engine.knowledgeBase = store.kb;
    engine.rebuild();

    const result = engine.execute('mova o botão na frente de uma caixa');
    void result;
    const result2 = engine.execute('coloque o botão na frente da caixa');
    expect(result2.success, JSON.stringify(result2.compile.diagnostics)).toBe(true);
  });

  it('o índice gramatical é derivado dos dados e cobre as classes exigidas', () => {
    const engine = new SemanticEngine(createInitialKnowledgeBase());
    const grammar = engine.compiler.grammarIndex;

    const operators = Array.from(grammar.wordsByOperator.keys());
    expect(operators).toContain('NEGATION');
    expect(operators).toContain('WITHOUT');
    expect(operators).toContain('EXCEPT');
    expect(operators).toContain('COMITATIVE');
    expect(operators).toContain('ALLATIVE');
    expect(operators).toContain('PARTITIVE');
    expect(operators).toContain('COORDINATION');
    expect(operators).toContain('DEFINITE_ARTICLE');
    expect(operators).toContain('INDEFINITE_ARTICLE');
    expect(operators).toContain('UNIVERSAL_QUANTIFIER');
    expect(operators).toContain('ALTERNATIVE_DETERMINER');

    // Ordinais e cardinais vêm de conceitos de valor, não de tabelas no código.
    expect(grammar.wordsByOperator.get('EXCEPT')).toContain('salvo');
  });
});

// ---------------------------------------------------------------------------
// D6 — analyze ≡ execute
// ---------------------------------------------------------------------------

describe('D6 — analyze é equivalente a execute em plano', () => {
  it('para toda frase do dataset, o plano de analyze casa com o de execute', () => {
    const all = [...DEV_DATASET.records, ...REGRESSION_DATASET.records, ...FINAL_DATASET.records];
    const mismatches: string[] = [];

    for (const record of all) {
      const engine = new SemanticEngine(createInitialKnowledgeBase());

      const ids: string[] = [];
      const build = (sn: NonNullable<typeof record.seed>[number], parentId: string | null): void => {
        const id = engine.store.createNode(sn.entityConceptId, sn.text);
        ids.push(id);
        if (parentId) engine.store.place(id, 'CHILD_OF', parentId);
        for (const c of sn.children ?? []) build(c, id);
      };
      for (const s of record.seed ?? []) build(s, null);

      for (const pre of record.discourse ?? []) engine.execute(pre);
      if (record.undoBeforeInput) engine.undo();

      if (typeof record.selection === 'number' && ids[record.selection]) {
        engine.store.setSelection([ids[record.selection]]);
      }

      const treeBefore = treeSignature(engine.store.document, engine.knowledgeBase.concepts);
      const analyzed = engine.analyze(record.input);
      const treeAfterAnalyze = treeSignature(engine.store.document, engine.knowledgeBase.concepts);

      if (treeBefore !== treeAfterAnalyze) {
        mismatches.push(`${record.id}: analyze mutou o documento`);
        continue;
      }

      const executed = engine.execute(record.input);

      const planA = analyzed.plan.steps
        .map((s) => JSON.stringify(s))
        .join('\n');
      const planE = executed.compile.plan.steps.map((s) => JSON.stringify(s)).join('\n');

      if (planA !== planE) {
        mismatches.push(`${record.id}: planos divergem\n  analyze: ${planA}\n  execute: ${planE}`);
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('analyze não altera o discurso', () => {
    const engine = new SemanticEngine(createInitialKnowledgeBase());
    engine.execute('crie uma caixa');
    const before = engine.discourseStats();

    engine.analyze('crie dois botões dentro dela');
    engine.analyze('apague a caixa');

    expect(engine.discourseStats()).toEqual(before);

    // E o discurso continua utilizável depois.
    const after = engine.execute('crie um botão dentro dela');
    expect(after.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// A5 — os nove códigos do §20
// ---------------------------------------------------------------------------

describe('A5 — os nove códigos de diagnóstico do §20 são emitidos', () => {
  const cases: Array<[string, string, () => { diagnostics: Array<{ code: string; layer: string; span?: unknown }> }]> = [
    [
      'UNKNOWN_WORD',
      'crie um botão rosa',
      () => {
        const e = new SemanticEngine(createInitialKnowledgeBase());
        return e.analyze('crie um botão rosa');
      }
    ],
    [
      'AMBIGUOUS_REFERENCE',
      'apague o botão (2 botões, sem discurso)',
      () => {
        const e = new SemanticEngine(createInitialKnowledgeBase());
        e.store.createNode('C_ENT_BUTTON');
        e.store.createNode('C_ENT_BUTTON');
        return e.analyze('apague o botão');
      }
    ],
    [
      'TARGET_NOT_FOUND',
      'apague o quinto botão',
      () => {
        const e = new SemanticEngine(createInitialKnowledgeBase());
        e.store.createNode('C_ENT_BUTTON');
        return e.analyze('apague o quinto botão');
      }
    ],
    [
      'INVALID_PROPERTY',
      'crie um botão 2px',
      () => new SemanticEngine(createInitialKnowledgeBase()).analyze('crie um botão 2px')
    ],
    [
      'INVALID_VALUE_CATEGORY',
      'mude a cor de fundo do botão para 2px',
      () => {
        const e = new SemanticEngine(createInitialKnowledgeBase());
        e.store.createNode('C_ENT_BUTTON');
        return e.analyze('mude a cor de fundo do botão para 2px');
      }
    ],
    [
      'INVALID_CONTAINMENT',
      'crie um botão dentro de um botão',
      () => new SemanticEngine(createInitialKnowledgeBase()).analyze('crie um botão dentro de um botão')
    ],
    [
      'UNRESOLVED_PRONOUN',
      'crie um botão ao lado dela',
      () => new SemanticEngine(createInitialKnowledgeBase()).analyze('crie um botão ao lado dela')
    ],
    [
      'UNSUPPORTED_OPERATION',
      'mova o botão',
      () => {
        const e = new SemanticEngine(createInitialKnowledgeBase());
        e.store.createNode('C_ENT_BUTTON');
        return e.analyze('mova o botão');
      }
    ]
  ];

  it.each(cases)('%s é emitido com camada e span', (code, label, run) => {
    const result = run();
    const diagnostic = result.diagnostics.find((d) => d.code === code);
    expect(diagnostic, `código ${code} ausente em «${label}»: ${result.diagnostics
      .map((d) => d.code)
      .join(', ')}`).toBeDefined();
    expect(diagnostic!.layer).toBeTypeOf('string');
    expect(diagnostic!.span, `${code} sem span`).toBeDefined();
  });

  it('AMBIGUOUS_SENSE é emitido quando o verbo é genuinamente ambíguo', () => {
    const e = new SemanticEngine(createInitialKnowledgeBase());
    // "coloque" sem complemento que decida entre criar e mover.
    const result = e.analyze('coloque');
    expect(result.diagnostics.map((d) => d.code)).toContain('AMBIGUOUS_SENSE');
  });

  it('todo diagnóstico de qualquer camada traz span dentro da entrada', () => {
    const inputs = [
      'crie um botão rosa',
      'crie um botão 2px',
      'mova o botão',
      'crie um botão dentro de um botão',
      'apague o quinto botão',
      'xyzzy quux'
    ];
    for (const input of inputs) {
      const e = new SemanticEngine(createInitialKnowledgeBase());
      const result = e.analyze(input);
      for (const d of result.diagnostics) {
        if (d.layer === 'engine') continue;
        expect(d.span, `${input} → ${d.code} sem span`).toBeDefined();
        expect(d.span!.start).toBeGreaterThanOrEqual(0);
        expect(d.span!.end).toBeLessThanOrEqual(input.length);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Segurança e invariantes estruturais
// ---------------------------------------------------------------------------

describe('Invariantes de segurança', () => {
  it('nenhum módulo do motor usa eval, new Function ou Math.random', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const text = stripComments(fs.readFileSync(full, 'utf8'));
        if (/\beval\s*\(/.test(text)) offenders.push(`${full}: eval`);
        if (/new\s+Function\s*\(/.test(text)) offenders.push(`${full}: new Function`);
        if (/Math\.random\s*\(/.test(text)) offenders.push(`${full}: Math.random`);
      }
    };
    for (const root of ['src/engine', 'src/builder', 'src/knowledge']) walk(root);
    expect(offenders).toEqual([]);
  });

  it('o motor nunca deixa uma exceção escapar', () => {
    const inputs = [
      'mude a cor de fundo do botão para 2px',
      'crie um botão 2px',
      '"',
      'crie',
      'apague',
      'deixe',
      'para',
      '',
      '   ',
      'crie um botão com um botão dentro',
      'mova a caixa para dentro de si mesma',
      'crie #fff',
      'deixe a borda com "x"',
      ';;;;',
      'apague todos os botões azuis menos',
      'crie 999999 botões'
    ];
    for (const input of inputs) {
      const e = new SemanticEngine(createInitialKnowledgeBase());
      expect(() => e.analyze(input), `analyze lançou em «${input}»`).not.toThrow();
      expect(() => e.execute(input), `execute lançou em «${input}»`).not.toThrow();
    }
  });

  it('nenhuma palavra fora do domínio gera mutação (60 palavras)', () => {
    const words = [
      'abacaxi', 'bicicleta', 'chuveiro', 'diamante', 'escada', 'flauta', 'girafa',
      'harmonia', 'iglu', 'jardim', 'karate', 'lampada', 'montanha', 'navio',
      'oceano', 'piano', 'quintal', 'relogio', 'sabonete', 'tapete', 'universo',
      'violino', 'xadrez', 'zebra', 'alface', 'borboleta', 'caderno', 'dicionario',
      'elefante', 'foguete', 'guitarra', 'horizonte', 'ilha', 'joia', 'kiwi',
      'limao', 'moeda', 'nuvem', 'ombro', 'papel', 'quimica', 'raio', 'sombra',
      'tigre', 'urso', 'vagao', 'whisky', 'yoga', 'zumbido', 'agulha', 'banana',
      'cebola', 'dado', 'esponja', 'farol', 'garfo', 'hotel', 'isqueiro', 'jaqueta',
      'lapis'
    ];
    const mutated: string[] = [];

    for (const word of words) {
      const e = new SemanticEngine(createInitialKnowledgeBase());
      e.store.createNode('C_ENT_BUTTON');
      const before = treeSignature(e.store.document, e.knowledgeBase.concepts);
      e.execute(word);
      const after = treeSignature(e.store.document, e.knowledgeBase.concepts);
      if (before !== after) mutated.push(word);
    }

    expect(mutated, `palavras que mutaram o documento: ${mutated.join(', ')}`).toEqual([]);
  });

  it('nenhuma ação destrutiva é resolvida por aproximação', () => {
    const distractors = ['apagxe', 'removx', 'exclux', 'deletx', 'tirx', 'movx', 'mudx'];
    const mutated: string[] = [];

    for (const verb of distractors) {
      const e = new SemanticEngine(createInitialKnowledgeBase());
      e.store.createNode('C_ENT_BUTTON');
      const before = treeSignature(e.store.document, e.knowledgeBase.concepts);
      e.execute(`${verb} o botão`);
      const after = treeSignature(e.store.document, e.knowledgeBase.concepts);
      if (before !== after) mutated.push(verb);
    }

    expect(mutated).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// A7 — dataset versionado
// ---------------------------------------------------------------------------

describe('A7 — dataset versionado', () => {
  it('os conjuntos têm o tamanho mínimo exigido', () => {
    expect(DEV_DATASET.records.length).toBeGreaterThanOrEqual(60);
    expect(REGRESSION_DATASET.records.length).toBeGreaterThanOrEqual(80);
    expect(FINAL_DATASET.records.length).toBeGreaterThanOrEqual(40);
  });

  it('contém os 14 casos obrigatórios, as 8 variações do §36 e a sequência do §38', () => {
    const inputs = new Set(REGRESSION_DATASET.records.map((r) => r.input));
    const mandatory = [
      'crie uma caixa azul com um botão vermelho dentro',
      'crie um botão dentro de uma caixa azul',
      'crie uma caixa e um botão ao lado dela',
      'crie dois botões dentro da caixa',
      'deixe a borda azul',
      'deixe a borda com 2px',
      'crie um botão sem borda',
      'não apague o botão',
      'apague o segundo botão',
      'mude o botão "Entrar" para azul',
      'mude o fundo do segundo botão para azul',
      'coloque o botão depois da caixa',
      'mova o botão de dentro da caixa para depois dela',
      'deixe todos os botões azuis menos o primeiro'
    ];
    for (const input of mandatory) {
      expect(inputs.has(input), `caso obrigatório ausente: ${input}`).toBe(true);
    }
  });

  it('contém ao menos 25 casos negativos e 10 genuinamente ambíguos', () => {
    const all = [...DEV_DATASET.records, ...REGRESSION_DATASET.records, ...FINAL_DATASET.records];
    expect(all.filter((r) => r.expectError).length).toBeGreaterThanOrEqual(25);
    expect(all.filter((r) => r.expected.ambiguous).length).toBeGreaterThanOrEqual(10);
  });

  it('cada caso cobre um dos defeitos D1–D11', () => {
    const tags = new Set(
      [...REGRESSION_DATASET.records, ...FINAL_DATASET.records].flatMap((r) => r.tags ?? [])
    );
    for (const defect of ['D1', 'D2', 'D3', 'D4', 'D5', 'D7', 'D8', 'D9', 'D10', 'D11']) {
      expect(tags.has(defect), `nenhum caso cobre ${defect}`).toBe(true);
    }
  });

  it('os registros carregam o esquema versionado', () => {
    for (const ds of [DEV_DATASET, REGRESSION_DATASET, FINAL_DATASET]) {
      expect(ds.version).toBeTypeOf('string');
      expect(ds.schemaVersion).toBe('1.0.0');
      for (const r of ds.records) {
        expect(r.id).toBeTypeOf('string');
        expect(r.input).toBeTypeOf('string');
        expect(r.expected).toBeTypeOf('object');
      }
    }
  });

  it('runRecord é resiliente a registro malformado', () => {
    const broken = { id: 'broken', input: 'crie uma caixa' } as never;
    expect(() => runRecord(createInitialKnowledgeBase(), broken)).not.toThrow();
  });
});
